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
    payout_days?: string[]
    payout_min_usd?: number | null
    logo_url?: string | null
  } | null

  if (!workspace) return null

  const isOwner = member.role === 'owner'

  // The last changes to the exchange rate, with the name of whoever made each one
  const [ratesRes, membersRes] = await Promise.all([
    supabase.from('exchange_rates').select('id, rate, set_at, set_by').eq('workspace_id', workspace.id).order('set_at', { ascending: false }).limit(12),
    supabase.from('workspace_members').select('user_id, display_name').eq('workspace_id', workspace.id),
  ])
  const names = new Map((membersRes.data ?? []).map(m => [m.user_id, m.display_name]))
  const rateHistory = (ratesRes.data ?? []).map(r => ({
    id: r.id,
    rate: Number(r.rate),
    set_at: r.set_at,
    set_by_name: r.set_by ? (names.get(r.set_by) ?? 'Team member') : null,
  }))

  return (
    <div className="content">
      <SettingsClient workspace={workspace} isOwner={isOwner} rateHistory={rateHistory} />
    </div>
  )
}
