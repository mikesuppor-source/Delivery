import { NextResponse } from 'next/server'
import { api, ApiError, uuid } from '@/lib/api'
import { callerOf, shopAccess, workspaceAccess } from '@/lib/access'
import { savePod } from '@/lib/pod'

export const GET = api(async req => {
  const url = new URL(req.url)
  const workspaceId = url.searchParams.get('workspaceId')
  const shopId = url.searchParams.get('shopId')

  if (!workspaceId && !shopId) {
    throw new ApiError(400, 'workspaceId or shopId is required')
  }

  // A shop sees its own returns; owners and managers see their company's
  const { db } = shopId ? await shopAccess(shopId) : await workspaceAccess(workspaceId)

  // First day of current month for "Returned this month"
  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

  let baseQuery = db
    .from('orders')
    .select(`
      id,
      code,
      shop_id,
      recipient_name,
      recipient_phone,
      recipient_address,
      collection_usd,
      delivery_fee_usd,
      driver_pay_usd,
      returns_handed_at,
      returns_signature_path,
      updated_at,
      shop:shop_id(id, name, phone)
    `)
    .eq('status', 'returned')

  if (workspaceId) {
    baseQuery = baseQuery.eq('workspace_id', workspaceId)
  }
  if (shopId) {
    baseQuery = baseQuery.eq('shop_id', shopId)
  }

  const { data: allReturned, error } = await baseQuery
  if (error) throw new ApiError(500, error.message)

  const returnedList = allReturned || []

  const pendingHandover = returnedList.filter(o => !o.returns_handed_at)
  const handedOverThisMonth = returnedList.filter(
    o => o.returns_handed_at && o.returns_handed_at >= startOfMonth
  )

  return NextResponse.json({
    success: true,
    pendingHandover,
    handedOverThisMonth,
    totalPendingCount: pendingHandover.length,
    totalThisMonthCount: handedOverThisMonth.length,
  })
})

export const POST = api(async req => {
  const body = await req.json()
  const { shopId, orderIds, signature } = body

  if (!shopId) throw new ApiError(400, 'shopId is required')
  if (!Array.isArray(orderIds) || orderIds.length === 0) {
    throw new ApiError(400, 'orderIds array is required')
  }

  // The parcels must be this shop's, and the caller must be their courier or an owner or manager of the company
  const caller = await callerOf()
  const db = caller.db
  const { data: shop } = await db.from('shops').select('id, workspace_id').eq('id', uuid(shopId, 'shop ID')).maybeSingle()
  if (!shop) throw new ApiError(404, 'Shop not found')
  const ids = orderIds.map((orderId: unknown) => uuid(orderId, 'order ID'))
  const { data: parcels } = await db.from('orders').select('id, shop_id, driver_id').in('id', ids)
  if (!parcels || parcels.length !== new Set(ids).size || parcels.some(p => p.shop_id !== shop.id)) throw new ApiError(400, 'Some of these orders do not belong to this shop')
  if (caller.driverId) {
    if (parcels.some(p => p.driver_id !== caller.driverId)) throw new ApiError(403, 'Some of these parcels are not yours')
  } else {
    await workspaceAccess(shop.workspace_id, ['owner', 'manager'], caller.user!)
  }

  let signaturePath: string | null = null
  if (signature) {
    signaturePath = await savePod(db, shopId, signature, 'return-signature')
  }

  const { data: rpcRes, error } = await db.rpc('handover_returns', {
    p_shop_id: shopId,
    p_order_ids: orderIds,
    p_signature_path: signaturePath || undefined,
  })

  if (error) throw new ApiError(500, error.message)

  return NextResponse.json({ success: true, result: rpcRes })
})
