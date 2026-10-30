import { NextResponse } from 'next/server'
import { ApiError } from '@/lib/api'
import { apiV1, orderView, V1Error, V1_ORDER_SELECT } from '@/lib/api-v1'
import { generateUniqueOrderCode } from '@/lib/order-codes'
import { dispatchCustomerNotification } from '@/lib/messaging'
import { loadPricing } from '@/lib/pricing-server'
import { flag, id, money, parseBody, requiredText, serviceType, text, weightKg, z } from '@/lib/validation'

const STATUSES = ['pending', 'assigned', 'picked_up', 'delivered', 'failed', 'returned', 'cancelled']

const CreateOrder = z.object({
  reference: z.string().trim().min(1).max(100).optional(),
  zoneId: id.nullish(),
  recipient: z.object({ name: requiredText(200), phone: requiredText(40), address: requiredText(1000) }),
  codUsd: money(),
  serviceType,
  weightKg,
  isBreakable: flag,
  timeSlot: text(50),
  notes: text(4000),
})

/** POST /api/v1/orders: create one order for this shop. The delivery fee comes from the shop's own price for the zone. */
export const POST = apiV1(async ({ db, workspaceId, shop }, req) => {
  const body = await parseBody(req, CreateOrder)
  if (body.zoneId) {
    const { data: zone } = await db.from('delivery_areas').select('id').eq('id', body.zoneId).eq('workspace_id', workspaceId).eq('active', true).maybeSingle()
    if (!zone) throw new V1Error(400, 'invalid_request', 'Unknown zone. Use an id from GET /api/v1/zones.')
  }
  if (body.reference) {
    const { data: existing } = await db.from('orders').select('code').eq('shop_id', shop.id).eq('external_ref', body.reference).maybeSingle()
    if (existing) throw new V1Error(409, 'duplicate_reference', 'An order with this reference already exists.', { orderCode: existing.code })
  }
  const { data: ws } = await db.from('workspaces').select('usd_to_lbp').eq('id', workspaceId).single()
  const pricing = await loadPricing(db, { workspaceId, areaId: body.zoneId || null, shopId: shop.id })
  const code = await generateUniqueOrderCode(db, 'CD')
  const { data: order, error } = await db.from('orders').insert({
    workspace_id: workspaceId, shop_id: shop.id, code, status: 'pending', area_id: body.zoneId || null,
    usd_to_lbp_rate: ws?.usd_to_lbp ?? 89500, collection_usd: body.codUsd, delivery_fee_usd: pricing.feeUsd, driver_pay_usd: pricing.driverPayUsd,
    recipient_name: body.recipient.name, recipient_phone: body.recipient.phone, recipient_address: body.recipient.address,
    service_type: body.serviceType, weight_kg: body.weightKg, is_breakable: body.isBreakable, payment_method: 'cash_usd',
    time_slot: body.timeSlot || null, notes: body.notes, external_ref: body.reference ?? null,
  }).select(V1_ORDER_SELECT).single()
  if (error) {
    // Two requests with the same reference at once: the second one loses the race
    if (error.code === '23505' && body.reference) {
      const { data: existing } = await db.from('orders').select('code').eq('shop_id', shop.id).eq('external_ref', body.reference).maybeSingle()
      throw new V1Error(409, 'duplicate_reference', 'An order with this reference already exists.', { orderCode: existing?.code ?? null })
    }
    throw new ApiError(500, 'Order could not be saved')
  }
  const view = orderView(order)
  if (view.recipient.phone && view.trackingUrl) {
    dispatchCustomerNotification({
      workspaceId, orderId: order.id, toPhone: view.recipient.phone, template: 'order_created',
      params: { code: view.code, shop: shop.name, track_url: view.trackingUrl },
    }).catch(e => console.warn('[Customer Notification Error]:', e))
  }
  return NextResponse.json({ order: view }, { status: 201 })
})

/** GET /api/v1/orders?from&to&status&page&limit: this shop's orders, newest first. */
export const GET = apiV1(async ({ db, shop }, req) => {
  const params = new URL(req.url).searchParams
  const date = (name: string) => {
    const value = params.get(name)
    if (!value) return null
    const parsed = new Date(value)
    if (Number.isNaN(parsed.getTime())) throw new V1Error(400, 'invalid_request', `Invalid ${name}. Use an ISO date such as 2026-11-01.`)
    return parsed.toISOString()
  }
  const status = params.get('status')
  if (status && !STATUSES.includes(status)) throw new V1Error(400, 'invalid_request', 'Invalid status. Use one of: ' + STATUSES.join(', ') + '.')
  const limit = Math.min(100, Math.max(1, Math.floor(Number(params.get('limit')) || 50)))
  const page = Math.max(0, Math.floor(Number(params.get('page')) || 0))
  const from = date('from'), to = date('to')
  let query = db.from('orders').select(V1_ORDER_SELECT).eq('shop_id', shop.id)
  if (status) query = query.eq('status', status as 'pending')
  if (from) query = query.gte('created_at', from)
  if (to) query = query.lte('created_at', to)
  const { data, error } = await query.order('created_at', { ascending: false }).order('id').range(page * limit, page * limit + limit)
  if (error) throw new ApiError(500, 'Orders could not be read')
  return NextResponse.json({ orders: data.slice(0, limit).map(orderView), page, hasMore: data.length > limit })
})
