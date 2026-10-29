/**
 * lib/finance.ts
 * Pure finance helpers shared by the desk screens, the API routes and the tests.
 * No server imports: safe to use in the browser. Implements BUILD_PLAN.md Phase 6.
 */

import { money } from './pricing'

// ─── Payout methods and schedule ────────────────────────────────────────────

export const PAYOUT_METHODS = ['cash', 'whish', 'omt', 'bank'] as const
export type PayoutMethod = (typeof PAYOUT_METHODS)[number]
export const PAYOUT_METHOD_LABELS: Record<PayoutMethod, string> = {
  cash: 'Cash at office',
  whish: 'Whish',
  omt: 'OMT',
  bank: 'Bank transfer',
}

export const WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const
export type Weekday = (typeof WEEKDAYS)[number]
export const WEEKDAY_LABELS: Record<Weekday, string> = {
  monday: 'Monday',
  tuesday: 'Tuesday',
  wednesday: 'Wednesday',
  thursday: 'Thursday',
  friday: 'Friday',
  saturday: 'Saturday',
  sunday: 'Sunday',
}

/** Lower-case English weekday of a date, in the date's own (local) time. */
export function weekdayOf(date: Date): Weekday {
  return WEEKDAYS[(date.getDay() + 6) % 7]
}

export function isPayoutDay(days: readonly string[], date: Date = new Date()): boolean {
  return days.includes(weekdayOf(date))
}

/** The next payout day on or after `from`, or null when the schedule has no days. */
export function nextPayoutDay(days: readonly string[], from: Date = new Date()): Date | null {
  for (let ahead = 0; ahead < 7; ahead++) {
    const day = new Date(from.getFullYear(), from.getMonth(), from.getDate() + ahead)
    if (isPayoutDay(days, day)) return day
  }
  return null
}

// ─── Shop payouts ───────────────────────────────────────────────────────────

/** What a payout run may pay a shop: its balance minus cash-out requests already reserved. */
export function availableToPay(balanceUsd: number, reservedUsd: number): number {
  return Math.max(money(balanceUsd - reservedUsd), 0)
}

export type PayoutCandidate<T> = T & { reserved_usd: number; available_usd: number }

/**
 * Shops worth paying in a run: available balance of at least `minUsd` (and more than zero).
 * Largest amount first.
 */
export function payoutCandidates<T extends { id: string; balance_usd: number }>(
  shops: readonly T[],
  reservedByShop: Readonly<Record<string, number>>,
  minUsd: number,
): PayoutCandidate<T>[] {
  return shops
    .map(shop => {
      const reserved_usd = money(reservedByShop[shop.id] ?? 0)
      return { ...shop, reserved_usd, available_usd: availableToPay(Number(shop.balance_usd), reserved_usd) }
    })
    .filter(shop => shop.available_usd > 0 && shop.available_usd >= minUsd)
    .sort((a, b) => b.available_usd - a.available_usd)
}

/** Sum of dollar amounts without floating-point dust (0.1 + 0.2 gives 0.3). */
export function sumUsd(values: readonly number[]): number {
  return money(values.reduce((total, value) => total + value, 0))
}

// ─── Courier pay ────────────────────────────────────────────────────────────

/**
 * A percent courier's pay for one order: a share of the customer fee, rounded to cents the same way
 * the database rounds it (apply_driver_pay_mode in migration 027).
 */
export function percentPay(feeUsd: number, percent: number): number {
  return Math.round((Math.round(feeUsd * 100) * percent) / 100) / 100
}

type Translate = (phrase: string, params?: Record<string, string | number>) => string
/** The default "translation": the English sentence with its {placeholders} filled in. */
const english: Translate = (phrase, params) => phrase.replace(/\{(\w+)\}/g, (_all, key: string) => String(params?.[key] ?? ''))

/** How a courier is paid, in words. Screens pass their translate function to show it in Arabic. */
export function describePayMode(mode: string | null | undefined, percent: number | null | undefined, t: Translate = english): string {
  return mode === 'percent' && percent != null ? t('{percent}% of the fee', { percent: Number(percent) }) : t('Fixed rate per zone')
}

