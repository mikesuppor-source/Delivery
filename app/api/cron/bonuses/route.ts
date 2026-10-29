import { NextResponse } from 'next/server'
import { api, checked } from '@/lib/api'
import { requireCron } from '@/lib/cron'
import { isoDate, lastFinishedWeekStart } from '@/lib/finance'
import { createServiceClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/**
 * GET /api/cron/bonuses
 * Weekly job (run it on Monday): awards every company's courier bonuses for the week that just
 * ended. Safe to run twice: a courier gets at most one bonus per week.
 */
export const GET = api(async req => {
  requireCron(req)
  const db = createServiceClient()
  const weekStart = isoDate(lastFinishedWeekStart())
  const workspaces = checked(await db.from('driver_bonus_rules').select('workspace_id').eq('active', true))
  const results: Array<{ workspaceId: string; bonusesCreated?: number; error?: string }> = []
  for (const workspaceId of [...new Set(workspaces.map(rule => rule.workspace_id))]) {
    const { data, error } = await db.rpc('apply_weekly_driver_bonuses', { p_workspace: workspaceId, p_week_start: weekStart })
    results.push(error ? { workspaceId, error: error.message } : { workspaceId, bonusesCreated: (data as { bonuses_created: number }).bonuses_created })
  }
  return NextResponse.json({ status: 'ok', weekStart, results })
})
