import { NextResponse } from 'next/server'
import { nudgeCustomerMessages } from '@/lib/customer-messages'
import { api, ApiError } from '@/lib/api'
import { orderCourierAccess } from '@/lib/access'
import { savePod } from '@/lib/pod'

const VALID_RESULTS = [
  'delivered',
  'no_answer',
  'refused',
  'wrong_address',
  'rescheduled',
  'closed',
  'other',
] as const

export const GET = api(async req => {
  const url = new URL(req.url)
  const orderId = url.searchParams.get('orderId')
  if (!orderId) throw new ApiError(400, 'orderId is required')

  const { db } = await orderCourierAccess(orderId)
  const { data: attempts, error } = await db
    .from('delivery_attempts')
    .select(`
      *,
      driver:driver_id(id, name, phone)
    `)
    .eq('order_id', orderId)
    .order('attempt_no', { ascending: true })

  if (error) throw new ApiError(500, error.message)
  return NextResponse.json({ success: true, attempts: attempts || [] })
})

export const POST = api(async req => {
  const body = await req.json()
  const {
    orderId,
    result,
    note,
    photo,
    lat,
    lng,
    rescheduledFor,
  } = body

  if (!orderId) throw new ApiError(400, 'orderId is required')
  if (!result || !VALID_RESULTS.includes(result)) {
    throw new ApiError(400, `result must be one of: ${VALID_RESULTS.join(', ')}`)
  }

  // The courier recorded is the order's own courier, never a name sent in the request
  const { db, order } = await orderCourierAccess(orderId)

  let photoPath: string | null = null
  if (photo) {
    photoPath = await savePod(db, orderId, photo, 'attempt')
  }

  const { data: rpcRes, error: rpcErr } = await db.rpc('record_delivery_attempt', {
    p_order_id: orderId,
    p_driver_id: (order.driver_id || undefined) as string,
    p_result: result,
    p_note: note || undefined,
    p_photo_path: photoPath || undefined,
    p_lat: lat != null ? Number(lat) : undefined,
    p_lng: lng != null ? Number(lng) : undefined,
    p_rescheduled_for: rescheduledFor || undefined,
  })

  if (rpcErr) throw new ApiError(500, rpcErr.message)

  nudgeCustomerMessages(req)
  return NextResponse.json({ success: true, attempt: rpcRes })
})
