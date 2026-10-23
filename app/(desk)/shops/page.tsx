import { createClient } from '@/lib/supabase/server'
import { ShopListClient } from './shop-list-client'
import type { UserRole } from '@/lib/auth'

export default async function ShopsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: memberData } = await supabase
    .from('workspace_members')
    .select('*')
    .eq('user_id', user?.id ?? '')
    .single()

  const member = memberData as { workspace_id: string; role: any } | null
  if (!member) return null

  const { data: shops } = await supabase
    .from('shops')
    .select('id, name, phone, address, active, balance_usd, created_at')
    .eq('workspace_id', member.workspace_id)
    .order('name')

  return (
    <div className="content">
      <ShopListClient
        shops={(shops as any) || []}
        workspaceId={member.workspace_id}
        userRole={member.role as UserRole}
      />
    </div>
  )
}
