import { NextResponse } from 'next/server'
import { api, ApiError, checked, ids, money, textField, uuid } from '@/lib/api'
import { authenticated, workspaceAccess, validateReferences } from '@/lib/access'
import { generateUniqueOrderCode, formatOrderCode } from '@/lib/order-codes'
import { ORDER_SELECT, orderPatch } from '@/lib/orders'
import { fulfillShopifyOrder } from '@/lib/shopify-fulfillment'

export const GET = api(async req => {
  const { client } = await authenticated()
  const params = new URL(req.url).searchParams
  const search = textField(params.get('search'), 'search', 100)
  const page = Math.max(0, Math.floor(Number(params.get('page')) || 0))
  let query = client.from('orders').select(ORDER_SELECT, { count: 'exact' })
  if (search) {
    if (/^[a-f0-9]{64}$/i.test(search)) {
      query = query.eq('tracking_token', search.toLowerCase())
    } else {
      const codeClean = formatOrderCode(search)
      query = query.or(`code.ilike.%${codeClean || search}%,recipient_name.ilike.%${search}%,recipient_phone.ilike.%${search}%,recipient_address.ilike.%${search}%`)
    }
  }
  const result = await query.order('created_at',{ascending:false}).order('id').range(page*100,page*100+99)
  const orders=checked(result)
  return NextResponse.json({ orders, count:result.count, page })
})
export const POST = api(async req => {
  const body=await req.json()
  const { db,user,workspaceId }=await workspaceAccess(body.workspaceId)
  await validateReferences(db,workspaceId,{shops:body.shopId,drivers:body.driverId,delivery_areas:body.areaId})
  const ws=checked(await db.from('workspaces').select('usd_to_lbp').eq('id',workspaceId).single())
  const code=body.code ? formatOrderCode(textField(body.code,'code',60,true)) : await generateUniqueOrderCode(db,'CD')
  if (!code) throw new ApiError(400,'Invalid tracking code')
  const order=checked(await db.from('orders').insert({
    workspace_id:workspaceId,code,shop_id:body.shopId||null,driver_id:body.driverId||null,area_id:body.areaId||null,
    status:body.driverId?'assigned':'pending',usd_to_lbp_rate:ws.usd_to_lbp,
    collection_usd:money(body.collectionUsd,'collection'),delivery_fee_usd:money(body.deliveryFeeUsd,'delivery fee'),
    driver_pay_usd:money(body.driverPayUsd,'driver pay'),recipient_name:textField(body.recipientName,'recipient',200),
    recipient_phone:textField(body.recipientPhone,'phone',40),recipient_address:textField(body.recipientAddress,'address',1000),
    service_type:(body.serviceType === 'replacement' || body.serviceType === 'pickup') ? body.serviceType : 'delivery',
    weight_kg:Math.max(0.1, Number(body.weightKg) || 1.0),
    is_breakable:Boolean(body.isBreakable),
    payment_method:textField(body.paymentMethod, 'payment method', 40) || 'cash_usd',
    carrier_name:textField(body.carrierName, 'carrier name', 100),
    carrier_tracking_code:textField(body.carrierTrackingCode, 'carrier tracking code', 100),
    destination_governorate:textField(body.destinationGovernorate, 'governorate', 100),
    destination_caza:textField(body.destinationCaza, 'caza', 100),
    destination_town:textField(body.destinationTown, 'town', 100),
    notes:textField(body.notes,'notes',4000),created_by:user.id
  }).select(ORDER_SELECT).single())
  return NextResponse.json({success:true,order})
})
export const PATCH = api(async req => {
  const body=await req.json()
  const {db,user,member,workspaceId}=await workspaceAccess(body.workspaceId,['owner','manager','driver'])
  const order=checked(await db.from('orders').select('*').eq('id',uuid(body.orderId)).eq('workspace_id',workspaceId).single())
  if (!order) throw new ApiError(404,'Order not found')
  const isDriver=member.role==='driver'
  if(isDriver) {
    if(!order.driver_id)throw new ApiError(403,'Order is not assigned to you')
    const {data:driver}=await db.from('drivers').select('id').eq('id',order.driver_id).eq('user_id',user.id).eq('active',true).maybeSingle()
    if(!driver) throw new ApiError(403,'Order is not assigned to you')
  }
  const updates=orderPatch(body,order,isDriver)
  if(!isDriver && body.code!==undefined) updates.code=formatOrderCode(textField(body.code,'code',60,true))
  await validateReferences(db,workspaceId,{drivers:updates.driver_id,delivery_areas:updates.area_id})
  let updateResult = await db.from('orders').update(updates).eq('id',order.id).eq('workspace_id',workspaceId).select(ORDER_SELECT).maybeSingle()
  if (updateResult.error && (updateResult.error as any).code === '42703') {
    const safeUpdates: any = { ...updates }
    delete safeUpdates.pod_collected_usd
    delete safeUpdates.cash_discrepancy_usd
    delete safeUpdates.location_lat
    delete safeUpdates.location_lng
    updateResult = await db.from('orders').update(safeUpdates).eq('id',order.id).eq('workspace_id',workspaceId).select(ORDER_SELECT).maybeSingle()
  }
  const updated = checked(updateResult)
  if(!updated) throw new ApiError(404,'Order not found or update could not be completed')
  if(updated.status === 'delivered') {
    fulfillShopifyOrder(db, order.id).catch(e => console.error('Shopify fulfillment sync failed:', e))
  }
  return NextResponse.json({success:true,order:updated})
})
export const DELETE = api(async req => {
  const body=await req.json()
  const {db,workspaceId}=await workspaceAccess(body.workspaceId)
  const selected=ids(body.orderIds || [body.orderId])
  const orders=checked(await db.from('orders').select('id,status').in('id',selected).eq('workspace_id',workspaceId))
  if(orders.length!==selected.length || orders.some(o=>o.status!=='pending')) throw new ApiError(409,'Only pending orders can be cancelled. Completed records are retained.')
  const cancelled=checked(await db.from('orders').update({status:'cancelled'}).in('id',selected).eq('workspace_id',workspaceId).eq('status','pending').select('id'))
  return NextResponse.json({success:true,deletedIds:cancelled.map(o=>o.id),message:'Pending orders cancelled; records retained.'})
})
