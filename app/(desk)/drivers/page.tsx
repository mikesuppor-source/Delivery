import { allRows } from '@/lib/pagination'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { DriverListClient } from './driver-list-client'
import type { UserRole } from '@/lib/auth'

export default async function DriversPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: memberData } = await supabase
    .from('workspace_members')
    .select('*')
    .eq('user_id', user?.id ?? '')
    .order('created_at').limit(1).single()

  const member = memberData as { workspace_id: string; role: any } | null
  if (!member) return null

  const [driversRes, staffRes, pendingOrdersRes] = await Promise.all([
    allRows(
      supabase
        .from('drivers')
        .select('id, name, phone, active, cash_held_usd, pay_owed_usd, current_lat, current_lng, last_location_at')
        .eq('workspace_id', member.workspace_id)
        .order('name')
    ),
    allRows(
      supabase
        .from('workspace_members')
        .select('user_id, display_name')
        .eq('workspace_id', member.workspace_id)
        .eq('role', 'driver')
    ),
    allRows(
      supabase
        .from('orders')
        .select('driver_id')
        .eq('workspace_id', member.workspace_id)
        .in('status', ['assigned', 'picked_up'])
        .not('driver_id', 'is', null)
    ),
  ])

  const pendingCounts: Record<string, number> = {}
  for (const o of (pendingOrdersRes.data as any[]) || []) {
    if (o.driver_id) {
      pendingCounts[o.driver_id] = (pendingCounts[o.driver_id] || 0) + 1
    }
  }

  // PIN hashes stay server-side; the list only learns whether a PIN is set
  const driverIds = ((driversRes.data as any[]) || []).map(d => d.id)
  const { data: credentials } = driverIds.length
    ? await createServiceClient().from('driver_credentials').select('driver_id').in('driver_id', driverIds)
    : { data: [] }
  const withPin = new Set((credentials || []).map(c => c.driver_id))

  const drivers = ((driversRes.data as any[]) || []).map(d => ({
    ...d,
    has_pin: withPin.has(d.id),
    active_orders_count: pendingCounts[d.id] || 0,
  }))

  const staffMembers = ((staffRes.data as any[]) || []).map(s => ({
    id: s.user_id,
    display_name: s.display_name,
  }))

  return (
    <div className="content">
      <DriverListClient
        drivers={drivers}
        staffMembers={staffMembers}
        workspaceId={member.workspace_id}
        userRole={member.role as UserRole}
      />
    </div>
  )
}
