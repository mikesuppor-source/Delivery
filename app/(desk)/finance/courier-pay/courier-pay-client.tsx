'use client'

import React, { useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { PageHeader } from '@/components/page-header'
import { Button, ConfirmDialog, DataTable, Drawer, EmptyState, KpiCard, MoneyText, Tabs, Tag, useToast, type Column } from '@/components/ui'
import { Field, FormError, inputStyle } from '@/components/finance-form'
import { useI18n } from '@/lib/i18n'
import { describePayMode, isoDate, lastFinishedWeekStart, sumUsd } from '@/lib/finance'
import { errorMessage, newRequestId, sendJson } from '@/lib/finance-client'
import { formatDate, formatUSD } from '@/lib/utils'

export interface CourierRow {
  id: string
  name: string
  phone: string | null
  active: boolean
  pay_owed_usd: number
  cash_held_usd: number
  pay_mode: string
  pay_percent: number | null
}
export interface RuleRow { id: string; name: string; min_deliveries: number; bonus_usd: number; active: boolean }
export interface BonusRow { id: string; week_start: string; deliveries_count: number; bonus_usd: number; note: string | null; driver: { name: string } | null }
export interface RunRow { id: string; total_amount_usd: number; item_count: number; created_at: string }
export interface DifferenceRow {
  id: string
  code: string
  delivered_at: string
  collection_usd: number
  cash_discrepancy_usd: number
  driver: { id: string; name: string } | null
  shop: { name: string } | null
}

interface Props {
  workspaceId: string
  couriers: CourierRow[]
  rules: RuleRow[]
  bonuses: BonusRow[]
  runs: RunRow[]
  differences: DifferenceRow[]
}

type TabId = 'pay' | 'bonuses' | 'cash'

/** The finished weeks bonuses can be calculated for, newest first (each week runs Monday to Sunday). */
function finishedWeeks(count: number) {
  const latest = lastFinishedWeekStart()
  return Array.from({ length: count }, (_, i) => {
    const start = new Date(latest.getTime() - i * 7 * 86400000)
    const end = new Date(start.getTime() + 6 * 86400000)
    return { value: isoDate(start), end: isoDate(end) }
  })
}

export function CourierPayClient({ workspaceId, couriers, rules, bonuses, runs, differences }: Props) {
  const router = useRouter()
  const toast = useToast()
  const { t, locale } = useI18n()
  const dayLabel = (iso: string) =>
    new Intl.DateTimeFormat(locale === 'ar' ? 'ar-LB-u-nu-latn' : 'en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(iso + 'T00:00:00Z'))
  /** "1 courier" or "3 couriers"; the Arabic has a line for each */
  const courierCount = (count: number) => (count === 1 ? t('1 courier') : t('{count} couriers', { count }))
  const orderCount = (count: number) => (count === 1 ? t('1 order') : t('{count} orders', { count }))
  const [tab, setTab] = useState<TabId>('pay')

  // ── Pay run ──
  const owed = useMemo(() => couriers.filter(c => c.pay_owed_usd > 0).sort((a, b) => b.pay_owed_usd - a.pay_owed_usd), [couriers])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [amounts, setAmounts] = useState<Record<string, string>>({})
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [paying, setPaying] = useState(false)
  const [payError, setPayError] = useState('')
  const requestId = useRef('')
  const amountFor = (c: CourierRow) => (amounts[c.id] === undefined || amounts[c.id] === '' ? c.pay_owed_usd : Number(amounts[c.id]))
  const problemFor = (c: CourierRow) => {
    const amount = amountFor(c)
    if (!Number.isFinite(amount) || amount <= 0) return t('Enter an amount')
    if (Math.abs(amount * 100 - Math.round(amount * 100)) > 1e-6) return t('Use dollars and cents')
    if (amount > c.pay_owed_usd) return t('More than is owed')
    return ''
  }
  const selectedCouriers = owed.filter(c => selected.has(c.id))
  const selectedTotal = sumUsd(selectedCouriers.map(amountFor))
  const totalOwed = sumUsd(owed.map(c => c.pay_owed_usd))

  async function payCouriers() {
    setPaying(true)
    setPayError('')
    try {
      const { run } = await sendJson<{ run: { replayed: boolean; count: number; total_usd: number } }>('/api/finance/payouts', 'POST', {
        workspaceId,
        kind: 'drivers',
        idempotencyKey: requestId.current,
        payouts: selectedCouriers.map(c => ({ id: c.id, amountUsd: amountFor(c), note: '' })),
      })
      setConfirmOpen(false)
      setSelected(new Set())
      setAmounts({})
      toast.success(run.replayed ? t('That pay run was already recorded. Nothing was paid twice.') : t('Paid {couriers}: {amount}', { couriers: courierCount(run.count), amount: formatUSD(Number(run.total_usd)) }))
      router.refresh()
    } catch (error) {
      setPayError(errorMessage(error))
    } finally {
      setPaying(false)
    }
  }

  const payColumns: Column<CourierRow>[] = [
    {
      key: 'courier',
      header: t('Courier'),
      render: c => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Link href={`/drivers/${c.id}`} style={{ fontWeight: 700, color: 'var(--ui-primary)' }}>{c.name}</Link>
          {c.phone && <span style={{ fontSize: 11, color: 'var(--ui-text-muted)' }}>{c.phone}</span>}
        </div>
      ),
    },
    { key: 'mode', header: t('Paid by'), render: c => <span style={{ fontSize: 12 }}>{describePayMode(c.pay_mode, c.pay_percent, t)}</span> },
    { key: 'owed', header: t('Pay owed'), align: 'end', render: c => <MoneyText amount={c.pay_owed_usd} size="sm" highlightPositive /> },
    { key: 'cash', header: t('Cash still held'), align: 'end', render: c => <MoneyText amount={c.cash_held_usd} size="sm" highlightNegative={false} /> },
    {
      key: 'pay',
      header: t('Pay now'),
      width: '170px',
      render: c => {
        const isSelected = selected.has(c.id)
        const problem = isSelected ? problemFor(c) : ''
        return (
          <div>
            <input
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              aria-label={t('Amount to pay {name}', { name: c.name })}
              value={amounts[c.id] ?? c.pay_owed_usd.toFixed(2)}
              disabled={!isSelected}
              onChange={event => setAmounts(prev => ({ ...prev, [c.id]: event.target.value }))}
              style={{ ...inputStyle, padding: '5px 8px', textAlign: 'right', borderColor: problem ? 'var(--ui-danger)' : 'var(--ui-border)' }}
            />
            {problem && <div style={{ fontSize: 11, color: 'var(--ui-danger)', marginTop: 2 }}>{problem}</div>}
          </div>
        )
      },
    },
  ]

  // ── Bonuses ──
  const weeks = useMemo(() => finishedWeeks(8), [])
  const [week, setWeek] = useState(weeks[0].value)
  const [calculating, setCalculating] = useState(false)
  const [ruleOpen, setRuleOpen] = useState(false)
  const [editing, setEditing] = useState<RuleRow | null>(null)
  const [ruleName, setRuleName] = useState('')
  const [ruleMin, setRuleMin] = useState('')
  const [ruleBonus, setRuleBonus] = useState('')
  const [ruleError, setRuleError] = useState('')
  const [ruleSaving, setRuleSaving] = useState(false)
  const [removing, setRemoving] = useState<RuleRow | null>(null)

  async function calculateBonuses() {
    setCalculating(true)
    try {
      const { result } = await sendJson<{ result: { bonuses_created: number; total_bonus_usd: number } }>('/api/finance/bonuses', 'POST', { workspaceId, weekStart: week })
      toast.success(
        result.bonuses_created
          ? t('{couriers} earned a bonus: {amount} added to their pay owed', { couriers: courierCount(result.bonuses_created), amount: formatUSD(Number(result.total_bonus_usd)) })
          : t('No new bonuses for that week (either nobody reached a rule, or it was already calculated).'),
      )
      router.refresh()
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setCalculating(false)
    }
  }

  function openRule(rule: RuleRow | null) {
    setEditing(rule)
    setRuleName(rule?.name ?? '')
    setRuleMin(rule ? String(rule.min_deliveries) : '')
    setRuleBonus(rule ? rule.bonus_usd.toFixed(2) : '')
    setRuleError('')
    setRuleOpen(true)
  }

  async function saveRule(event: React.FormEvent) {
    event.preventDefault()
    setRuleSaving(true)
    setRuleError('')
    try {
      const fields = { name: ruleName.trim(), minDeliveries: Number(ruleMin), bonusUsd: Number(ruleBonus) }
      if (!fields.name) throw new Error(t('Give the rule a name'))
      if (!Number.isInteger(fields.minDeliveries) || fields.minDeliveries < 1) throw new Error(t('Deliveries must be a whole number of 1 or more'))
      if (!(fields.bonusUsd > 0)) throw new Error(t('Enter the bonus amount'))
      await sendJson('/api/finance/bonus-rules', editing ? 'PATCH' : 'POST', { workspaceId, ...(editing ? { id: editing.id } : {}), ...fields })
      setRuleOpen(false)
      router.refresh()
    } catch (error) {
      setRuleError(errorMessage(error))
    } finally {
      setRuleSaving(false)
    }
  }

  async function toggleRule(rule: RuleRow) {
    try {
      await sendJson('/api/finance/bonus-rules', 'PATCH', { workspaceId, id: rule.id, active: !rule.active })
      router.refresh()
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  async function removeRule() {
    if (!removing) return
    try {
      await sendJson('/api/finance/bonus-rules', 'DELETE', { workspaceId, id: removing.id })
      setRemoving(null)
      router.refresh()
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  // ── Cash differences ──
  const byCourier = useMemo(() => {
    const totals = new Map<string, { name: string; count: number; net: number }>()
    for (const d of differences) {
      const key = d.driver?.id ?? 'none'
      const row = totals.get(key) ?? { name: d.driver?.name ?? t('No courier'), count: 0, net: 0 }
      row.count += 1
      row.net = sumUsd([row.net, d.cash_discrepancy_usd])
      totals.set(key, row)
    }
    return [...totals.entries()].map(([id, row]) => ({ id, ...row })).sort((a, b) => a.net - b.net)
    // The "No courier" wording follows the language, so a language change recalculates this
  }, [differences, locale])

  const tabs = [
    { id: 'pay', label: t('Pay run'), badge: owed.length || undefined, content: null },
    { id: 'bonuses', label: t('Bonuses'), content: null },
    { id: 'cash', label: t('Cash differences'), badge: differences.length || undefined, content: null },
  ]

  return (
    <div>
      <PageHeader
        title={t('navCourierPay')}
        subtitle={t('Pay couriers what they have earned, set weekly bonuses, and see where the cash they hand in does not match.')}
        breadcrumbs={[{ label: t('navOverview'), href: '/' }, { label: t('Finance') }, { label: t('navCourierPay') }]}
        actions={<Link href="/finance/payouts" className="ui-btn ui-btn--subtle ui-btn--sm">{t('navPayouts')}</Link>}
      />

      <div style={{ marginBottom: 16 }}>
        <Tabs items={tabs} activeId={tab} onChange={id => setTab(id as TabId)} />
      </div>

      {tab === 'pay' && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, marginBottom: 20 }}>
            <KpiCard title={t('Couriers owed pay')} value={owed.length} />
            <KpiCard title={t('Total owed')} value={<MoneyText amount={totalOwed} size="lg" />} />
            <KpiCard title={t('Selected for this run')} value={<MoneyText amount={selectedTotal} size="lg" />} subtext={courierCount(selectedCouriers.length)} tone={selectedCouriers.length ? 'primary' : 'default'} />
          </div>
          <DataTable
            columns={payColumns}
            data={owed}
            keyField="id"
            selectedKeys={selected}
            onSelectionChange={setSelected}
            bulkActions={
              <Button
                size="sm"
                disabled={selectedCouriers.some(problemFor)}
                onClick={() => { requestId.current = newRequestId(); setPayError(''); setConfirmOpen(true) }}
              >
                {t('Pay selected ({amount})', { amount: formatUSD(selectedTotal) })}
              </Button>
            }
            emptyMessage={<EmptyState icon="🚚" title={t('No courier is owed pay')} description={t('Pay owed builds up as couriers deliver orders. It appears here once there is something to pay.')} />}
          />
          <h2 style={{ fontSize: 15, fontWeight: 800, margin: '28px 0 10px' }}>{t('Recent pay runs')}</h2>
          <DataTable
            columns={[
              { key: 'when', header: t('When'), render: (r: RunRow) => formatDate(r.created_at, locale) },
              { key: 'count', header: t('Couriers paid'), align: 'end', render: (r: RunRow) => r.item_count },
              { key: 'total', header: t('Total'), align: 'end', render: (r: RunRow) => <MoneyText amount={r.total_amount_usd} size="sm" /> },
            ]}
            data={runs}
            keyField="id"
            emptyMessage={t('No courier pay run has been made yet.')}
          />
        </>
      )}

      {tab === 'bonuses' && (
        <>
          <div className="ui-box" style={{ padding: 18, marginBottom: 20 }}>
            <h2 style={{ fontSize: 15, fontWeight: 800, margin: '0 0 4px' }}>{t('Calculate weekly bonuses')}</h2>
            <p style={{ fontSize: 12, color: 'var(--ui-text-muted)', margin: '0 0 12px' }}>
              {t('Each courier gets the highest bonus rule their delivered orders reached in the week, once per week. The bonus is added to what they are owed.')}
            </p>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div style={{ minWidth: 240 }}>
                <Field label={t('Week (Monday to Sunday)')}>
                  <select value={week} onChange={event => setWeek(event.target.value)} style={inputStyle}>
                    {weeks.map(w => <option key={w.value} value={w.value}>{t('{from} to {to}', { from: dayLabel(w.value), to: dayLabel(w.end) })}</option>)}
                  </select>
                </Field>
              </div>
              <Button onClick={calculateBonuses} disabled={calculating || !rules.some(r => r.active)}>
                {calculating ? t('Calculating...') : t('Calculate bonuses')}
              </Button>
            </div>
            {!rules.some(r => r.active) && <p style={{ fontSize: 12, color: 'var(--ui-warning)', margin: '10px 0 0' }}>{t('Add an active bonus rule first.')}</p>}
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '0 0 10px' }}>
            <h2 style={{ fontSize: 15, fontWeight: 800, margin: 0 }}>{t('Bonus rules')}</h2>
            <Button size="sm" onClick={() => openRule(null)}>{t('New rule')}</Button>
          </div>
          <DataTable
            columns={[
              { key: 'name', header: t('Rule'), render: (r: RuleRow) => <strong>{r.name}</strong> },
              { key: 'deliveries', header: t('Deliveries in a week'), align: 'end', render: (r: RuleRow) => t('{count} or more', { count: r.min_deliveries }) },
              { key: 'bonus', header: t('Bonus'), align: 'end', render: (r: RuleRow) => <MoneyText amount={r.bonus_usd} size="sm" /> },
              { key: 'active', header: t('Status'), render: (r: RuleRow) => <Tag tone={r.active ? 'success' : 'neutral'}>{r.active ? t('Active') : t('Paused')}</Tag> },
              {
                key: 'actions',
                header: '',
                align: 'end',
                render: (r: RuleRow) => (
                  <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                    <Button size="sm" variant="subtle" onClick={() => openRule(r)}>{t('actionEdit')}</Button>
                    <Button size="sm" variant="subtle" onClick={() => toggleRule(r)}>{r.active ? t('Pause') : t('Resume')}</Button>
                    <Button size="sm" variant="danger" onClick={() => setRemoving(r)}>{t('actionDelete')}</Button>
                  </div>
                ),
              },
            ]}
            data={rules}
            keyField="id"
            emptyMessage={<EmptyState icon="🎯" title={t('No bonus rules yet')} description={t('Example: "30 deliveries in a week earns $5".')} />}
          />

          <h2 style={{ fontSize: 15, fontWeight: 800, margin: '28px 0 10px' }}>{t('Bonuses paid')}</h2>
          <DataTable
            columns={[
              { key: 'week', header: t('Week of'), render: (b: BonusRow) => dayLabel(b.week_start) },
              { key: 'courier', header: t('Courier'), render: (b: BonusRow) => b.driver?.name ?? '-' },
              { key: 'deliveries', header: t('Deliveries'), align: 'end', render: (b: BonusRow) => b.deliveries_count },
              { key: 'note', header: t('Rule'), render: (b: BonusRow) => <span style={{ color: 'var(--ui-text-muted)', fontSize: 12 }}>{(b.note ?? '').replace('Weekly bonus: ', '')}</span> },
              { key: 'bonus', header: t('Bonus'), align: 'end', render: (b: BonusRow) => <MoneyText amount={b.bonus_usd} size="sm" highlightPositive /> },
            ]}
            data={bonuses}
            keyField="id"
            emptyMessage={t('No bonus has been awarded yet.')}
          />
        </>
      )}

      {tab === 'cash' && (
        <>
          <p style={{ fontSize: 13, color: 'var(--ui-text-muted)', margin: '0 0 14px' }}>
            {t('Delivered orders in the last 60 days where the cash the courier recorded at the door is not the amount due. A negative figure means the courier collected less than expected.')}
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, marginBottom: 20 }}>
            {byCourier.slice(0, 4).map(row => (
              <KpiCard key={row.id} title={row.name} value={<MoneyText amount={row.net} size="lg" showPlus highlightPositive />} subtext={orderCount(row.count)} tone={row.net < 0 ? 'danger' : 'default'} />
            ))}
          </div>
          <DataTable
            columns={[
              { key: 'when', header: t('statusDelivered'), render: (d: DifferenceRow) => formatDate(d.delivered_at, locale) },
              { key: 'code', header: t('Order'), render: (d: DifferenceRow) => <Link href={`/orders?search=${encodeURIComponent(d.code)}`} style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--ui-primary)' }}>{d.code}</Link> },
              { key: 'courier', header: t('Courier'), render: (d: DifferenceRow) => d.driver?.name ?? '-' },
              { key: 'shop', header: t('Shop'), render: (d: DifferenceRow) => d.shop?.name ?? '-' },
              { key: 'due', header: t('Cash due'), align: 'end', render: (d: DifferenceRow) => <MoneyText amount={d.collection_usd} size="sm" highlightNegative={false} /> },
              { key: 'diff', header: t('Difference'), align: 'end', render: (d: DifferenceRow) => <MoneyText amount={d.cash_discrepancy_usd} size="sm" showPlus highlightPositive /> },
            ]}
            data={differences}
            keyField="id"
            emptyMessage={<EmptyState icon="✅" title={t('No cash differences')} description={t('Every delivered order in the last 60 days matched the cash that was due.')} />}
          />
        </>
      )}

      <ConfirmDialog
        isOpen={confirmOpen}
        title={t('Pay {couriers}?', { couriers: courierCount(selectedCouriers.length) })}
        description={
          <div>
            <p style={{ margin: '0 0 10px' }}>
              {t('This records')} <strong>{formatUSD(selectedTotal)}</strong> {t('as paid and lowers the pay each courier is owed. You hand over the money yourself.')}
            </p>
            <ul style={{ margin: 0, paddingInlineStart: 18, fontSize: 13 }}>
              {selectedCouriers.map(c => <li key={c.id}>{c.name}: <strong>{formatUSD(amountFor(c))}</strong></li>)}
            </ul>
            {payError && <p role="alert" style={{ color: 'var(--ui-danger)', margin: '10px 0 0' }}>{payError}</p>}
          </div>
        }
        confirmLabel={paying ? t('Recording...') : t('Record pay')}
        tone="primary"
        loading={paying}
        onConfirm={payCouriers}
        onClose={() => setConfirmOpen(false)}
      />

      <ConfirmDialog
        isOpen={removing !== null}
        title={t('Delete this bonus rule?')}
        description={t('"{name}" will no longer be used. Bonuses already paid stay on record.', { name: removing?.name ?? '' })}
        confirmLabel={t('Delete rule')}
        onConfirm={removeRule}
        onClose={() => setRemoving(null)}
      />

      <Drawer isOpen={ruleOpen} onClose={() => setRuleOpen(false)} title={editing ? t('Edit bonus rule') : t('New bonus rule')} width={420}>
        <form onSubmit={saveRule} style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '8px 0' }}>
          <Field label={t('Rule name')}><input value={ruleName} onChange={e => setRuleName(e.target.value)} placeholder={t('e.g. 30 a week')} maxLength={100} style={inputStyle} required /></Field>
          <Field label={t('Deliveries needed in a week')}><input type="number" min="1" step="1" value={ruleMin} onChange={e => setRuleMin(e.target.value)} style={inputStyle} required /></Field>
          <Field label={t('Bonus (USD)')} hint={t('Added to what the courier is owed.')}><input type="number" min="0.01" step="0.01" value={ruleBonus} onChange={e => setRuleBonus(e.target.value)} style={inputStyle} required /></Field>
          <FormError message={ruleError} />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <Button variant="subtle" onClick={() => setRuleOpen(false)}>{t('actionCancel')}</Button>
            <Button type="submit" disabled={ruleSaving}>{ruleSaving ? t('Saving...') : t('Save rule')}</Button>
          </div>
        </form>
      </Drawer>
    </div>
  )
}
