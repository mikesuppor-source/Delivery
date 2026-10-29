import { NextResponse } from 'next/server'
import { api, ApiError, checked } from '@/lib/api'
import { id, z } from '@/lib/validation'
import { workspaceAccess } from '@/lib/access'

const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date')
const PnlQuery = z.object({ workspaceId: id, from: Day, to: Day })

/**
 * GET /api/reports/pnl?workspaceId&from&to   (dates as YYYY-MM-DD)
 * Monthly profit and loss: fees and storage fees, courier pay, bonuses and expenses.
 * Owner and manager only.
 */
export const GET = api(async req => {
  const params = new URL(req.url).searchParams
  const query = PnlQuery.safeParse({ workspaceId: params.get('workspaceId'), from: params.get('from'), to: params.get('to') })
  if (!query.success) throw new ApiError(400, query.error.issues[0]?.message ?? 'Invalid query parameters')

  const { db, workspaceId } = await workspaceAccess(query.data.workspaceId)
  const report = checked(await db.rpc('pnl_report', { p_workspace: workspaceId, p_from: query.data.from, p_to: query.data.to }))
  return NextResponse.json({ report })
})
