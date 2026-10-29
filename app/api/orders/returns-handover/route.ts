import { NextResponse } from 'next/server'
import { api, ApiError } from '@/lib/api'
import { createServiceClient } from '@/lib/supabase/server'
import { savePod } from '@/lib/pod'

export const GET = api(async req => {
  const url = new URL(req.url)
  const workspaceId = url.searchParams.get('workspaceId')
  const shopId = url.searchParams.get('shopId')

  if (!workspaceId && !shopId) {
    throw new ApiError(400, 'workspaceId or shopId is required')
  }

  const db = createServiceClient()

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

  const db = createServiceClient()

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
