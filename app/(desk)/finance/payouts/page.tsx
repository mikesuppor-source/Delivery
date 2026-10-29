import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { allRows } from '@/lib/pagination'
import { PayoutsClient, type ShopPayoutRow, type PayoutRunRow } from './payouts-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Shop Payouts — Cedar Delivery Desk' }

export default async function PayoutsPage() {
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

  const [workspaceRes, shopsRes, reservedRes, runsRes] = await Promise.all([
    supabase.from('workspaces').select('payout_days, payout_min_usd').eq('id', workspaceId).single(),
    allRows(
      supabase
        .from('shops')
        .select('id, name, phone, balance_usd, payout_method, payout_account')
        .eq('workspace_id', workspaceId)
        .eq('active', true)
        .gt('balance_usd', 0)
        .order('name'),
    ),
    // Money already promised to shops that asked to cash out: a run must leave it alone
    supabase.from('cashout_requests').select('shop_id, amount_usd').eq('workspace_id', workspaceId).in('status', ['pending', 'approved']),
    supabase
      .from('payout_runs')
      .select('id, total_amount_usd, item_count, created_at')
      .eq('workspace_id', workspaceId)
      .eq('type', 'shop_payout')
      .order('created_at', { ascending: false })
      .limit(10),
  ])

  const reserved: Record<string, number> = {}
  for (const request of reservedRes.data ?? []) {
    reserved[request.shop_id] = (reserved[request.shop_id] ?? 0) + Number(request.amount_usd)
  }

  const shops: ShopPayoutRow[] = (shopsRes.data ?? []).map(shop => ({
    id: shop.id,
    name: shop.name,
    phone: shop.phone,
    balance_usd: Number(shop.balance_usd),
    payout_method: shop.payout_method,
    payout_account: shop.payout_account,
  }))
  const runs: PayoutRunRow[] = (runsRes.data ?? []).map(run => ({
    id: run.id,
    total_amount_usd: Number(run.total_amount_usd),
    item_count: run.item_count,
    created_at: run.created_at,
  }))

  return (
    <div className="content" style={{ width: '100%', maxWidth: 1400, margin: '0 auto', padding: '24px 20px' }}>
      <PayoutsClient
        workspaceId={workspaceId}
        schedule={{ days: workspaceRes.data?.payout_days ?? [], minUsd: Number(workspaceRes.data?.payout_min_usd ?? 0) }}
        shops={shops}
        reserved={reserved}
        runs={runs}
      />
    </div>
  )
}
