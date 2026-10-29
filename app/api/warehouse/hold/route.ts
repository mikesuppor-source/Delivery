import { NextResponse } from 'next/server'
import { api, ApiError, checked } from '@/lib/api'
import { id, idList, parseBody, z } from '@/lib/validation'
import { workspaceAccess } from '@/lib/access'

const HoldOrdersBody = z.object({
  workspaceId: id,
  orderIds: idList,
  hubId: id,
  shelfCode: z.string().max(50).optional().nullable(),
  reason: z.enum([
    'weather',
    'far_zone',
    'customer_request',
    'scheduled',
    'address_problem',
    'shop_request',
    'other',
  ]),
  note: z.string().max(500).optional().nullable(),
  deliverAfter: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
})

export const POST = api(async req => {
  const body = await parseBody(req, HoldOrdersBody)
  const { db, user, workspaceId } = await workspaceAccess(body.workspaceId, ['owner', 'manager'])

  // Verify hub belongs to this workspace
  const hub = checked(
    await db
      .from('hubs')
      .select('id, name')
      .eq('id', body.hubId)
      .eq('workspace_id', workspaceId)
      .eq('active', true)
      .maybeSingle(),
  )
  if (!hub) {
    throw new ApiError(404, 'Active warehouse hub not found in this workspace')
  }

  const results: any[] = []
  const failures: any[] = []

  for (const orderId of body.orderIds) {
    try {
      const { data, error } = await db.rpc('hold_order', {
        p_order: orderId,
        p_hub: body.hubId,
        p_shelf: body.shelfCode || '',
        p_reason: body.reason,
        p_note: body.note || undefined,
        p_deliver_after: body.deliverAfter || undefined,
        p_user: user.id,
      })

      if (error) {
        throw new Error(error.message)
      }

      results.push(data)
    } catch (err) {
      failures.push({
        orderId,
        error: err instanceof Error ? err.message : 'Failed to hold order',
      })
    }
  }

  return NextResponse.json({
    success: failures.length === 0,
    count: results.length,
    holds: results,
    failures,
  })
})
