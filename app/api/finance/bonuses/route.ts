import { NextResponse } from 'next/server'
import { api, checked } from '@/lib/api'
import { id, parseBody, z } from '@/lib/validation'
import { workspaceAccess } from '@/lib/access'

const ApplyBonuses = z.object({
  workspaceId: id,
  weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})

/**
 * POST /api/finance/bonuses
 * Awards each courier the highest bonus rule their delivered orders reached in a finished
 * Monday-to-Sunday week. Safe to repeat: a courier gets at most one bonus per week.
 */
export const POST = api(async req => {
  const body = await parseBody(req, ApplyBonuses)
  const { db, workspaceId } = await workspaceAccess(body.workspaceId)
  const result = checked(await db.rpc('apply_weekly_driver_bonuses', { p_workspace: workspaceId, p_week_start: body.weekStart }))
  return NextResponse.json({ success: true, result })
})
