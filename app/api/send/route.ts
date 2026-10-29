import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createServiceClient } from '@/lib/supabase/server'
import { rateLimit, clientIp } from '@/lib/rate-limit'
import { loadPricing } from '@/lib/pricing-server'
import { generateUniqueOrderCode } from '@/lib/order-codes'
import { formatLebanesePhone } from '@/lib/phone'
import { dispatchCustomerNotification } from '@/lib/messaging'

const SendParcelSchema = z.object({
  workspaceId: z.string().uuid().optional(),
  senderName: z.string().min(2, 'Sender name is required').max(100),
  senderPhone: z.string().min(6, 'Valid sender phone required').max(30),
  senderAddress: z.string().min(3, 'Pickup address is required').max(255),
  recipientName: z.string().min(2, 'Recipient name is required').max(100),
  recipientPhone: z.string().min(6, 'Valid recipient phone required').max(30),
  recipientAddress: z.string().min(3, 'Delivery address is required').max(255),
  areaId: z.string().uuid('Please select a delivery zone'),
  timeSlot: z.string().max(50).optional().nullable(),
  declaredValueUsd: z.number().min(0).max(10000).optional().nullable(),
  collectionUsd: z.number().min(0).max(10000).optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
  // Honeypot field for bot spam detection
  hp_website_check: z.string().optional().nullable(),
})

export async function POST(req: Request) {
  try {
    // 1. Rate limiting (max 15 submissions per minute per IP)
    const ip = clientIp(req as any)
    await rateLimit(`public_send_${ip}`, 15)

    const rawBody = await req.json()

    // 2. Honeypot spam trap
    if (rawBody.hp_website_check && rawBody.hp_website_check.trim().length > 0) {
      return NextResponse.json({ error: 'Spam detected' }, { status: 400 })
    }

    // 3. Schema validation
    const parsed = SendParcelSchema.safeParse(rawBody)
    if (!parsed.success) {
      const issue = parsed.error.issues[0]
      return NextResponse.json({ error: issue ? issue.message : 'Invalid order data' }, { status: 400 })
    }

    const body = parsed.data
    const db = createServiceClient()

    // 4. Resolve workspace (either explicit or system primary workspace)
    let workspaceId = body.workspaceId
    let usdToLbp = 89500

    if (workspaceId) {
      const { data: ws } = await db
        .from('workspaces')
        .select('id, usd_to_lbp')
        .eq('id', workspaceId)
        .single()
      if (!ws) {
        return NextResponse.json({ error: 'Workspace not found' }, { status: 404 })
      }
      usdToLbp = ws.usd_to_lbp
    } else {
      const { data: ws } = await db
        .from('workspaces')
        .select('id, usd_to_lbp')
        .order('created_at', { ascending: true })
        .limit(1)
        .single()
      if (!ws) {
        return NextResponse.json({ error: 'No active delivery workspace available' }, { status: 503 })
      }
      workspaceId = ws.id
      usdToLbp = ws.usd_to_lbp
    }

    // 5. Get or create Walk-in shop in this workspace
    const { data: walkinShopId, error: shopErr } = await db.rpc('get_or_create_walkin_shop', {
      p_workspace_id: workspaceId,
    })
    if (shopErr || !walkinShopId) {
      console.error('Walkin shop resolution error:', shopErr)
      return NextResponse.json({ error: 'Failed to initialize retail sender shop' }, { status: 500 })
    }

    // 6. Verify Area & Pricing
    const { data: area, error: areaErr } = await db
      .from('delivery_areas')
      .select('id, name, fee_usd, driver_pay_usd, default_driver_id')
      .eq('id', body.areaId)
      .eq('workspace_id', workspaceId)
      .eq('active', true)
      .single()

    if (areaErr || !area) {
      return NextResponse.json({ error: 'Invalid or inactive delivery zone' }, { status: 400 })
    }

    const pricing = await loadPricing(db, {
      workspaceId,
      areaId: area.id,
      shopId: walkinShopId,
    })

    const feeUsd = pricing.feeUsd || area.fee_usd || 3
    const payUsd = pricing.driverPayUsd || area.driver_pay_usd || 1

    // 7. Generate unique tracking code
    const code = await generateUniqueOrderCode(db, 'CD')

    // 8. Insert Order
    const formattedSenderPhone = formatLebanesePhone(body.senderPhone) || body.senderPhone.trim()
    const formattedRecipientPhone = formatLebanesePhone(body.recipientPhone) || body.recipientPhone.trim()

    const { data: order, error: insertErr } = await db
      .from('orders')
      .insert({
        workspace_id: workspaceId,
        code,
        shop_id: walkinShopId,
        area_id: area.id,
        driver_id: area.default_driver_id || null,
        status: 'pending',
        service_type: 'delivery',
        usd_to_lbp_rate: usdToLbp,
        sender_name: body.senderName.trim(),
        sender_phone: formattedSenderPhone,
        sender_address: body.senderAddress.trim(),
        recipient_name: body.recipientName.trim(),
        recipient_phone: formattedRecipientPhone,
        recipient_address: body.recipientAddress.trim(),
        time_slot: body.timeSlot || null,
        declared_value_usd: body.declaredValueUsd ?? null,
        collection_usd: body.collectionUsd ?? 0,
        delivery_fee_usd: feeUsd,
        driver_pay_usd: payUsd,
        notes: body.notes ? body.notes.trim() : null,
      })
      .select('id, code, tracking_token, delivery_fee_usd, collection_usd, status')
      .single()

    if (insertErr || !order) {
      console.error('Failed to insert walk-in parcel order:', insertErr)
      return NextResponse.json({ error: 'Failed to book parcel' }, { status: 500 })
    }

    // 9. Dispatch Customer Notification asynchronously
    const host = req.headers.get('host') || 'localhost:3000'
    const protocol = req.headers.get('x-forwarded-proto') || 'http'
    const trackUrl = `${protocol}://${host}/track/${order.tracking_token}`

    dispatchCustomerNotification({
      workspaceId,
      orderId: order.id,
      toPhone: formattedSenderPhone,
      template: 'order_created',
      params: {
        code: order.code,
        shop: 'Cedar Walk-in',
        track_url: trackUrl,
      },
    }).catch(err => console.warn('Customer notification background error:', err))

    return NextResponse.json({
      success: true,
      order: {
        id: order.id,
        code: order.code,
        trackingToken: order.tracking_token,
        trackingUrl: `/track/${order.tracking_token}`,
        deliveryFeeUsd: order.delivery_fee_usd,
        collectionUsd: order.collection_usd,
      },
    })
  } catch (err: unknown) {
    console.error('Error handling /api/send:', err)
    const msg = err instanceof Error ? err.message : 'Internal server error'
    const status = (err as any)?.status || 500
    return NextResponse.json({ error: msg }, { status })
  }
}
