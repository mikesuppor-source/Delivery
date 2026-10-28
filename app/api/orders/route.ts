import { NextResponse } from 'next/server'
import { api, ApiError, checked } from '@/lib/api'
import { flag, id, idList, ilikeAny, money, optionalId, parseBody, searchTerm, serviceType, text, weightKg, z } from '@/lib/validation'
import { authenticated, workspaceAccess, validateReferences } from '@/lib/access'
import { generateUniqueOrderCode, formatOrderCode } from '@/lib/order-codes'
import { ORDER_SELECT, orderPatch } from '@/lib/orders'
import { fulfillShopifyOrder } from '@/lib/shopify-fulfillment'
import { findBestDriverForArea } from '@/lib/auto-dispatch'
import { sendPushToDriver } from '@/lib/push'

const CreateOrder = z.object({
  workspaceId: id,
  shopId: optionalId,
  areaId: optionalId,
  driverId: z.union([id, z.literal('auto'), z.literal(''), z.null()]).optional(),
  autoAssign: z.boolean().optional(),
  code: text(60),
  collectionUsd: money(),
  deliveryFeeUsd: money(),
  driverPayUsd: money(),
  recipientName: text(200),
  recipientPhone: text(40),
  recipientAddress: text(1000),
  serviceType,
  weightKg,
  isBreakable: flag,
  paymentMethod: text(40),
  carrierName: text(100),
  carrierTrackingCode: text(100),
  destinationGovernorate: text(100),
  destinationCaza: text(100),
  destinationTown: text(100),
  notes: text(4000),
})
// Field-level rules for edits live in orderPatch (shared with the courier app)
const UpdateOrder = z.looseObject({ workspaceId: id, orderId: id, code: z.string().max(60).optional() })
const DeleteOrders = z.object({ workspaceId: id, orderIds: idList.optional(), orderId: id.optional() })
  .refine(b => b.orderIds || b.orderId, { message: 'Select between 1 and 200 records' })

