import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

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

    // 1. Fetch all areas with default drivers
    const { data: areas, error: areaErr } = await serviceClient
      .from('delivery_areas')
      .select('id, name, default_driver_id')
      .eq('workspace_id', workspaceId)
      .eq('active', true)
      .not('default_driver_id', 'is', null)

    if (areaErr || !areas || areas.length === 0) {
      return NextResponse.json({
        success: true,
        count: 0,
        message: 'No delivery areas have a default courier configured. Go to Delivery Areas to assign default couriers.',
      })
    }

    // Map area_id -> default_driver_id
    const areaDriverMap = new Map<string, string>()
    for (const a of areas) {
      if (a.default_driver_id) {
        areaDriverMap.set(a.id, a.default_driver_id)
      }
    }

    // 2. Fetch all unassigned pending orders in this workspace
    const { data: unassignedOrders, error: orderErr } = await serviceClient
      .from('orders')
      .select('id, code, area_id')
      .eq('workspace_id', workspaceId)
      .is('driver_id', null)
      .eq('status', 'pending')

    if (orderErr) {
      return NextResponse.json({ error: orderErr.message }, { status: 500 })
    }

    if (!unassignedOrders || unassignedOrders.length === 0) {
      return NextResponse.json({
        success: true,
        count: 0,
        message: 'No unassigned pending orders found.',
      })
    }

    // 3. Batch assign orders
    let assignedCount = 0
    const assignedCodes: string[] = []

    for (const order of unassignedOrders) {
      if (order.area_id && areaDriverMap.has(order.area_id)) {
        const driverId = areaDriverMap.get(order.area_id)!
        const { data: activeDriver } = await serviceClient.from('drivers').select('id').eq('id', driverId).eq('workspace_id', workspaceId).eq('active', true).maybeSingle()
        if (!activeDriver) continue
        const { data: assigned, error: updErr } = await serviceClient
          .from('orders')
          .update({
            driver_id: driverId,
            status: 'assigned',
            updated_at: new Date().toISOString(),
          })
          .eq('id', order.id).eq('status', 'pending').is('driver_id', null).select('id')

        if (!updErr && assigned?.length) {
          assignedCount++
          assignedCodes.push(order.code)
        }
      }
    }

    // 4. Audit Log
    if (assignedCount > 0) {
      await serviceClient.from('audit_log').insert({
        workspace_id: workspaceId,
        actor_id: user.id,
        actor_email: user.email,
        action: 'orders.auto_assigned',
        diff: { count: assignedCount, codes: assignedCodes },
      })
    }

    return NextResponse.json({
      success: true,
      count: assignedCount,
      message: `Successfully auto-assigned ${assignedCount} order${assignedCount === 1 ? '' : 's'} based on their delivery areas!`,
    })
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error running auto-dispatch' },
      { status: 500 }
    )
  }
}
