import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { ReportsClient } from './reports-client'
import type { UserRole } from '@/lib/roles'

export const metadata = {
  title: 'Profit & Logistics Reports — Cedar Delivery Desk',
  description: 'Track delivered and returned orders, customer fee revenue, courier payouts, and net company profit.',
}

export default async function ReportsPage() {
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

  // Calculate default date range: This month (from 1st of current month to now)
  const now = new Date()
  const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0))
  const endOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999))

  const { data: initialReport } = await (supabase as any).rpc('profit_report', {
    p_workspace: member.workspace_id,
    p_from: startOfMonth.toISOString(),
    p_to: endOfToday.toISOString(),
  })

  return (
    <div className="content">
      <ReportsClient
        workspaceId={member.workspace_id}
        userRole={member.role as UserRole}
        initialReport={initialReport || null}
        initialFrom={startOfMonth.toISOString()}
        initialTo={endOfToday.toISOString()}
      />
    </div>
  )
}
