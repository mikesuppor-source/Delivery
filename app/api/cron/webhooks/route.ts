import { NextResponse } from 'next/server'
import { api } from '@/lib/api'
import { requireCron } from '@/lib/cron'
import { processWebhookQueue } from '@/lib/webhooks'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * GET /api/cron/webhooks
 * Sends the webhook messages that are due (new ones and retries). Only the scheduler may call it: a GitHub
 * Actions job every 5 minutes (.github/workflows/webhooks.yml) plus Vercel's daily cron as a safety net.
 */
export const GET = api(async req => {
  requireCron(req)
  return NextResponse.json(await processWebhookQueue())
})
