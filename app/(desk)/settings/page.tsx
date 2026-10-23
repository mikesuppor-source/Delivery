import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { SettingsClient } from './settings-client'

export default async function SettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: membership } = await supabase
    .from('workspace_members')
    .select('workspace_id, role, workspace:workspace_id(id, name, slug, usd_to_lbp, currency)')
    .eq('user_id', user?.id ?? '')
    .single()

  if (!membership) return null
  await requireRole(membership.workspace_id, 'manager')

  const workspace = membership.workspace as {
    id: string; name: string; slug: string; usd_to_lbp: number; currency: string
  }

  const isOwner = membership.role === 'owner'

  return (
    <div className="content">
      <SettingsClient workspace={workspace} isOwner={isOwner} />
    </div>
  )
}
