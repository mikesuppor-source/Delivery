import { NextResponse } from 'next/server'
import { api, ApiError, uuid } from '@/lib/api'
import { createServiceClient } from '@/lib/supabase/server'
import { rateLimit } from '@/lib/rate-limit'
import { importWooCommerceOrder, verifyWooSignature } from '@/lib/woocommerce'

export const dynamic = 'force-dynamic'

/**
 * POST /api/webhooks/woocommerce/{shopId}
 * A shop's WooCommerce store posts each new order here (WooCommerce > Settings > Advanced > Webhooks, topic "Order created").
 * There is no sign-in: the message must carry a signature made with the secret Cedar gave that shop.
 */
export const POST = api(async (req, { params }: { params: Promise<{ shopId: string }> }) => {
  const shopId = uuid((await params).shopId, 'shop')
  const raw = await req.text()
  if (Buffer.byteLength(raw) > 2_000_000) throw new ApiError(413, 'Webhook too large')
  const db = createServiceClient()
  const { data: link } = await db.from('shop_woocommerce').select('secret, enabled').eq('shop_id', shopId).maybeSingle()
  // The same answer for an unknown shop, a switched-off store and a wrong signature: nothing to learn by guessing
  if (!link?.enabled || !verifyWooSignature(raw, req.headers.get('x-wc-webhook-signature') || '', link.secret)) throw new ApiError(401, 'Invalid webhook signature')
  await rateLimit('woo:' + shopId, 120)

  // WooCommerce sends a test message ("webhook_id=...") when a webhook is saved
  if (!raw.trimStart().startsWith('{')) return NextResponse.json({ success: true, status: 'ping' })
  const topic = req.headers.get('x-wc-webhook-topic')
  if (topic !== 'order.created') return NextResponse.json({ success: true, status: 'ignored', topic })

  const { data: shop } = await db.from('shops').select('id, workspace_id, prefix').eq('id', shopId).eq('active', true).maybeSingle()
  if (!shop) throw new ApiError(404, 'Connected shop not found')
  const result = await importWooCommerceOrder(shop, JSON.parse(raw))
  if (!result.skipped) await db.from('shop_woocommerce').update({ last_order_at: new Date().toISOString() }).eq('shop_id', shopId)
  return NextResponse.json({ success: true, ...result })
})
