import { NextResponse } from 'next/server'
import { apiV1, orderView, V1Error, V1_ORDER_SELECT } from '@/lib/api-v1'
import { formatOrderCode } from '@/lib/order-codes'

/** POST /api/v1/orders/{code}/cancel: only while the order is still pending (no courier has it yet). */
export const POST = apiV1(async ({ db, shop }, _req, { params }: { params: Promise<{ code: string }> }) => {
  const code = formatOrderCode((await params).code)
  // One conditional update, so a courier picking the order up at the same moment cannot be overtaken
  const { data: cancelled } = await db.from('orders').update({ status: 'cancelled' })
    .eq('shop_id', shop.id).eq('code', code).eq('status', 'pending').eq('is_held', false).select(V1_ORDER_SELECT).maybeSingle()
  if (cancelled) return NextResponse.json({ order: orderView(cancelled) })
  const { data: current } = await db.from('orders').select('status').eq('shop_id', shop.id).eq('code', code).maybeSingle()
  if (!current) throw new V1Error(404, 'not_found', 'Order not found.')
  throw new V1Error(409, 'not_cancellable', `An order can only be cancelled while it is pending. This one is ${current.status}.`, { status: current.status })
})
