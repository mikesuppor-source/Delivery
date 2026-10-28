import { NextResponse } from 'next/server'
import { api } from '@/lib/api'
import { workspaceAccess } from '@/lib/access'
import { batchAutoAssignOrders } from '@/lib/auto-dispatch'

export const POST = api(async req => {
  const body = await req.json()
  // Only managers and owners can run auto-dispatch
  const { db, user, workspaceId } = await workspaceAccess(body.workspaceId, ['owner', 'manager'])

  // Run fair load-balanced multi-driver pool auto-dispatch
  const { assignedCount, assignedCodes, areaSummaries } = await batchAutoAssignOrders(db, workspaceId)

  if (assignedCount === 0) {
    return NextResponse.json({
      success: true,
      count: 0,
      message: 'No pending orders could be auto-assigned. Make sure delivery areas have couriers assigned to their pool and pending orders have delivery areas selected.',
    })
  }

  // Audit Log
  await db.from('audit_log').insert({
    workspace_id: workspaceId,
    actor_id: user.id,
    actor_email: user.email,
    action: 'orders.auto_assigned',
    diff: { count: assignedCount, codes: assignedCodes, areas: areaSummaries as any } as any,
  })

  const areaBreakdown = areaSummaries.map(s => `${s.areaName}: ${s.assignedCount} orders across ${s.driversInPool} couriers`).join(', ')

  return NextResponse.json({
    success: true,
    count: assignedCount,
    message: `Successfully auto-assigned ${assignedCount} order${assignedCount === 1 ? '' : 's'} (${areaBreakdown})!`,
  })
})