export const GET = api(async req => {
  const { client } = await authenticated()
  const params = new URL(req.url).searchParams
  const search = searchTerm(params.get('search'))
  const page = Math.max(0, Math.floor(Number(params.get('page')) || 0))
  let query = client.from('orders').select(ORDER_SELECT, { count: 'exact' })
  if (search) {
    if (/^[a-f0-9]{64}$/i.test(search)) {
      query = query.eq('tracking_token', search.toLowerCase())
    } else {
      const codeClean = formatOrderCode(search)
      query = query.or(ilikeAny(['code'], codeClean || search) + ',' + ilikeAny(['recipient_name', 'recipient_phone', 'recipient_address'], search))
    }
  }
  const result = await query.order('created_at',{ascending:false}).order('id').range(page*100,page*100+99)
  const orders=checked(result)
  return NextResponse.json({ orders, count:result.count, page })
})
export const POST = api(async req => {
  const body=await parseBody(req, CreateOrder)
  const { db,user,workspaceId }=await workspaceAccess(body.workspaceId)
  let resolvedDriverId: string | null = (body.driverId && body.driverId !== 'auto') ? body.driverId : null
  if ((!resolvedDriverId && body.areaId && body.driverId === 'auto') || (body.autoAssign && body.areaId && !resolvedDriverId)) {
    resolvedDriverId = await findBestDriverForArea(db, workspaceId, body.areaId)
  }
  await validateReferences(db,workspaceId,{shops:body.shopId,drivers:resolvedDriverId,delivery_areas:body.areaId})
  const ws=checked(await db.from('workspaces').select('usd_to_lbp').eq('id',workspaceId).single())
  const code=body.code ? formatOrderCode(body.code) : await generateUniqueOrderCode(db,'CD')
  if (!code) throw new ApiError(400,'Invalid tracking code')
  const order=checked(await db.from('orders').insert({
    workspace_id:workspaceId,code,shop_id:body.shopId||null,driver_id:resolvedDriverId||null,area_id:body.areaId||null,
    status:resolvedDriverId?'assigned':'pending',usd_to_lbp_rate:ws.usd_to_lbp,
    collection_usd:body.collectionUsd,delivery_fee_usd:body.deliveryFeeUsd,
    driver_pay_usd:body.driverPayUsd,recipient_name:body.recipientName,
    recipient_phone:body.recipientPhone,recipient_address:body.recipientAddress,
    service_type:body.serviceType,
    weight_kg:body.weightKg,
    is_breakable:body.isBreakable,
    payment_method:body.paymentMethod || 'cash_usd',
    carrier_name:body.carrierName,
    carrier_tracking_code:body.carrierTrackingCode,
    destination_governorate:body.destinationGovernorate,
    destination_caza:body.destinationCaza,
    destination_town:body.destinationTown,
    notes:body.notes,created_by:user.id
  }).select(ORDER_SELECT).single())

  if (resolvedDriverId) {
    sendPushToDriver(resolvedDriverId, {
      title: 'Cedar Delivery — New Order',
      body: `New order #${order.code} assigned to you (${order.destination_town || order.recipient_address || 'Delivery'})`,
      url: `/driver/${resolvedDriverId}`,
      tag: `order-${order.code}`,
    }).catch(e => console.error('[Push Dispatch Error]:', e))
  }

  return NextResponse.json({success:true,order})
})
export const PATCH = api(async req => {
  const body=await parseBody(req, UpdateOrder)
  const {db,user,member,workspaceId}=await workspaceAccess(body.workspaceId,['owner','manager','driver'])
  const order=checked(await db.from('orders').select('*').eq('id',body.orderId).eq('workspace_id',workspaceId).single())
  if (!order) throw new ApiError(404,'Order not found')
  const isDriver=member.role==='driver'
  if(isDriver) {
    if(!order.driver_id)throw new ApiError(403,'Order is not assigned to you')
    const {data:driver}=await db.from('drivers').select('id').eq('id',order.driver_id).eq('user_id',user.id).eq('active',true).maybeSingle()
    if(!driver) throw new ApiError(403,'Order is not assigned to you')
  }
  const updates=orderPatch(body,order,isDriver)
  if(!isDriver && body.code!==undefined) {
    updates.code=formatOrderCode(body.code)
    if(!updates.code) throw new ApiError(400,'Invalid code')
  }
  await validateReferences(db,workspaceId,{drivers:updates.driver_id,delivery_areas:updates.area_id})
  const updated = checked(await db.from('orders').update(updates).eq('id',order.id).eq('workspace_id',workspaceId).select(ORDER_SELECT).maybeSingle())
  if(!updated) throw new ApiError(404,'Order not found or update could not be completed')
  if(updated.status === 'delivered') {
    fulfillShopifyOrder(db, order.id).catch(e => console.error('Shopify fulfillment sync failed:', e))
  }
  if (updates.driver_id && updates.driver_id !== order.driver_id) {
    sendPushToDriver(updates.driver_id, {
      title: 'Cedar Delivery — New Order Assigned',
      body: `Order #${updated.code} has been assigned to you (${updated.destination_town || updated.recipient_address || 'Delivery'})`,
      url: `/driver/${updates.driver_id}`,
      tag: `order-${updated.code}`,
    }).catch(e => console.error('[Push Dispatch Error]:', e))
  }
  return NextResponse.json({success:true,order:updated})
})
export const DELETE = api(async req => {
  const body=await parseBody(req, DeleteOrders)
  // STRICTLY REQUIRE 'owner' ROLE FOR PERMANENT RECORD DELETION!
  const {db,workspaceId,member}=await workspaceAccess(body.workspaceId,['owner'])
  if (member.role !== 'owner') {
    throw new ApiError(403, 'Forbidden: Only the workspace owner can delete records.')
  }

  const selected=body.orderIds || [body.orderId as string]
  const orders=checked(await db.from('orders').select('id,status,code').in('id',selected).eq('workspace_id',workspaceId))
  if (orders.length !== selected.length) throw new ApiError(404, 'One or more orders not found')

  const targetIds = orders.map(o => o.id)

  const client = db as any
  try {
    // 1. Authorize deletion via database session config
    await client.rpc('set_allow_owner_delete', { p_allow: true })

    // 2. Remove associated order events
    await client.from('order_events').delete().in('order_id', targetIds).eq('workspace_id', workspaceId)

    // 3. Remove attachments if any
    await client.from('order_attachments').delete().in('order_id', targetIds)

    // 4. Unlink money ledger entries to maintain accounting balance integrity without FK constraint errors
    await client.from('money_ledger').update({ order_id: null }).in('order_id', targetIds).eq('workspace_id', workspaceId)

    // 5. Unlink settlements
    await client.from('settlements').update({ order_id: null }).in('order_id', targetIds).eq('workspace_id', workspaceId)

    // 6. Delete the actual orders from the database
    const deleteResult = await client.from('orders').delete().in('id', targetIds).eq('workspace_id', workspaceId).select('id')
    const deleted = checked(deleteResult)

    const deletedList = Array.isArray(deleted) ? deleted : []

    return NextResponse.json({
      success: true,
      deletedIds: deletedList.map((o: any) => o.id),
      message: `Permanently deleted ${deletedList.length} order record(s) (Owner Action).`,
    })
  } finally {
    // Always reset deletion authorization
    await (client).rpc('set_allow_owner_delete', { p_allow: false })
  }
})
