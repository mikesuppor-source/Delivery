import { allRows } from '@/lib/pagination'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { StatementClient } from './statement-client'

export default async function StatementsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: memberData } = await supabase
    .from('workspace_members')
    .select('*')
    .eq('user_id', user?.id ?? '')
    .order('created_at').limit(1).single()

  const member = memberData as { workspace_id: string; role: any } | null
  if (!member) return null

  const { data: wsData } = await supabase
    .from('workspaces')
    .select('*')
    .eq('id', member.workspace_id)
    .single()

  const workspace = wsData as { id: string; usd_to_lbp: number } | null
  if (!workspace) return null
  await requireRole(workspace.id, 'manager')

  const [ordersRes, shopsRes, driversRes, ledgerRes] = await Promise.all([
    allRows(
      supabase
        .from('orders')
        .select(`
          *,
          shop:shop_id(id, name),
          driver:driver_id(id, name)
        `)
        .eq('workspace_id', workspace.id)
        .eq('status', 'delivered')
        .order('delivered_at', { ascending: false })
    ),
    allRows(
      supabase
        .from('shops')
        .select('id, name, balance_usd')
        .eq('workspace_id', workspace.id)
        .order('name')
    ),
    allRows(
      supabase
        .from('drivers')
        .select('id, name, cash_held_usd, cash_held_lbp, pay_owed_usd')
        .eq('workspace_id', workspace.id)
        .order('name')
    ),
    supabase
      .from('money_ledger' as any)
      .select(`
        id,
        shop_delta,
        cash_delta,
        lbp_delta,
        pay_delta,
        reason,
        created_at,
        shop:shop_id(name),
        driver:driver_id(name),
        order:order_id(code)
      `)
      .eq('workspace_id', workspace.id)
      .order('created_at', { ascending: false })
      .limit(60),
  ])

  return (
    <div className="content">
      <StatementClient
        orders={(ordersRes.data as any) || []}
        shops={(shopsRes.data as any) || []}
        drivers={(driversRes.data as any) || []}
        ledger={(ledgerRes.data as any) || []}
        workspaceId={workspace.id}
        rate={Number(workspace.usd_to_lbp)}
      />
    </div>
  )
}
