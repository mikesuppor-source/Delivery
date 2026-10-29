'use client'

import React, { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { PageHeader } from '@/components/page-header'
import { Button, ConfirmDialog, DataTable, Drawer, EmptyState, FilterBar, KpiCard, MoneyText, Tag, useToast, type Column } from '@/components/ui'
import { Field, FormError, inputStyle } from '@/components/finance-form'
import { useI18n } from '@/lib/i18n'
import { EXPENSE_CATEGORIES, EXPENSE_CATEGORY_LABELS, csvRow, isoDate, sumUsd, type ExpenseCategory } from '@/lib/finance'
import { downloadCsv, errorMessage, sendJson } from '@/lib/finance-client'
import { formatLBP } from '@/lib/utils'

export interface ExpenseRow {
  id: string
  date: string
  category: string
  amount_usd: number
  amount_lbp: number
  usd_to_lbp: number
  note: string | null
}

interface Props {
  workspaceId: string
  /** Today's rate, shown when typing a pound amount; saved expenses keep the rate they were booked at. */
  rate: number
  expenses: ExpenseRow[]
}

/** What an expense cost in dollars, using the rate it was booked at. */
const costUsd = (e: ExpenseRow) => sumUsd([e.amount_usd, e.usd_to_lbp > 0 ? Math.round((e.amount_lbp / e.usd_to_lbp) * 100) / 100 : 0])
const monthKey = (date: string) => date.slice(0, 7)
const monthLabel = (key: string) => new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(key + '-01T00:00:00Z'))
const categoryLabel = (category: string) => EXPENSE_CATEGORY_LABELS[category as ExpenseCategory] ?? category

