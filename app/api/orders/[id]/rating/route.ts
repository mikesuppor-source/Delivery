import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createServiceClient } from '@/lib/supabase/server'
import { rateLimit, clientIp } from '@/lib/rate-limit'

const RatingSchema = z.object({
  trackingToken: z.string().optional(),
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(500).optional().nullable(),
})

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: orderId } = await params
    const ip = clientIp(req as any)
    await rateLimit(`rating_submit_${ip}`, 20)

    const rawBody = await req.json()
    const parsed = RatingSchema.safeParse(rawBody)

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Invalid rating' }, { status: 400 })
    }

    const db = createServiceClient()
    let token = parsed.data.trackingToken

    if (!token) {
      const { data: ord } = await db
        .from('orders')
        .select('tracking_token')
        .eq('id', orderId)
        .single()
      if (!ord || !ord.tracking_token) {
        return NextResponse.json({ error: 'Order not found' }, { status: 404 })
      }
      token = ord.tracking_token
    }

    const { data, error } = await db.rpc('submit_order_rating', {
      p_tracking_token: token,
      p_rating: parsed.data.rating,
      p_comment: parsed.data.comment || undefined,
    })

    if (error) {
      return NextResponse.json({ error: error.message || 'Failed to submit rating' }, { status: 400 })
    }

    return NextResponse.json({ success: true, result: data })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
