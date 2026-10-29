'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { PageHeader } from '@/components/page-header'
import { Button, ConfirmDialog, DataTable, EmptyState, KpiCard, MoneyText, Tag, useToast, type Column } from '@/components/ui'
import { inputStyle } from '@/components/finance-form'
import { useI18n } from '@/lib/i18n'
import {
  PAYOUT_METHOD_LABELS,
  WEEKDAY_LABELS,
  csvRow,
  isPayoutDay,
  nextPayoutDay,
  payoutCandidates,
  sumUsd,
  type PayoutCandidate,
  type PayoutMethod,
  type Weekday,
} from '@/lib/finance'
import { downloadCsv, errorMessage, newRequestId, sendJson } from '@/lib/finance-client'
import { formatDate, formatUSD } from '@/lib/utils'

export interface ShopPayoutRow {
  id: string
  name: string
  phone: string | null
  balance_usd: number
  payout_method: string
  payout_account: string | null
}

export interface PayoutRunRow {
  id: string
  total_amount_usd: number
  item_count: number
  created_at: string
}

interface PayoutsClientProps {
  workspaceId: string
  schedule: { days: string[]; minUsd: number }
  shops: ShopPayoutRow[]
  reserved: Record<string, number>
  runs: PayoutRunRow[]
}

type Candidate = PayoutCandidate<ShopPayoutRow>

const methodLabel = (method: string) => PAYOUT_METHOD_LABELS[method as PayoutMethod] ?? method

