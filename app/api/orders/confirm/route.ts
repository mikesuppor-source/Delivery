import { NextResponse } from 'next/server'
import { api, ApiError, checked } from '@/lib/api'
import { createServiceClient } from '@/lib/supabase/server'
import { clientIp, rateLimit } from '@/lib/rate-limit'
import { parseBody, z } from '@/lib/validation'

export const dynamic = 'force-dynamic'

const Answer = z.object({
  trackingToken: z.string().regex(/^[a-f0-9]{64}$/i, 'Open the link you received to answer'),
  received: z.boolean(),
  note: z.string().max(500).optional().nullable(),
})

/**
 * POST /api/orders/confirm
 * The customer says, from their own private tracking link, whether they received the parcel. There is no sign-in: the
 * 64-character token in the link is the proof. A "No" is flagged for the owner to look at.
 */
export const POST = api(async req => {
  await rateLimit('confirm:' + clientIp(req), 20)
  const body = await parseBody(req, Answer)
  const answer = checked(await createServiceClient().rpc('customer_respond_delivery', {
    p_token: body.trackingToken.toLowerCase(), p_received: body.received, p_note: body.note ?? null,
  })) as { result: 'confirmed' | 'disputed' | 'already' | 'closed' | 'not_found' }
  if (answer.result === 'not_found') throw new ApiError(404, 'We could not find this delivery')
  if (answer.result === 'closed') throw new ApiError(409, 'This delivery can no longer be answered')
  return NextResponse.json({ success: true, result: answer.result })
})
