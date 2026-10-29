import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createServiceClient } from '@/lib/supabase/server'
import { rateLimit, clientIp } from '@/lib/rate-limit'

const RatingSchema = z.object({
  trackingToken: z.string().min(1, 'Tracking token is required'),
  rating: z.number().int().min(1, 'Rating must be at least 1').max(5, 'Rating cannot exceed 5'),
  comment: z.string().max(500).optional().nullable(),
})

export async function POST(req: Request) {
  try {
    const ip = clientIp(req as any)
    await rateLimit(`rating_submit_${ip}`, 20)

    const rawBody = await req.json()
    const parsed = RatingSchema.safeParse(rawBody)

    if (!parsed.success) {
      const issue = parsed.error.issues[0]
      return NextResponse.json({ error: issue?.message || 'Invalid rating data' }, { status: 400 })
    }

    const { trackingToken, rating, comment } = parsed.data
    const db = createServiceClient()

    const { data, error } = await db.rpc('submit_order_rating', {
      p_tracking_token: trackingToken,
      p_rating: rating,
      p_comment: comment || undefined,
    })

    if (error) {
      return NextResponse.json({ error: error.message || 'Failed to submit rating' }, { status: 400 })
    }

    return NextResponse.json({ success: true, result: data })
  } catch (err: unknown) {
    console.error('Rating error:', err)
    const msg = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
