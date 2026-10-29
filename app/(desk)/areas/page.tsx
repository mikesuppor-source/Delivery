import { allRows } from '@/lib/pagination'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { AreaListClient } from './area-list-client'
import type { UserRole } from '@/lib/auth'

export default async function AreasPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: memberData } = await supabase
    .from('workspace_members')
    .select('*')
    .eq('user_id', user?.id ?? '')
    .order('created_at').limit(1).single()

  const member = memberData as { workspace_id: string; role: any } | null
  if (!member) return null
  await requireRole(member.workspace_id, 'manager')

  const [areasRes, driversRes, wsRes] = await Promise.all([
    allRows(
      supabase
        .from('delivery_areas')
        .select('id, name, fee_usd, driver_pay_usd, return_fee_usd, return_driver_pay_usd, storage_fee_per_day_usd, free_storage_days, active, default_driver_id, assigned_driver_ids, default_driver:default_driver_id(id, name, phone)')
        .eq('workspace_id', member.workspace_id)
        .eq('active', true)
        .order('name')
    ),
    allRows(
      supabase
        .from('drivers')
        .select('id, name, phone, active')
        .eq('workspace_id', member.workspace_id)
        .eq('active', true)
        .order('name')
    ),
    supabase
      .from('workspaces')
      .select('default_delivery_fee_usd, default_driver_pay_usd')
      .eq('id', member.workspace_id)
      .single(),
  ])

  const defaultDriverPayUsd = wsRes.data?.default_driver_pay_usd !== null && wsRes.data?.default_driver_pay_usd !== undefined
    ? Number(wsRes.data.default_driver_pay_usd)
    : 1

  return (
    <div className="content">
      <AreaListClient
        areas={(areasRes.data as any) || []}
        drivers={(driversRes.data as any) || []}
        workspaceId={member.workspace_id}
        userRole={member.role as UserRole}
        defaultDriverPayUsd={defaultDriverPayUsd}
      />
    </div>
  )
}
