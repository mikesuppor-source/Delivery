import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { allRows } from '@/lib/pagination'
import { CourierPayClient, type BonusRow, type CourierRow, type DifferenceRow, type RuleRow, type RunRow } from './courier-pay-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Courier Pay — Cedar Delivery Desk' }

export default async function CourierPayPage() {
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

  const since = new Date(Date.now() - 60 * 86400000).toISOString()
  const [couriersRes, rulesRes, bonusesRes, runsRes, differencesRes] = await Promise.all([
    allRows(
      supabase
        .from('drivers')
        .select('id, name, phone, active, pay_owed_usd, cash_held_usd, pay_mode, pay_percent')
        .eq('workspace_id', workspaceId)
        .order('name'),
    ),
    supabase.from('driver_bonus_rules').select('id, name, min_deliveries, bonus_usd, active').eq('workspace_id', workspaceId).order('min_deliveries'),
    supabase
      .from('driver_bonuses')
      .select('id, week_start, deliveries_count, bonus_usd, note, driver:driver_id(name)')
      .eq('workspace_id', workspaceId)
      .order('week_start', { ascending: false })
      .limit(40),
    supabase
      .from('payout_runs')
      .select('id, total_amount_usd, item_count, created_at')
      .eq('workspace_id', workspaceId)
      .eq('type', 'driver_payout')
      .order('created_at', { ascending: false })
      .limit(10),
    // Delivered orders where the cash the courier handed in differs from what was due
    supabase
      .from('orders')
      .select('id, code, delivered_at, collection_usd, cash_discrepancy_usd, driver:driver_id(id, name), shop:shop_id(name)')
      .eq('workspace_id', workspaceId)
      .eq('status', 'delivered')
      .neq('cash_discrepancy_usd', 0)
      .gte('delivered_at', since)
      .order('delivered_at', { ascending: false })
      .limit(300),
  ])

  const couriers: CourierRow[] = (couriersRes.data ?? []).map(c => ({
    id: c.id,
    name: c.name,
    phone: c.phone,
    active: c.active,
    pay_owed_usd: Number(c.pay_owed_usd),
    cash_held_usd: Number(c.cash_held_usd),
    pay_mode: c.pay_mode,
    pay_percent: c.pay_percent == null ? null : Number(c.pay_percent),
  }))
  const rules: RuleRow[] = (rulesRes.data ?? []).map(r => ({ ...r, bonus_usd: Number(r.bonus_usd) }))
  const bonuses = ((bonusesRes.data ?? []) as unknown as Array<Omit<BonusRow, 'bonus_usd'> & { bonus_usd: number | string }>).map(b => ({
    ...b,
    bonus_usd: Number(b.bonus_usd),
  })) as BonusRow[]
  const runs: RunRow[] = (runsRes.data ?? []).map(r => ({ ...r, total_amount_usd: Number(r.total_amount_usd) }))
  const differences = ((differencesRes.data ?? []) as unknown as DifferenceRow[]).map(d => ({
    ...d,
    collection_usd: Number(d.collection_usd),
    cash_discrepancy_usd: Number(d.cash_discrepancy_usd),
  }))

  return (
    <div className="content" style={{ maxWidth: 1400, margin: '0 auto', padding: '24px 20px' }}>
      <CourierPayClient
        workspaceId={workspaceId}
        couriers={couriers}
        rules={rules}
        bonuses={bonuses}
        runs={runs}
        differences={differences}
      />
    </div>
  )
}
