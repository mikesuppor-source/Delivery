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
    .single()

  const member = memberData as { workspace_id: string; role: any } | null
  if (!member) return null
  await requireRole(member.workspace_id, 'manager')

  const { data: areas } = await supabase
    .from('delivery_areas')
    .select('id, name, fee_usd, active')
    .eq('workspace_id', member.workspace_id)
    .order('name')

  return (
    <div className="content">
      <AreaListClient
        areas={(areas as any) || []}
        workspaceId={member.workspace_id}
        userRole={member.role as UserRole}
      />
    </div>
  )
}
