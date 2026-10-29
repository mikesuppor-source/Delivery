'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Button, DataTable, EmptyState, KpiCard, MoneyText, type Column } from '@/components/ui'
import { useI18n } from '@/lib/i18n'
import { EXPENSE_CATEGORY_LABELS, csvRow, isoDate, type ExpenseCategory, type PnlMonth, type PnlReport } from '@/lib/finance'
import { downloadCsv, errorMessage } from '@/lib/finance-client'
import { formatUSD } from '@/lib/utils'

type Preset = 'this_month' | 'last_month' | 'last_3_months' | 'this_year' | 'last_12_months'
const PRESETS: Array<[Preset, string]> = [
  ['this_month', 'This month'],
  ['last_month', 'Last month'],
  ['last_3_months', 'Last 3 months'],
  ['this_year', 'This year'],
  ['last_12_months', 'Last 12 months'],
]

function rangeFor(preset: Preset, now = new Date()): { from: string; to: string } {
  const [y, m] = [now.getUTCFullYear(), now.getUTCMonth()]
  const first = (month: number) => isoDate(new Date(Date.UTC(y, month, 1)))
  switch (preset) {
    case 'this_month': return { from: first(m), to: isoDate(now) }
    case 'last_month': return { from: first(m - 1), to: isoDate(new Date(Date.UTC(y, m, 0))) }
    case 'last_3_months': return { from: first(m - 2), to: isoDate(now) }
    case 'this_year': return { from: first(0), to: isoDate(now) }
    case 'last_12_months': return { from: first(m - 11), to: isoDate(now) }
  }
}