export function ExpensesClient({ workspaceId, rate, expenses }: Props) {
  const router = useRouter()
  const toast = useToast()
  const { t } = useI18n()

  const months = useMemo(() => [...new Set(expenses.map(e => monthKey(e.date)))].sort().reverse(), [expenses])
  const thisMonth = isoDate(new Date()).slice(0, 7)
  const [month, setMonth] = useState(months.includes(thisMonth) ? thisMonth : months[0] ?? 'all')
  const [category, setCategory] = useState('all')
  const [search, setSearch] = useState('')

  const shown = useMemo(
    () =>
      expenses.filter(e => {
        if (month !== 'all' && monthKey(e.date) !== month) return false
        if (category !== 'all' && e.category !== category) return false
        if (search.trim() && !(e.note ?? '').toLowerCase().includes(search.trim().toLowerCase())) return false
        return true
      }),
    [expenses, month, category, search],
  )
  const total = sumUsd(shown.map(costUsd))
  const byCategory = useMemo(() => {
    const totals = new Map<string, number>()
    for (const e of shown) totals.set(e.category, sumUsd([totals.get(e.category) ?? 0, costUsd(e)]))
    return [...totals.entries()].sort((a, b) => b[1] - a[1])
  }, [shown])

  // ── Add / edit ──
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<ExpenseRow | null>(null)
  const [date, setDate] = useState(isoDate(new Date()))
  const [formCategory, setFormCategory] = useState<ExpenseCategory>('fuel')
  const [amountUsd, setAmountUsd] = useState('')
  const [amountLbp, setAmountLbp] = useState('')
  const [note, setNote] = useState('')
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const [removing, setRemoving] = useState<ExpenseRow | null>(null)

  function openForm(expense: ExpenseRow | null) {
    setEditing(expense)
    setDate(expense?.date ?? isoDate(new Date()))
    setFormCategory((expense?.category as ExpenseCategory) ?? 'fuel')
    setAmountUsd(expense && expense.amount_usd ? expense.amount_usd.toFixed(2) : '')
    setAmountLbp(expense && expense.amount_lbp ? String(expense.amount_lbp) : '')
    setNote(expense?.note ?? '')
    setFormError('')
    setFormOpen(true)
  }

  async function save(event: React.FormEvent) {
    event.preventDefault()
    setSaving(true)
    setFormError('')
    try {
      const usd = amountUsd === '' ? 0 : Number(amountUsd)
      const lbp = amountLbp === '' ? 0 : Number(amountLbp)
      if (!(usd >= 0) || !(lbp >= 0)) throw new Error('Amounts cannot be negative')
      if (usd === 0 && lbp === 0) throw new Error('Enter an amount in dollars, pounds, or both')
      await sendJson('/api/finance/expenses', editing ? 'PATCH' : 'POST', {
        workspaceId,
        ...(editing ? { id: editing.id } : {}),
        date,
        category: formCategory,
        amountUsd: usd,
        amountLbp: lbp,
        note: note.trim(),
      })
      setFormOpen(false)
      toast.success(editing ? 'Expense updated' : 'Expense added')
      router.refresh()
    } catch (error) {
      setFormError(errorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  async function remove() {
    if (!removing) return
    try {
      await sendJson('/api/finance/expenses', 'DELETE', { workspaceId, id: removing.id })
      setRemoving(null)
      toast.success('Expense deleted')
      router.refresh()
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  function exportCsv() {
    downloadCsv(`expenses-${month}.csv`, [
      csvRow(['Date', 'Category', 'Note', 'USD', 'LBP', 'Rate', 'Total USD']),
      ...shown.map(e => csvRow([e.date, categoryLabel(e.category), e.note, e.amount_usd.toFixed(2), e.amount_lbp, e.usd_to_lbp, costUsd(e).toFixed(2)])),
    ])
  }

  const columns: Column<ExpenseRow>[] = [
    { key: 'date', header: 'Date', width: '120px', render: e => <span style={{ fontVariantNumeric: 'tabular-nums' }}>{e.date}</span> },
    { key: 'category', header: 'Category', render: e => <Tag tone="neutral">{categoryLabel(e.category)}</Tag> },
    { key: 'note', header: 'Note', render: e => <span style={{ color: e.note ? 'var(--ui-text)' : 'var(--ui-text-muted)' }}>{e.note || '-'}</span> },
    { key: 'usd', header: 'USD', align: 'end', render: e => (e.amount_usd ? <MoneyText amount={e.amount_usd} size="sm" highlightNegative={false} /> : <span style={{ color: 'var(--ui-text-muted)' }}>-</span>) },
    { key: 'lbp', header: 'LBP', align: 'end', render: e => (e.amount_lbp ? <span dir="ltr" style={{ fontVariantNumeric: 'tabular-nums' }}>{formatLBP(e.amount_lbp)}</span> : <span style={{ color: 'var(--ui-text-muted)' }}>-</span>) },
    { key: 'total', header: 'Total (USD)', align: 'end', render: e => <MoneyText amount={costUsd(e)} size="sm" highlightNegative={false} /> },
    {
      key: 'actions',
      header: '',
      align: 'end',
      width: '140px',
      render: e => (
        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
          <Button size="sm" variant="subtle" onClick={() => openForm(e)}>Edit</Button>
          <Button size="sm" variant="danger" onClick={() => setRemoving(e)}>Delete</Button>
        </div>
      ),
    },
  ]

  return (
    <div>
      <PageHeader
        title={t('navExpenses')}
        subtitle="Record what the company spends. Expenses feed the profit and loss report."
        breadcrumbs={[{ label: 'Overview', href: '/' }, { label: 'Finance' }, { label: t('navExpenses') }]}
        actions={
          <>
            <Button variant="subtle" size="sm" onClick={exportCsv} disabled={!shown.length}>Export CSV</Button>
            <Button size="sm" onClick={() => openForm(null)}>Add expense</Button>
          </>
        }
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, marginBottom: 16 }}>
        <KpiCard title={month === 'all' ? 'Total expenses' : `Spent in ${monthLabel(month)}`} value={<MoneyText amount={total} size="lg" highlightNegative={false} />} subtext={`${shown.length} expense${shown.length === 1 ? '' : 's'}`} tone="primary" />
        {byCategory.slice(0, 3).map(([name, amount]) => (
          <KpiCard key={name} title={categoryLabel(name)} value={<MoneyText amount={amount} size="lg" highlightNegative={false} />} />
        ))}
      </div>

      <div style={{ marginBottom: 16 }}>
        <FilterBar
          search={{ value: search, onChange: setSearch, placeholder: 'Search notes...' }}
          onClearAll={() => { setSearch(''); setCategory('all'); setMonth('all') }}
        >
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <select value={month} onChange={e => setMonth(e.target.value)} className="ui-select" aria-label="Month" style={{ fontSize: 13, padding: '6px 10px' }}>
              <option value="all">All months</option>
              {months.map(m => <option key={m} value={m}>{monthLabel(m)}</option>)}
            </select>
            <select value={category} onChange={e => setCategory(e.target.value)} className="ui-select" aria-label="Category" style={{ fontSize: 13, padding: '6px 10px' }}>
              <option value="all">All categories</option>
              {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{EXPENSE_CATEGORY_LABELS[c]}</option>)}
            </select>
          </div>
        </FilterBar>
      </div>

      <DataTable
        columns={columns}
        data={shown}
        keyField="id"
        emptyMessage={
          <EmptyState
            icon="🧾"
            title="No expenses here yet"
            description="Add fuel, salaries, rent and other costs so the profit and loss report shows what is really left."
            action={<Button size="sm" onClick={() => openForm(null)}>Add expense</Button>}
          />
        }
      />

      <Drawer isOpen={formOpen} onClose={() => setFormOpen(false)} title={editing ? 'Edit expense' : 'Add expense'} width={440}>
        <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '8px 0' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Date"><input type="date" value={date} max={isoDate(new Date(Date.now() + 86400000))} onChange={e => setDate(e.target.value)} style={inputStyle} required /></Field>
            <Field label="Category">
              <select value={formCategory} onChange={e => setFormCategory(e.target.value as ExpenseCategory)} style={inputStyle}>
                {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{EXPENSE_CATEGORY_LABELS[c]}</option>)}
              </select>
            </Field>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Amount in USD"><input type="number" min="0" step="0.01" inputMode="decimal" value={amountUsd} onChange={e => setAmountUsd(e.target.value)} style={inputStyle} /></Field>
            <Field label="Amount in LBP" hint={rate > 0 && !editing ? `Counted at today's rate of ${rate.toLocaleString('en-US')}` : undefined}>
              <input type="number" min="0" step="1000" inputMode="numeric" value={amountLbp} onChange={e => setAmountLbp(e.target.value)} style={inputStyle} />
            </Field>
          </div>
          <Field label="Note"><input value={note} onChange={e => setNote(e.target.value)} maxLength={500} placeholder="What was this for?" style={inputStyle} /></Field>
          <FormError message={formError} />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <Button variant="subtle" onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Saving...' : editing ? 'Save changes' : 'Add expense'}</Button>
          </div>
        </form>
      </Drawer>

      <ConfirmDialog
        isOpen={removing !== null}
        title="Delete this expense?"
        description={removing ? `${categoryLabel(removing.category)} on ${removing.date} will be removed from the profit and loss report.` : ''}
        confirmLabel="Delete expense"
        onConfirm={remove}
        onClose={() => setRemoving(null)}
      />
    </div>
  )
}
