import { NextResponse } from 'next/server'
import { api, checked } from '@/lib/api'
import { requireCron } from '@/lib/cron'
import { createServiceClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/**
 * GET /api/cron/holds
 * Cron job to evaluate active warehouse holds:
 * - Flags holds whose deliver_after date has arrived (<= today)
 * - Flags holds stored longer than 7 days without release
 */
export const GET = api(async req => {
  // This reads every company's holds with the service role, so only the scheduler may call it
  requireCron(req)

  const db = createServiceClient()
  const todayStr = new Date().toISOString().slice(0, 10)
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400 * 1000).toISOString()

  // Ready to release holds
  const readyResult = await db
    .from('order_holds')
    .select('id, workspace_id, order_id, deliver_after, shelf_code, reason')
    .is('released_at', null)
    .lte('deliver_after', todayStr)
  const readyHolds = checked(readyResult) as any[]

  // Stale holds > 7 days
  const staleResult = await db
    .from('order_holds')
    .select('id, workspace_id, order_id, held_at, shelf_code, reason')
    .is('released_at', null)
    .lte('held_at', sevenDaysAgo)
  const staleHolds = checked(staleResult) as any[]

  return NextResponse.json({
    status: 'ok',
    evaluatedAt: new Date().toISOString(),
    readyToReleaseCount: readyHolds.length,
    staleHoldsCount: staleHolds.length,
    readyHolds,
    staleHolds,
  })
})
