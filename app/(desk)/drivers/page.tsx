import { allRows } from '@/lib/pagination'
import { createClient } from '@/lib/supabase/server'
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

  const [driversRes, staffRes] = await Promise.all([
    allRows(
      supabase
        .from('drivers')
        .select('id, name, phone, active, cash_held_usd, pay_owed_usd')
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
  ])

  const staffMembers = ((staffRes.data as any[]) || []).map(s => ({
    id: s.user_id,
    display_name: s.display_name,
  }))

  return (
    <div className="content">
      <DriverListClient
        drivers={(driversRes.data as any) || []}
        staffMembers={staffMembers}
        workspaceId={member.workspace_id}
        userRole={member.role as UserRole}
      />
    </div>
  )
}