const monthNameIn = (locale: string) => (iso: string) =>
  new Intl.DateTimeFormat(locale === 'ar' ? 'ar-LB-u-nu-latn' : 'en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(iso + 'T00:00:00Z'))

/** Revenue and cost bars for each month. The table below has the exact figures for screen readers. */
export function MonthlyChart({ months }: { months: PnlMonth[] }) {
  const { t, locale } = useI18n()
  const monthName = monthNameIn(locale)
  const slot = 84
  const width = Math.max(months.length * slot + 24, 320)
  const height = 190
  const top = 14
  const base = height - 36
  const peak = Math.max(1, ...months.flatMap(m => [Number(m.revenue_usd), Number(m.total_cost_usd)]))
  const barHeight = (value: number) => Math.max((Math.max(value, 0) / peak) * (base - top), value > 0 ? 2 : 0)
  const summary = months
    .map(m => t('{month}: revenue {revenue}, costs {costs}', { month: monthName(m.month), revenue: formatUSD(Number(m.revenue_usd)), costs: formatUSD(Number(m.total_cost_usd)) }))
    .join('; ')

  return (
    <div className="ui-box" style={{ padding: '14px 16px', marginBottom: 20, overflowX: 'auto' }}>
      <div style={{ display: 'flex', gap: 16, fontSize: 12, marginBottom: 6, color: 'var(--ui-text-muted)' }}>
        <span><span aria-hidden style={{ display: 'inline-block', width: 10, height: 10, background: 'var(--ui-primary)', borderRadius: 2, marginInlineEnd: 6 }} />{t('Revenue')}</span>
        <span><span aria-hidden style={{ display: 'inline-block', width: 10, height: 10, background: 'var(--ui-warning)', borderRadius: 2, marginInlineEnd: 6 }} />{t('Costs (courier pay, bonuses, expenses)')}</span>
      </div>
      <svg role="img" aria-label={t('Monthly revenue and costs. {summary}', { summary })} viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', minWidth: Math.min(width, 520), height: 'auto', maxHeight: 240 }}>
        <line x1="12" x2={width - 12} y1={base} y2={base} stroke="var(--ui-border)" />
        {months.map((m, i) => {
          const x = 12 + i * slot
          const revenue = barHeight(Number(m.revenue_usd))
          const cost = barHeight(Number(m.total_cost_usd))
          const net = Number(m.net_profit_usd)
          return (
            <g key={m.month}>
              <rect x={x + 10} y={base - revenue} width={26} height={revenue} rx={3} fill="var(--ui-primary)" />
              <rect x={x + 40} y={base - cost} width={26} height={cost} rx={3} fill="var(--ui-warning)" />
              <text x={x + 38} y={base + 14} textAnchor="middle" fontSize="10.5" fill="var(--ui-text-muted)">{monthName(m.month)}</text>
              {/* The sign must stay in front of the figure when the page is right to left */}
              <text x={x + 38} y={base + 28} textAnchor="middle" fontSize="10.5" fontWeight="700" direction="ltr" fill={net < 0 ? 'var(--ui-danger)' : 'var(--ui-success)'}>
                {net < 0 ? '-' : ''}{formatUSD(Math.abs(net)).replace('.00', '')}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

export function PnlSection({ workspaceId }: { workspaceId: string }) {
  const { t, locale } = useI18n()
  const monthName = monthNameIn(locale)
  const [preset, setPreset] = useState<Preset>('last_3_months')
  const [report, setReport] = useState<PnlReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async (which: Preset) => {
    setLoading(true)
    setError('')
    try {
      const { from, to } = rangeFor(which)
      const res = await fetch(`/api/reports/pnl?workspaceId=${encodeURIComponent(workspaceId)}&from=${from}&to=${to}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not build the report')
      setReport(data.report)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [workspaceId])

  useEffect(() => { void load(preset) }, [load, preset])

  const totals = report?.totals
  const months = useMemo(() => report?.months ?? [], [report])
  const net = Number(totals?.net_profit_usd ?? 0)

  function exportCsv() {
    if (!report) return
    downloadCsv(`profit-and-loss-${report.from}-to-${report.to}.csv`, [
      csvRow(['Month', 'Delivered', 'Returned', 'Delivery fees', 'Storage fees', 'Revenue', 'Courier pay', 'Bonuses', 'Expenses', 'Net profit']),
      ...report.months.map(m => csvRow([m.month.slice(0, 7), m.delivered_orders, m.returned_orders, m.delivery_fees_usd, m.storage_fees_usd, m.revenue_usd, m.courier_pay_usd, m.bonuses_usd, m.expenses_usd, m.net_profit_usd])),
      csvRow(['Total', report.totals.delivered_orders, report.totals.returned_orders, report.totals.delivery_fees_usd, report.totals.storage_fees_usd, report.totals.revenue_usd, report.totals.courier_pay_usd, report.totals.bonuses_usd, report.totals.expenses_usd, report.totals.net_profit_usd]),
    ])
  }

  const columns: Column<PnlMonth>[] = [
    { key: 'month', header: t('Month'), render: m => <strong>{monthName(m.month)}</strong> },
    { key: 'orders', header: t('Delivered / returned'), align: 'end', render: m => `${m.delivered_orders} / ${m.returned_orders}` },
    { key: 'revenue', header: t('Revenue'), align: 'end', render: m => <MoneyText amount={m.revenue_usd} size="sm" highlightNegative={false} /> },
    { key: 'pay', header: t('Courier pay'), align: 'end', render: m => <MoneyText amount={m.courier_pay_usd} size="sm" highlightNegative={false} /> },
    { key: 'bonuses', header: t('Bonuses'), align: 'end', render: m => <MoneyText amount={m.bonuses_usd} size="sm" highlightNegative={false} /> },
    { key: 'expenses', header: t('navExpenses'), align: 'end', render: m => <MoneyText amount={m.expenses_usd} size="sm" highlightNegative={false} /> },
    { key: 'net', header: t('Net profit'), align: 'end', render: m => <MoneyText amount={m.net_profit_usd} size="sm" highlightPositive /> },
  ]

  return (
    <div>
      <div className="panel" style={{ padding: '14px 20px', marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {PRESETS.map(([key, label]) => (
            <button key={key} type="button" className={`btn btn-sm ${preset === key ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setPreset(key)} style={{ fontSize: 12, padding: '4px 12px' }}>
              {t(label)}
            </button>
          ))}
        </div>
        <Button size="sm" variant="subtle" onClick={exportCsv} disabled={!report}>{t('actionExportCsv')}</Button>
      </div>

      {error && <div role="alert" style={{ padding: '12px 18px', borderRadius: 8, background: 'var(--ui-danger-soft)', color: 'var(--ui-danger)', marginBottom: 20, fontSize: 13 }}>{error}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 20, opacity: loading ? 0.6 : 1 }}>
        <KpiCard title={t('Revenue')} value={<MoneyText amount={Number(totals?.revenue_usd ?? 0)} size="lg" highlightNegative={false} />} subtext={t('Delivery and storage fees')} />
        <KpiCard title={t('Courier pay')} value={<MoneyText amount={Number(totals?.courier_pay_usd ?? 0)} size="lg" highlightNegative={false} />} />
        <KpiCard title={t('Bonuses')} value={<MoneyText amount={Number(totals?.bonuses_usd ?? 0)} size="lg" highlightNegative={false} />} />
        <KpiCard title={t('navExpenses')} value={<MoneyText amount={Number(totals?.expenses_usd ?? 0)} size="lg" highlightNegative={false} />} />
        <KpiCard title={t('Net profit')} value={<MoneyText amount={net} size="xl" />} subtext={t('Revenue minus all costs')} tone={net < 0 ? 'danger' : 'success'} />
      </div>

      {months.length > 0 && <MonthlyChart months={months} />}

      <DataTable
        columns={columns}
        data={months}
        keyField="month"
        loading={loading && !report}
        emptyMessage={<EmptyState icon="📊" title={t('Nothing to report for these dates')} description={t('Deliveries, bonuses and expenses in the period will appear here.')} />}
      />

      {report && report.expenses_by_category.length > 0 && (
        <div className="ui-box" style={{ padding: '14px 18px', marginTop: 20 }}>
          <h2 style={{ fontSize: 14, fontWeight: 800, margin: '0 0 10px' }}>{t('Expenses by category')}</h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 24px' }}>
            {report.expenses_by_category.map(c => (
              <span key={c.category} style={{ fontSize: 13 }}>
                {t(EXPENSE_CATEGORY_LABELS[c.category as ExpenseCategory] ?? c.category)}: <strong>{formatUSD(Number(c.amount_usd))}</strong>
              </span>
            ))}
          </div>
        </div>
      )}

      <p style={{ fontSize: 12, color: 'var(--ui-text-muted)', margin: '16px 0 0' }}>
        {t('An order counts in the month it was delivered, or first marked returned. Bonuses count in the month their week starts. Expenses in pounds use the exchange rate saved with each expense. Dates are UTC.')}
      </p>
    </div>
  )
}
