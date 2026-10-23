import { createClient } from '@/lib/supabase/server'
import { ShopListClient } from './shop-list-client'
import type { UserRole } from '@/lib/auth'

export default async function ShopsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: membership } = await supabase
    .from('workspace_members')
    .select('workspace_id, role')
    .eq('user_id', user?.id ?? '')
    .single()

  if (!membership) return null

  const { data: shops } = await supabase
    .from('shops')
    .select('id, name, phone, address, active, balance_usd, created_at')
    .eq('workspace_id', membership.workspace_id)
    .order('name')

  return (
    <div className="content">
      <ShopListClient
        shops={(shops as any) || []}
        workspaceId={membership.workspace_id}
        userRole={membership.role as UserRole}
      />
    </div>
  )
}
