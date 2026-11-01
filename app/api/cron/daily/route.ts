import { NextResponse } from 'next/server'
import { api } from '@/lib/api'
import { requireCron } from '@/lib/cron'
import { createServiceClient } from '@/lib/supabase/server'
import { processCustomerMessages } from '@/lib/customer-messages'
import { processWebhookQueue } from '@/lib/webhooks'
import { runWatchdog } from '@/lib/watchdog'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * GET /api/cron/daily   (Vercel's daily cron; the free plan allows two cron jobs, so this one does three things)
 *   1. sends any shop webhook messages that are due, as a safety net for the 5-minute GitHub job;
 *   2. sends any customer messages that are due, for the same reason;
 *   3. runs the daily health check, which emails ALERT_EMAIL only when something needs attention.
 * Add ?send=0 to run the check without emailing, and ?github=0 to skip the backup check on GitHub.
 */
export const GET = api(async req => {
  requireCron(req)
  const url = new URL(req.url)
  const webhooks = await processWebhookQueue().catch(() => ({ error: true }))
  const messages = await processCustomerMessages(50, url.origin).catch(() => ({ error: true }))
  const health = await runWatchdog(createServiceClient(), { site: url.origin, send: url.searchParams.get('send') !== '0', github: url.searchParams.get('github') !== '0' })
  return NextResponse.json({ status: 'ok', webhooks, messages, health })
})
