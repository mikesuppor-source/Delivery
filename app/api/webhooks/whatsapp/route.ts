import { NextResponse } from 'next/server'
import { api, ApiError } from '@/lib/api'
import { createServiceClient } from '@/lib/supabase/server'
import { applyWebhook, verifyChallenge, verifyMetaSignature } from '@/lib/whatsapp-webhook'

export const dynamic = 'force-dynamic'

/**
 * GET /api/webhooks/whatsapp
 * Meta calls this once when the webhook is saved in the app's WhatsApp settings, with the verify token you typed there.
 * The answer is the challenge it sent, but only when the token matches WHATSAPP_VERIFY_TOKEN.
 */
export const GET = api(async req => {
  const challenge = verifyChallenge(new URL(req.url).searchParams, process.env.WHATSAPP_VERIFY_TOKEN ?? '')
  if (challenge === null) throw new ApiError(403, 'Verification failed')
  return new NextResponse(challenge, { status: 200, headers: { 'Content-Type': 'text/plain' } })
})

/**
 * POST /api/webhooks/whatsapp
 * Meta reports delivery receipts (delivered, read, failed) and customers' replies here. There is no sign-in: every
 * call must carry Meta's signature, made with the app secret (WHATSAPP_APP_SECRET).
 */
export const POST = api(async req => {
  const secret = process.env.WHATSAPP_APP_SECRET
  if (!secret) throw new ApiError(503, 'The WhatsApp webhook is not set up')
  const raw = await req.text()
  if (Buffer.byteLength(raw) > 1_000_000) throw new ApiError(413, 'Webhook too large')
  if (!verifyMetaSignature(raw, req.headers.get('x-hub-signature-256'), secret)) throw new ApiError(401, 'Invalid signature')
  let body: unknown
  try { body = JSON.parse(raw) } catch { throw new ApiError(400, 'Invalid JSON') }
  return NextResponse.json({ success: true, ...(await applyWebhook(createServiceClient(), body)) })
})