/** YYYY-MM-DD in UTC, the format the database functions take. */
export const isoDate = (date: Date): string => date.toISOString().slice(0, 10)

/** Monday (UTC midnight) of the week that contains `date`. */
export function weekStart(date: Date): Date {
  const sinceMonday = (date.getUTCDay() + 6) % 7
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - sinceMonday))
}

/** Monday of the most recent week that has fully ended: the week bonuses can be calculated for. */
export function lastFinishedWeekStart(now: Date = new Date()): Date {
  const monday = weekStart(now)
  monday.setUTCDate(monday.getUTCDate() - 7)
  return monday
}

// ─── Expenses ───────────────────────────────────────────────────────────────

export const EXPENSE_CATEGORIES = ['fuel', 'salaries', 'rent', 'phone', 'maintenance', 'other'] as const
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number]
export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  fuel: 'Fuel',
  salaries: 'Salaries',
  rent: 'Rent',
  phone: 'Phone & internet',
  maintenance: 'Maintenance',
  other: 'Other',
}

/** One CSV row. Text that a spreadsheet could read as a formula is prefixed with a quote. */
export function csvRow(values: ReadonlyArray<string | number | null | undefined>): string {
  return values
    .map(value => {
      if (value == null) return ''
      if (typeof value === 'number') return String(value)
      const text = /^[=+\-@\t\r]/.test(value) ? "'" + value : value
      return /[",\n\r]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text
    })
    .join(',')
}

// ─── Reports and statements (shapes returned by the database functions) ─────

export interface PnlMonth {
  month: string
  delivered_orders: number
  returned_orders: number
  delivery_fees_usd: number
  storage_fees_usd: number
  revenue_usd: number
  courier_pay_usd: number
  bonuses_usd: number
  expenses_usd: number
  total_cost_usd: number
  net_profit_usd: number
}

export interface PnlReport {
  from: string
  to: string
  months: PnlMonth[]
  totals: Omit<PnlMonth, 'month'>
  expenses_by_category: Array<{ category: string; amount_usd: number }>
}

export interface StatementLine {
  at: string
  kind: 'order' | 'payout' | 'adjustment'
  ref: string | null
  label: string
  cod_usd: number | null
  fee_usd: number | null
  storage_usd: number | null
  amount_usd: number
}

export interface ShopStatement {
  shop: { id: string; name: string; phone: string | null; address: string | null }
  from: string
  to: string
  opening_usd: number
  closing_usd: number
  current_balance_usd: number
  lines: StatementLine[]
}

/** Totals shown under a statement: what orders earned the shop, what was paid out, other changes. */
export function statementTotals(statement: Pick<ShopStatement, 'lines'>) {
  const total = (kind: StatementLine['kind']) =>
    sumUsd(statement.lines.filter(line => line.kind === kind).map(line => Number(line.amount_usd)))
  return { orders: total('order'), payouts: total('payout'), adjustments: total('adjustment') }
}

export type StatementPreset = 'this_month' | 'last_month' | 'last_30_days' | 'this_year'

/** From/to dates (UTC, inclusive) for a statement preset. */
export function statementPeriod(preset: StatementPreset, now: Date = new Date()): { from: string; to: string } {
  const year = now.getUTCFullYear()
  const month = now.getUTCMonth()
  const day = now.getUTCDate()
  switch (preset) {
    case 'this_month':
      return { from: isoDate(new Date(Date.UTC(year, month, 1))), to: isoDate(now) }
    case 'last_month':
      return { from: isoDate(new Date(Date.UTC(year, month - 1, 1))), to: isoDate(new Date(Date.UTC(year, month, 0))) }
    case 'last_30_days':
      return { from: isoDate(new Date(Date.UTC(year, month, day - 29))), to: isoDate(now) }
    case 'this_year':
      return { from: isoDate(new Date(Date.UTC(year, 0, 1))), to: isoDate(now) }
  }
}
