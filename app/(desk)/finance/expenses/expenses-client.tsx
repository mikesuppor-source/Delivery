'use client'

import React, { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { PageHeader } from '@/components/page-header'
import { Button, ConfirmDialog, DataTable, Drawer, EmptyState, FilterBar, KpiCard, MoneyText, Tag, useToast, type Column } from '@/components/ui'
import { Field, FormError, inputStyle } from '@/components/finance-form'
import { useI18n } from '@/lib/i18n'
import { EXPENSE_CATEGORIES, EXPENSE_CATEGORY_LABELS, csvRow, isoDate, sumUsd, type ExpenseCategory } from '@/lib/finance'
import { downloadCsv, errorMessage, sendJson, uploadReceipt } from '@/lib/finance-client'
import { receiptLink } from '@/lib/receipts'
import { formatLBP } from '@/lib/utils'

export interface ExpenseRow {
  id: string
  date: string
  category: string
  amount_usd: number
  amount_lbp: number
  usd_to_lbp: number
  note: string | null
  has_receipt: boolean
}

/** The expense as the API returns it (numeric columns may arrive as text). */
interface SavedExpense {
  id: string
  date: string
  category: string
  amount_usd: number | string
  amount_lbp: number | string
  usd_to_lbp: number | string
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
/** The English name of a category: what the CSV file uses. The screen shows it through t(). */
const categoryLabel = (category: string) => EXPENSE_CATEGORY_LABELS[category as ExpenseCategory] ?? category

export function ExpensesClient({ workspaceId, rate, expenses }: Props) {
  const router = useRouter()
  const toast = useToast()
  const { t, locale } = useI18n()
  const monthLabel = (key: string) =>
    new Intl.DateTimeFormat(locale === 'ar' ? 'ar-LB-u-nu-latn' : 'en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(key + '-01T00:00:00Z'))
  const categoryText = (category: string) => t(categoryLabel(category))
  const expenseCount = (count: number) => (count === 1 ? t('1 expense') : t('{count} expenses', { count }))

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
  const [receiptFile, setReceiptFile] = useState<File | null>(null)
  const [hasReceipt, setHasReceipt] = useState(false)
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
    setReceiptFile(null)
    setHasReceipt(expense?.has_receipt ?? false)
    setFormError('')
    setFormOpen(true)
  }

  async function removeReceipt() {
    if (!editing) return
    try {
      await sendJson('/api/finance/expenses/receipt', 'DELETE', { workspaceId, expenseId: editing.id })
      setHasReceipt(false)
      toast.success(t('Receipt removed'))
      router.refresh()
    } catch (error) {
      setFormError(errorMessage(error))
    }
  }

  async function save(event: React.FormEvent) {
    event.preventDefault()
    setSaving(true)
    setFormError('')
    try {
      const usd = amountUsd === '' ? 0 : Number(amountUsd)
      const lbp = amountLbp === '' ? 0 : Number(amountLbp)
      if (!(usd >= 0) || !(lbp >= 0)) throw new Error(t('Amounts cannot be negative'))
      if (usd === 0 && lbp === 0) throw new Error(t('Enter an amount in dollars, pounds, or both'))
      const { expense } = await sendJson<{ expense: SavedExpense }>('/api/finance/expenses', editing ? 'PATCH' : 'POST', {
        workspaceId,
        ...(editing ? { id: editing.id } : {}),
        date,
        category: formCategory,
        amountUsd: usd,
        amountLbp: lbp,
        note: note.trim(),
      })
      if (receiptFile) {
        try {
          await uploadReceipt(workspaceId, expense.id, receiptFile)
        } catch (error) {
          // The expense itself is saved. Stay here, now editing it, so trying again adds only the receipt.
          setEditing({
            id: expense.id,
            date: expense.date,
            category: expense.category,
            amount_usd: Number(expense.amount_usd),
            amount_lbp: Number(expense.amount_lbp),
            usd_to_lbp: Number(expense.usd_to_lbp),
            note: expense.note,
            has_receipt: hasReceipt,
          })
          setFormError(t('The expense was saved, but its receipt was not attached: {reason}', { reason: errorMessage(error) }))
          router.refresh()
          return
        }
      }
      setFormOpen(false)
      toast.success(editing ? t('Expense updated') : t('Expense added'))
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
      toast.success(t('Expense deleted'))
      router.refresh()
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  function exportCsv() {
    downloadCsv(`expenses-${month}.csv`, [
      csvRow(['Date', 'Category', 'Note', 'USD', 'LBP', 'Rate', 'Total USD', 'Receipt']),
      ...shown.map(e => csvRow([e.date, categoryLabel(e.category), e.note, e.amount_usd.toFixed(2), e.amount_lbp, e.usd_to_lbp, costUsd(e).toFixed(2), e.has_receipt ? 'Yes' : 'No'])),
    ])
  }

  const columns: Column<ExpenseRow>[] = [
    { key: 'date', header: t('Date'), width: '120px', render: e => <span style={{ fontVariantNumeric: 'tabular-nums' }}>{e.date}</span> },
    { key: 'category', header: t('Category'), render: e => <Tag tone="neutral">{categoryText(e.category)}</Tag> },
    { key: 'note', header: t('Note'), render: e => <span style={{ color: e.note ? 'var(--ui-text)' : 'var(--ui-text-muted)' }}>{e.note || '-'}</span> },
    { key: 'usd', header: 'USD', align: 'end', render: e => (e.amount_usd ? <MoneyText amount={e.amount_usd} size="sm" highlightNegative={false} /> : <span style={{ color: 'var(--ui-text-muted)' }}>-</span>) },
    { key: 'lbp', header: 'LBP', align: 'end', render: e => (e.amount_lbp ? <span dir="ltr" style={{ fontVariantNumeric: 'tabular-nums' }}>{formatLBP(e.amount_lbp)}</span> : <span style={{ color: 'var(--ui-text-muted)' }}>-</span>) },
    { key: 'total', header: t('Total (USD)'), align: 'end', render: e => <MoneyText amount={costUsd(e)} size="sm" highlightNegative={false} /> },
    {
      key: 'receipt',
      header: t('Receipt'),
      render: e =>
        e.has_receipt ? (
          <a href={receiptLink(workspaceId, e.id)} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--ui-primary)', fontWeight: 600 }}>{t('View')}</a>
        ) : (
          <span style={{ color: 'var(--ui-text-muted)' }}>-</span>
        ),
    },
    {
      key: 'actions',
      header: '',
      align: 'end',
      width: '140px',
      render: e => (
        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
          <Button size="sm" variant="subtle" onClick={() => openForm(e)}>{t('actionEdit')}</Button>
          <Button size="sm" variant="danger" onClick={() => setRemoving(e)}>{t('actionDelete')}</Button>
        </div>
      ),
    },
  ]

  return (
    <div>
      <PageHeader
        title={t('navExpenses')}
        subtitle={t('Record what the company spends. Expenses feed the profit and loss report.')}
        breadcrumbs={[{ label: t('navOverview'), href: '/' }, { label: t('Finance') }, { label: t('navExpenses') }]}
        actions={
          <>
            <Button variant="subtle" size="sm" onClick={exportCsv} disabled={!shown.length}>{t('actionExportCsv')}</Button>
            <Button size="sm" onClick={() => openForm(null)}>{t('Add expense')}</Button>
          </>
        }
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, marginBottom: 16 }}>
        <KpiCard title={month === 'all' ? t('Total expenses') : t('Spent in {month}', { month: monthLabel(month) })} value={<MoneyText amount={total} size="lg" highlightNegative={false} />} subtext={expenseCount(shown.length)} tone="primary" />
        {byCategory.slice(0, 3).map(([name, amount]) => (
          <KpiCard key={name} title={categoryText(name)} value={<MoneyText amount={amount} size="lg" highlightNegative={false} />} />
        ))}
      </div>

      <div style={{ marginBottom: 16 }}>
        <FilterBar
          search={{ value: search, onChange: setSearch, placeholder: t('Search notes...') }}
          onClearAll={() => { setSearch(''); setCategory('all'); setMonth('all') }}
        >
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <select value={month} onChange={e => setMonth(e.target.value)} className="ui-select" aria-label={t('Month')} style={{ fontSize: 13, padding: '6px 10px', width: 'auto' }}>
              <option value="all">{t('All months')}</option>
              {months.map(m => <option key={m} value={m}>{monthLabel(m)}</option>)}
            </select>
            <select value={category} onChange={e => setCategory(e.target.value)} className="ui-select" aria-label={t('Category')} style={{ fontSize: 13, padding: '6px 10px', width: 'auto' }}>
              <option value="all">{t('All categories')}</option>
              {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{categoryText(c)}</option>)}
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
            title={t('No expenses here yet')}
            description={t('Add fuel, salaries, rent and other costs so the profit and loss report shows what is really left.')}
            action={<Button size="sm" onClick={() => openForm(null)}>{t('Add expense')}</Button>}
          />
        }
      />

      <Drawer isOpen={formOpen} onClose={() => setFormOpen(false)} title={editing ? t('Edit expense') : t('Add expense')} width={440}>
        <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '8px 0' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label={t('Date')}><input type="date" value={date} max={isoDate(new Date(Date.now() + 86400000))} onChange={e => setDate(e.target.value)} style={inputStyle} required /></Field>
            <Field label={t('Category')}>
              <select value={formCategory} onChange={e => setFormCategory(e.target.value as ExpenseCategory)} style={inputStyle}>
                {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{categoryText(c)}</option>)}
              </select>
            </Field>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label={t('Amount in USD')}><input type="number" min="0" step="0.01" inputMode="decimal" value={amountUsd} onChange={e => setAmountUsd(e.target.value)} style={inputStyle} /></Field>
            <Field label={t('Amount in LBP')} hint={rate > 0 && !editing ? t("Counted at today's rate of {rate}", { rate: rate.toLocaleString('en-US') }) : undefined}>
              <input type="number" min="0" step="1000" inputMode="numeric" value={amountLbp} onChange={e => setAmountLbp(e.target.value)} style={inputStyle} />
            </Field>
          </div>
          <Field label={t('Note')}><input value={note} onChange={e => setNote(e.target.value)} maxLength={500} placeholder={t('What was this for?')} style={inputStyle} /></Field>
          <Field label={t('Receipt')} hint={t('A photo or a PDF, up to 2.5 MB. Optional.')}>
            <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={e => setReceiptFile(e.target.files?.[0] ?? null)} style={inputStyle} />
          </Field>
          {editing && hasReceipt && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
              <span>{receiptFile ? t('A receipt is attached. The file you chose replaces it.') : t('A receipt is attached.')}</span>
              <a href={receiptLink(workspaceId, editing.id)} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--ui-primary)', fontWeight: 600 }}>{t('View')}</a>
              <Button size="sm" variant="subtle" onClick={removeReceipt}>{t('Remove')}</Button>
            </div>
          )}
          <FormError message={formError} />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <Button variant="subtle" onClick={() => setFormOpen(false)}>{t('actionCancel')}</Button>
            <Button type="submit" disabled={saving}>{saving ? t('Saving...') : editing ? t('Save changes') : t('Add expense')}</Button>
          </div>
        </form>
      </Drawer>

      <ConfirmDialog
        isOpen={removing !== null}
        title={t('Delete this expense?')}
        description={removing ? t('{category} on {date} will be removed from the profit and loss report.', { category: categoryText(removing.category), date: removing.date }) : ''}
        confirmLabel={t('Delete expense')}
        onConfirm={remove}
        onClose={() => setRemoving(null)}
      />
    </div>
  )
}