export function PayoutsClient({ workspaceId, schedule, shops, reserved, runs }: PayoutsClientProps) {
  const router = useRouter()
  const toast = useToast()
  const { t, locale } = useI18n()
  /** "1 shop" or "3 shops"; the Arabic has a line for each */
  const shopCount = (count: number) => (count === 1 ? t('1 shop') : t('{count} shops', { count }))

  const candidates = useMemo(() => payoutCandidates(shops, reserved, schedule.minUsd), [shops, reserved, schedule.minUsd])
  const belowMinimum = useMemo(
    () => shops.filter(s => s.balance_usd > 0).length - candidates.length,
    [shops, candidates],
  )

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [amounts, setAmounts] = useState<Record<string, string>>({})
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState('')
  // One request ID per click on "Pay selected": retrying the same click can never pay twice
  const requestId = useRef('')

  // "Today" is read after mounting so the server and browser agree on what they first render
  const [today, setToday] = useState<Date | null>(null)
  useEffect(() => setToday(new Date()), [])

  const amountFor = (row: Candidate) => {
    const typed = amounts[row.id]
    return typed === undefined || typed === '' ? row.available_usd : Number(typed)
  }
  const problemFor = (row: Candidate): string => {
    const amount = amountFor(row)
    if (!Number.isFinite(amount) || amount <= 0) return t('Enter an amount')
    if (Math.abs(amount * 100 - Math.round(amount * 100)) > 1e-6) return t('Use dollars and cents')
    if (amount > row.available_usd) return t('More than the available balance')
    if (amount < schedule.minUsd) return t('Payouts start at {amount}', { amount: formatUSD(schedule.minUsd) })
    return ''
  }

  const selectedRows = candidates.filter(c => selected.has(c.id))
  const total = sumUsd(selectedRows.map(amountFor))
  const hasProblem = selectedRows.some(row => problemFor(row))
  const readyTotal = sumUsd(candidates.map(c => c.available_usd))

  function openConfirm() {
    requestId.current = newRequestId()
    setFormError('')
    setConfirmOpen(true)
  }

  async function paySelected() {
    setSubmitting(true)
    setFormError('')
    try {
      const { run } = await sendJson<{ run: { replayed: boolean; count: number; total_usd: number } }>('/api/finance/payouts', 'POST', {
        workspaceId,
        kind: 'shops',
        idempotencyKey: requestId.current,
        payouts: selectedRows.map(row => ({ id: row.id, amountUsd: amountFor(row), note: '' })),
      })
      setConfirmOpen(false)
      setSelected(new Set())
      setAmounts({})
      toast.success(
        run.replayed
          ? t('That payout run was already recorded. Nothing was paid twice.')
          : t('Paid {shops}: {amount}', { shops: shopCount(run.count), amount: formatUSD(Number(run.total_usd)) }),
      )
      router.refresh()
    } catch (error) {
      setFormError(errorMessage(error))
    } finally {
      setSubmitting(false)
    }
  }

  function exportSelected() {
    downloadCsv(`shop-payouts-${new Date().toISOString().slice(0, 10)}.csv`, [
      csvRow(['Shop', 'Phone', 'Pay by', 'Account', 'Amount USD']),
      ...selectedRows.map(row => csvRow([row.name, row.phone, methodLabel(row.payout_method), row.payout_account, amountFor(row).toFixed(2)])),
    ])
  }

  const nextDay = today ? nextPayoutDay(schedule.days, today) : null
  const isToday = today ? isPayoutDay(schedule.days, today) : false
  const scheduleText = schedule.days.length
    ? schedule.days.map(day => t(WEEKDAY_LABELS[day as Weekday] ?? day)).join(t(' and '))
    : t('No payout days set')

  const columns: Column<Candidate>[] = [
    {
      key: 'shop',
      header: t('Shop'),
      render: row => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Link href={`/shops/${row.id}`} style={{ fontWeight: 700, color: 'var(--ui-primary)' }}>{row.name}</Link>
          {row.phone && <span style={{ fontSize: 11, color: 'var(--ui-text-muted)' }}>{row.phone}</span>}
        </div>
      ),
    },
    {
      key: 'method',
      header: t('Pay by'),
      render: row => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ fontWeight: 600 }}>{t(methodLabel(row.payout_method))}</span>
          {row.payout_account ? (
            <span style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--ui-text-muted)' }}>{row.payout_account}</span>
          ) : row.payout_method !== 'cash' ? (
            <Tag tone="warning">{t('No account saved')}</Tag>
          ) : null}
        </div>
      ),
    },
    { key: 'balance', header: t('Balance'), align: 'end', render: row => <MoneyText amount={row.balance_usd} size="sm" /> },
    {
      key: 'reserved',
      header: t('Reserved'),
      align: 'end',
      render: row =>
        row.reserved_usd > 0 ? (
          <span title={t('Held for cash-out requests the shop already made')} style={{ cursor: 'help' }}>
            <MoneyText amount={row.reserved_usd} size="sm" />
          </span>
        ) : (
          <span style={{ color: 'var(--ui-text-muted)' }}>-</span>
        ),
    },
    { key: 'available', header: t('Available'), align: 'end', render: row => <MoneyText amount={row.available_usd} size="sm" highlightPositive /> },
    {
      key: 'pay',
      header: t('Pay now'),
      width: '170px',
      render: row => {
        const isSelected = selected.has(row.id)
        const problem = isSelected ? problemFor(row) : ''
        return (
          <div>
            <input
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              aria-label={t('Amount to pay {name}', { name: row.name })}
              value={amounts[row.id] ?? row.available_usd.toFixed(2)}
              disabled={!isSelected}
              onChange={event => setAmounts(prev => ({ ...prev, [row.id]: event.target.value }))}
              style={{ ...inputStyle, padding: '5px 8px', textAlign: 'right', borderColor: problem ? 'var(--ui-danger)' : 'var(--ui-border)' }}
            />
            {problem && <div style={{ fontSize: 11, color: 'var(--ui-danger)', marginTop: 2 }}>{problem}</div>}
          </div>
        )
      },
    },
  ]

  return (
    <div>
      <PageHeader
        title={t('navPayouts')}
        subtitle={t('Pay the shops that are owed money in one step. Each run is recorded and cannot be paid twice.')}
        breadcrumbs={[{ label: t('navOverview'), href: '/' }, { label: t('Finance') }, { label: t('navPayouts') }]}
        actions={
          <>
            <Link href="/finance/courier-pay" className="ui-btn ui-btn--subtle ui-btn--sm">{t('navCourierPay')}</Link>
            <Link href="/statements" className="ui-btn ui-btn--subtle ui-btn--sm">{t('Single payment or collection')}</Link>
          </>
        }
      />

      <div
        role="status"
        style={{
          display: 'flex', flexWrap: 'wrap', gap: '6px 18px', alignItems: 'center', marginBottom: 16, padding: '10px 14px', borderRadius: 8,
          border: `1px solid ${isToday ? 'var(--ui-primary)' : 'var(--ui-border)'}`,
          background: isToday ? 'var(--ui-primary-soft)' : 'var(--ui-surface)', fontSize: 13,
        }}
      >
        <span><strong>{t('Payout days:')}</strong> {scheduleText}</span>
        <span><strong>{t('Smallest payout:')}</strong> {formatUSD(schedule.minUsd)}</span>
        {today && schedule.days.length > 0 && (
          <span style={{ fontWeight: 700, color: isToday ? 'var(--ui-primary)' : 'var(--ui-text)' }}>
            {isToday
              ? t('Today is a payout day')
              : nextDay
              ? t('Next payout day: {day}', { day: new Intl.DateTimeFormat(locale === 'ar' ? 'ar-LB-u-nu-latn' : 'en-GB', { weekday: 'long', day: 'numeric', month: 'short' }).format(nextDay) })
              : ''}
          </span>
        )}
        <Link href="/settings" style={{ marginInlineStart: 'auto', color: 'var(--ui-primary)', fontSize: 12 }}>{t('Change schedule')}</Link>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, marginBottom: 20 }}>
        <KpiCard title={t('Shops ready to pay')} value={candidates.length} subtext={belowMinimum > 0 ? t('{count} below the minimum, not listed', { count: belowMinimum }) : undefined} />
        <KpiCard title={t('Total ready to pay')} value={<MoneyText amount={readyTotal} size="lg" />} />
        <KpiCard title={t('Selected for this run')} value={<MoneyText amount={total} size="lg" />} subtext={shopCount(selectedRows.length)} tone={selectedRows.length ? 'primary' : 'default'} />
      </div>

      <DataTable
        columns={columns}
        data={candidates}
        keyField="id"
        selectedKeys={selected}
        onSelectionChange={setSelected}
        bulkActions={
          <>
            <Button size="sm" variant="subtle" onClick={exportSelected}>{t('Download list (CSV)')}</Button>
            <Button size="sm" disabled={hasProblem} onClick={openConfirm}>
              {t('Pay selected ({amount})', { amount: formatUSD(total) })}
            </Button>
          </>
        }
        emptyMessage={
          <EmptyState
            icon="💵"
            title={t('No shop is ready for a payout')}
            description={t('A shop appears here when its available balance reaches {amount}. Money reserved for pending cash-out requests is left out.', { amount: formatUSD(schedule.minUsd) })}
          />
        }
      />

      <h2 style={{ fontSize: 15, fontWeight: 800, margin: '28px 0 10px' }}>{t('Recent payout runs')}</h2>
      <DataTable
        columns={[
          { key: 'when', header: t('When'), render: (run: PayoutRunRow) => formatDate(run.created_at, locale) },
          { key: 'count', header: t('Shops paid'), align: 'end', render: (run: PayoutRunRow) => run.item_count },
          { key: 'total', header: t('Total'), align: 'end', render: (run: PayoutRunRow) => <MoneyText amount={run.total_amount_usd} size="sm" /> },
        ]}
        data={runs}
        keyField="id"
        emptyMessage={t('No payout run has been made yet.')}
      />

      <ConfirmDialog
        isOpen={confirmOpen}
        title={t('Pay {shops}?', { shops: shopCount(selectedRows.length) })}
        description={
          <div>
            <p style={{ margin: '0 0 10px' }}>
              {t('This records')} <strong>{formatUSD(total)}</strong> {t("as paid and lowers each shop's balance. You hand over the money yourself (cash, Whish, OMT or bank), so check the account details first.")}
            </p>
            <ul style={{ margin: 0, paddingInlineStart: 18, fontSize: 13 }}>
              {selectedRows.map(row => (
                <li key={row.id}>
                  {row.name}: <strong>{formatUSD(amountFor(row))}</strong> {t('by')} {t(methodLabel(row.payout_method))}
                  {row.payout_account ? ` (${row.payout_account})` : ''}
                </li>
              ))}
            </ul>
            {formError && <p role="alert" style={{ color: 'var(--ui-danger)', margin: '10px 0 0' }}>{formError}</p>}
          </div>
        }
        confirmLabel={submitting ? t('Recording...') : t('Record payouts')}
        tone="primary"
        loading={submitting}
        onConfirm={paySelected}
        onClose={() => setConfirmOpen(false)}
      />
    </div>
  )
}
