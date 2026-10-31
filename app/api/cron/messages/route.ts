import { NextResponse } from 'next/server'
import { api } from '@/lib/api'
import { requireCron } from '@/lib/cron'
import { processCustomerMessages } from '@/lib/customer-messages'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * GET /api/cron/messages
 * Sends the customer WhatsApp messages that are due: new ones the quick send missed, and retries of earlier failures.
 * Called every 5 minutes by .github/workflows/webhooks.yml with the CRON_SECRET.
 */
export const GET = api(async req => {
  requireCron(req)
  return NextResponse.json({ status: 'ok', ...(await processCustomerMessages(50, new URL(req.url).origin)) })
})
