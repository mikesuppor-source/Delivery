import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { formatLebanesePhone } from '@/lib/phone'

export async function GET(req: NextRequest) {
  return NextResponse.json({
    status: 'online',
    service: 'Cedar Delivery Shopify Webhook Gateway',
    documentation: 'Send POST requests to this endpoint with ?shop_key=YOUR_API_KEY from Shopify Settings -> Notifications -> Webhooks',
  })
}

export async function POST(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const queryShopKey = searchParams.get('shop_key')
    const headerShopKey = req.headers.get('x-cedar-shop-key')
    const shopifyDomain = req.headers.get('x-shopify-shop-domain')
    const shopifyTopic = req.headers.get('x-shopify-topic') || 'orders/create'

    const shopKey = queryShopKey || headerShopKey

    if (!shopKey && !shopifyDomain) {
      return NextResponse.json(
        { error: 'Missing shop identification. Provide ?shop_key=YOUR_API_KEY or configure your Shopify Store domain in Cedar.' },
        { status: 401 }
      )
    }

    const serviceClient = createServiceClient()

    // 1. Resolve shop record
    let query = serviceClient.from('shops').select('id, name, workspace_id, prefix, api_key, shopify_domain')
    if (shopKey) {
      query = query.eq('api_key', shopKey)
    } else if (shopifyDomain) {
      query = query.ilike('shopify_domain', `%${shopifyDomain.trim()}%`)
    }

    const { data: shop, error: shopErr } = await query.maybeSingle()

    if (shopErr || !shop) {
      return NextResponse.json(
        { error: 'Shop not found. Check your ?shop_key or register your Shopify domain in Cedar.' },
        { status: 404 }
      )
    }

    // 2. Parse Shopify Order JSON payload
    let payload: any = {}
    try {
      payload = await req.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON payload from Shopify' }, { status: 400 })
    }

    // Handle Shopify Webhook Verification / Test Pings
    const shopifyOrderId = String(payload.id || '')
    const shopifyOrderNumber = String(payload.order_number || payload.name || '').replace(/^#/, '')

    if (!shopifyOrderId || shopifyOrderId === '0' || payload.test === true) {
      return NextResponse.json({
        success: true,
        message: 'Shopify webhook verified successfully! Test ping received.',
        shop: shop.name,
      })
    }

    // 3. Check for idempotency (avoid duplicate orders if Shopify retries the webhook)
    const { data: existingOrder } = await serviceClient
      .from('orders')
      .select('id, code')
      .eq('shop_id', shop.id)
      .eq('shopify_order_id', shopifyOrderId)
      .maybeSingle()

    if (existingOrder) {
      return NextResponse.json({
        success: true,
        message: `Order #${shopifyOrderNumber} already imported into Cedar Delivery`,
        order_code: existingOrder.code,
        order_id: existingOrder.id,
      })
    }

    // 4. Fetch workspace rate & delivery areas for automatic zone matching
    const { data: workspace } = await serviceClient
      .from('workspaces')
      .select('id, usd_to_lbp')
      .eq('id', shop.workspace_id)
      .single()

    const exchangeRate = Number(workspace?.usd_to_lbp) || 89500

    const { data: areas } = await serviceClient
      .from('delivery_areas')
      .select('id, name, fee_usd, default_driver_id')
      .eq('workspace_id', shop.workspace_id)
      .eq('active', true)

    // 5. Extract Recipient Details from Shopify Address
    const shipping = payload.shipping_address || payload.billing_address || {}
    const customer = payload.customer || {}

    const recipientName = (
      shipping.name ||
      `${shipping.first_name || customer.first_name || ''} ${shipping.last_name || customer.last_name || ''}`
    ).trim() || 'Shopify Customer'

    const rawPhone = shipping.phone || customer.phone || payload.phone || ''
    const recipientPhone = formatLebanesePhone(rawPhone) || rawPhone

    // Build human-friendly Lebanese address string
    const addressParts = [
      shipping.address1,
      shipping.address2,
      shipping.city,
      shipping.province,
      shipping.country,
    ].filter(Boolean)

    const recipientAddress = addressParts.join(', ') || 'Address not specified in Shopify'

    // 6. Match destination delivery area
    const city = (shipping.city || '').toLowerCase().trim()
    const province = (shipping.province || '').toLowerCase().trim()

    let matchedArea = (areas || []).find(a => {
      const aName = a.name.toLowerCase()
      return city.includes(aName) || aName.includes(city) || province.includes(aName) || aName.includes(province)
    })

    const areaId = matchedArea?.id || null
    const deliveryFeeUsd = matchedArea ? Number(matchedArea.fee_usd) : 3.0
    const driverPayUsd = Math.max(1.0, deliveryFeeUsd - 1.0)
    const assignedDriverId = matchedArea?.default_driver_id || null

    // 7. Calculate Cash on Delivery (COD) Amount
    const totalPrice = parseFloat(payload.total_price || '0')
    const financialStatus = (payload.financial_status || '').toLowerCase()
    const gatewayNames: string[] = Array.isArray(payload.payment_gateway_names)
      ? payload.payment_gateway_names.map((g: any) => String(g).toLowerCase())
      : []

    const isCod =
      financialStatus === 'pending' ||
      financialStatus === 'authorized' ||
      gatewayNames.some(g => g.includes('cash') || g.includes('cod') || g.includes('manual'))

    // If paid online via card / credit, COD is 0
    const collectionUsd = isCod ? totalPrice : 0

    // 8. Extract item details for waybill note
    const lineItems = Array.isArray(payload.line_items) ? payload.line_items : []
    const itemsSummary = lineItems
      .slice(0, 4)
      .map((item: any) => `${item.quantity}x ${item.title}${item.variant_title ? ` (${item.variant_title})` : ''}`)
      .join(', ')

    const notesParts = [
      `Shopify #${shopifyOrderNumber}`,
      itemsSummary,
      payload.note ? `Note: ${payload.note}` : null,
      !isCod ? 'PREPAID ORDER ($0 COD)' : null,
    ].filter(Boolean)

    const notes = notesParts.join(' | ')

    // 9. Generate non-repeating unique Barcode Code (e.g. CED-SHOP-1045)
    const shopPrefix = (shop.prefix || shop.name.slice(0, 3)).toUpperCase().replace(/[^A-Z0-9]/g, '')
    const cleanNum = shopifyOrderNumber.replace(/\D/g, '') || Math.floor(1000 + Math.random() * 9000).toString()
    let code = `CED-${shopPrefix}-${cleanNum}`

    // Ensure uniqueness
    const { data: codeCheck } = await serviceClient
      .from('orders')
      .select('id')
      .eq('code', code)
      .maybeSingle()

    if (codeCheck) {
      code = `CED-${shopPrefix}-${cleanNum}-${Math.floor(10 + Math.random() * 89)}`
    }

    // 10. Insert order into Cedar Delivery
    const { data: newOrder, error: insertErr } = await serviceClient
      .from('orders')
      .insert({
        workspace_id: shop.workspace_id,
        shop_id: shop.id,
        code,
        status: assignedDriverId ? 'assigned' : 'pending',
        driver_id: assignedDriverId,
        area_id: areaId,
        recipient_name: recipientName,
        recipient_phone: recipientPhone,
        recipient_address: recipientAddress,
        collection_usd: collectionUsd,
        delivery_fee_usd: deliveryFeeUsd,
        driver_pay_usd: driverPayUsd,
        shop_balance_usd: Math.max(0, collectionUsd - deliveryFeeUsd),
        usd_to_lbp_rate: exchangeRate,
        notes,
        shopify_order_id: shopifyOrderId,
        shopify_order_number: `#${shopifyOrderNumber}`,
      })
      .select('id, code, status, collection_usd, recipient_name')
      .single()

    if (insertErr || !newOrder) {
      console.error('Error inserting Shopify order:', insertErr)
      return NextResponse.json({ error: insertErr?.message || 'Failed to create order' }, { status: 500 })
    }

    const host = req.headers.get('host') || 'delivery.cedar.local'
    const proto = req.headers.get('x-forwarded-proto') || 'https'
    const trackingUrl = `${proto}://${host}/track/${newOrder.code}`

    return NextResponse.json(
      {
        success: true,
        message: `Shopify Order #${shopifyOrderNumber} successfully scheduled with Cedar Delivery!`,
        order: {
          id: newOrder.id,
          code: newOrder.code,
          recipient: newOrder.recipient_name,
          collection_usd: newOrder.collection_usd,
          tracking_url: trackingUrl,
        },
      },
      { status: 201 }
    )
  } catch (err: unknown) {
    console.error('Shopify Webhook error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal webhook error' },
      { status: 500 }
    )
  }
}
