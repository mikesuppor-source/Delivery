import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { AreaListClient } from './area-list-client'
import type { UserRole } from '@/lib/auth'

export default async function AreasPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: membership } = await supabase
    .from('workspace_members')
    .select('workspace_id, role')
    .eq('user_id', user?.id ?? '')
    .single()

  if (!membership) return null
  await requireRole(membership.workspace_id, 'manager')

  const { data: areas } = await supabase
    .from('delivery_areas')
    .select('id, name, fee_usd, active')
    .eq('workspace_id', membership.workspace_id)
    .order('name')

  return (
    <div className="content">
      <AreaListClient
        areas={(areas as any) || []}
        workspaceId={membership.workspace_id}
        userRole={membership.role as UserRole}
      />
    </div>
  )
}
