import { NextResponse } from 'next/server'
import { api } from '@/lib/api'
import { id, idList, parseBody, z } from '@/lib/validation'
import { workspaceAccess } from '@/lib/access'

const ReleaseOrdersBody = z.object({
  workspaceId: id,
  orderIds: idList,
  note: z.string().max(500).optional().nullable(),
})

export const POST = api(async req => {
  const body = await parseBody(req, ReleaseOrdersBody)
  const { db, user } = await workspaceAccess(body.workspaceId, ['owner', 'manager'])

  const results: any[] = []
  const failures: any[] = []

  for (const orderId of body.orderIds) {
    try {
      const { data, error } = await db.rpc('release_order', {
        p_order: orderId,
        p_user: user.id,
        p_note: body.note || undefined,
      })

      if (error) {
        throw new Error(error.message)
      }

      results.push(data)
    } catch (err) {
      failures.push({
        orderId,
        error: err instanceof Error ? err.message : 'Failed to release order',
      })
    }
  }

  return NextResponse.json({
    success: failures.length === 0,
    count: results.length,
    releases: results,
    failures,
  })
})
