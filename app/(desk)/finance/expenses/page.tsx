import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { ExpensesClient, type ExpenseRow } from './expenses-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Expenses — Cedar Delivery Desk' }

export default async function ExpensesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: member } = await supabase
    .from('workspace_members')
    .select('workspace_id, role')
    .eq('user_id', user.id)
    .order('created_at')
    .limit(1)
    .single()
  if (!member) redirect('/login')
  await requireRole(member.workspace_id, 'manager')
  const workspaceId = member.workspace_id

  // The last 13 months cover "this month" through a year-on-year look
  const since = new Date()
  since.setUTCMonth(since.getUTCMonth() - 13)
  const [workspaceRes, expensesRes] = await Promise.all([
    supabase.from('workspaces').select('usd_to_lbp').eq('id', workspaceId).single(),
    supabase
      .from('expenses')
      .select('id, date, category, amount_usd, amount_lbp, usd_to_lbp, note')
      .eq('workspace_id', workspaceId)
      .gte('date', since.toISOString().slice(0, 10))
      .order('date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(1000),
  ])

  const expenses: ExpenseRow[] = (expensesRes.data ?? []).map(e => ({
    id: e.id,
    date: e.date,
    category: e.category,
    amount_usd: Number(e.amount_usd),
    amount_lbp: Number(e.amount_lbp),
    usd_to_lbp: Number(e.usd_to_lbp),
    note: e.note,
  }))

  return (
    <div className="content" style={{ width: '100%', maxWidth: 1400, margin: '0 auto', padding: '24px 20px' }}>
      <ExpensesClient workspaceId={workspaceId} rate={Number(workspaceRes.data?.usd_to_lbp ?? 0)} expenses={expenses} />
    </div>
  )
}
