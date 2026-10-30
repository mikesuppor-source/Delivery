import { NextResponse } from 'next/server'
import { apiV1, orderView, V1Error, V1_ORDER_SELECT } from '@/lib/api-v1'
import { formatOrderCode } from '@/lib/order-codes'

/** GET /api/v1/orders/{code}: one of this shop's orders. Another shop's order answers 404, never 403. */
export const GET = apiV1(async ({ db, shop }, _req, { params }: { params: Promise<{ code: string }> }) => {
  const code = formatOrderCode((await params).code)
  const { data } = await db.from('orders').select(V1_ORDER_SELECT).eq('shop_id', shop.id).eq('code', code).maybeSingle()
  if (!data) throw new V1Error(404, 'not_found', 'Order not found.')
  return NextResponse.json({ order: orderView(data) })
})
