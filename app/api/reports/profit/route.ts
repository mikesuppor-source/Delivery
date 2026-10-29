import { NextResponse } from 'next/server'
import { api, ApiError } from '@/lib/api'
import { id, z } from '@/lib/validation'
import { authenticated, workspaceAccess } from '@/lib/access'

const ProfitQuery = z.object({
  workspaceId: id,
  from: z.string().datetime({ message: 'Invalid from date' }),
  to: z.string().datetime({ message: 'Invalid to date' }),
})

/**
 * GET /api/reports/profit?workspaceId&from&to
 * Returns KPI totals and breakdowns by zone, courier and shop.
 * Owner and manager only — enforced in the SQL function too.
 */
export const GET = api(async req => {
  const params = new URL(req.url).searchParams
  const body = ProfitQuery.safeParse({
    workspaceId: params.get('workspaceId'),
    from: params.get('from'),
    to: params.get('to'),
  })
  if (!body.success) {
    throw new ApiError(400, body.error.issues[0]?.message ?? 'Invalid query parameters')
  }

  await workspaceAccess(body.data.workspaceId, ['owner', 'manager'])

  // The function checks the caller's own role, so it runs as the signed-in user, not the service role
  const { client } = await authenticated()
  const { data, error } = await (client as any).rpc('profit_report', {
    p_workspace: body.data.workspaceId,
    p_from: body.data.from,
    p_to: body.data.to,
  })

  if (error) {
    if (error.message?.includes('Forbidden')) throw new ApiError(403, error.message)
    throw new ApiError(500, 'Report generation failed')
  }

  return NextResponse.json({ report: data })
})
