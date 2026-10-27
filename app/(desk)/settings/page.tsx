import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { SettingsClient } from './settings-client'

export default async function SettingsPage() {
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

  const { data: wsData } = await supabase
    .from('workspaces')
    .select('*')
    .eq('id', member.workspace_id)
    .single()

  const workspace = wsData as {
    id: string
    name: string
    slug: string
    usd_to_lbp: number
    currency: string
    default_driver_pay_usd?: number | null
    default_delivery_fee_usd?: number | null
  } | null

  if (!workspace) return null

  const isOwner = member.role === 'owner'

  return (
    <div className="content">
      <SettingsClient workspace={workspace} isOwner={isOwner} />
    </div>
  )
}
