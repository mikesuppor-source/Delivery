import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { batchAutoAssignOrders } from '@/lib/auto-dispatch'

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { workspaceId } = await req.json()
    if (!workspaceId) {
      return NextResponse.json({ error: 'workspaceId is required' }, { status: 400 })
    }

    // Check caller permission
    const { data: member } = await supabase
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', workspaceId)
      .eq('user_id', user.id)
      .single()

    if (!member || (member.role !== 'owner' && member.role !== 'manager')) {
      return NextResponse.json({ error: 'Forbidden: only managers and owners can run auto-dispatch' }, { status: 403 })
    }

    const serviceClient = createServiceClient()

    // Run fair load-balanced multi-driver pool auto-dispatch
    const { assignedCount, assignedCodes, areaSummaries } = await batchAutoAssignOrders(serviceClient, workspaceId)

    if (assignedCount === 0) {
      return NextResponse.json({
        success: true,
        count: 0,
        message: 'No pending orders could be auto-assigned. Make sure delivery areas have couriers assigned to their pool and pending orders have delivery areas selected.',
      })
    }

    // Audit Log
    await serviceClient.from('audit_log').insert({
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
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error running auto-dispatch' },
      { status: 500 }
    )
  }
}
