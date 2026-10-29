/**
 * tests/finance.test.ts
 * Unit tests for lib/finance.ts — pure functions, no database needed.
 */

import { strict as assert } from 'node:assert'
import { describe, it } from 'node:test'
import {
  availableToPay,
  csvRow,
  describePayMode,
  isoDate,
  isPayoutDay,
  lastFinishedWeekStart,
  nextPayoutDay,
  payoutCandidates,
  percentPay,
  statementPeriod,
  statementTotals,
  sumUsd,
  weekdayOf,
  weekStart,
} from '../lib/finance.js'

describe('payout amounts', () => {
  it('pays a shop its balance minus what cash-out requests already reserve', () => {
    assert.equal(availableToPay(74, 20), 54)
    assert.equal(availableToPay(74, 0), 74)
  })

  it('never goes below zero, and ignores floating-point dust', () => {
    assert.equal(availableToPay(10, 25), 0)
    assert.equal(availableToPay(0.3, 0.1), 0.2)
  })

  it('lists only shops whose available balance reaches the minimum, largest first', () => {
    const shops = [
      { id: 'a', balance_usd: 74 },
      { id: 'b', balance_usd: 15 },
      { id: 'c', balance_usd: 0 },
      { id: 'd', balance_usd: 30 },
      { id: 'e', balance_usd: 120 },
      { id: 'f', balance_usd: -8 },
    ]
    const result = payoutCandidates(shops, { a: 20, d: 30 }, 20)
    assert.deepEqual(result.map(s => [s.id, s.available_usd, s.reserved_usd]), [['e', 120, 0], ['a', 54, 20]])
  })

  it('lists any positive balance when the minimum is zero', () => {
    const result = payoutCandidates([{ id: 'a', balance_usd: 0.5 }, { id: 'b', balance_usd: 0 }], {}, 0)
    assert.deepEqual(result.map(s => s.id), ['a'])
  })

  it('adds dollars without floating-point dust', () => {
    assert.equal(sumUsd([0.1, 0.2]), 0.3)
    assert.equal(sumUsd([]), 0)
  })
})

describe('percent courier pay', () => {
  it('is a share of the fee, rounded to cents', () => {
    assert.equal(percentPay(8, 20), 1.6)
    assert.equal(percentPay(8.05, 20), 1.61)
    assert.equal(percentPay(3, 33.33), 1)
    assert.equal(percentPay(0, 50), 0)
    assert.equal(percentPay(10, 100), 10)
  })

  it('rounds half a cent up, like the database', () => {
    assert.equal(percentPay(8.05, 12.5), 1.01) // 1.00625
    assert.equal(percentPay(1.01, 50), 0.51) // 0.505
  })

  it('describes the pay mode for a courier', () => {
    assert.equal(describePayMode('percent', 25), '25% of the fee')
    assert.equal(describePayMode('fixed', null), 'Fixed rate per zone')
    assert.equal(describePayMode('percent', null), 'Fixed rate per zone')
  })
})

describe('payout schedule', () => {
  const MONDAY = new Date(2026, 9, 26)
  const TUESDAY = new Date(2026, 9, 27)
  const THURSDAY = new Date(2026, 9, 29)

  it('names the weekday of a local date', () => {
    assert.equal(weekdayOf(MONDAY), 'monday')
    assert.equal(weekdayOf(new Date(2026, 10, 1)), 'sunday')
  })

  it('knows whether today is a payout day', () => {
    assert.equal(isPayoutDay(['monday', 'thursday'], MONDAY), true)
    assert.equal(isPayoutDay(['monday', 'thursday'], TUESDAY), false)
    assert.equal(isPayoutDay([], MONDAY), false)
  })

  it('finds the next payout day, today included', () => {
    assert.equal(nextPayoutDay(['monday', 'thursday'], MONDAY)?.getDate(), 26)
    assert.equal(nextPayoutDay(['monday', 'thursday'], TUESDAY)?.getDate(), THURSDAY.getDate())
    assert.equal(nextPayoutDay(['monday'], THURSDAY)?.getDate(), 2) // Monday 2 November
    assert.equal(nextPayoutDay([], MONDAY), null)
  })
})

describe('bonus weeks', () => {
  const THURSDAY = new Date(Date.UTC(2026, 9, 29, 15, 30))

  it('starts a week on Monday (UTC)', () => {
    assert.equal(isoDate(weekStart(THURSDAY)), '2026-10-26')
    assert.equal(isoDate(weekStart(new Date(Date.UTC(2026, 9, 26)))), '2026-10-26')
    assert.equal(isoDate(weekStart(new Date(Date.UTC(2026, 10, 1, 23, 59)))), '2026-10-26') // Sunday
  })

  it('picks the last week that has fully ended', () => {
    assert.equal(isoDate(lastFinishedWeekStart(THURSDAY)), '2026-10-19')
    assert.equal(isoDate(lastFinishedWeekStart(new Date(Date.UTC(2026, 9, 26, 0, 5)))), '2026-10-19') // Monday
    assert.equal(isoDate(lastFinishedWeekStart(new Date(Date.UTC(2026, 0, 1)))), '2025-12-22') // across a year
  })
})

describe('CSV export', () => {
  it('quotes commas, quotes and line breaks', () => {
    assert.equal(csvRow(['a', 'b,c', 'say "hi"', 'two\nlines']), 'a,"b,c","say ""hi""","two\nlines"')
  })

  it('writes numbers as they are and blanks for missing values', () => {
    assert.equal(csvRow([1.5, null, undefined, 0]), '1.5,,,0')
  })

  it('stops text from being read as a spreadsheet formula', () => {
    assert.equal(csvRow(['=SUM(A1:A9)', '+1', '-2', '@x']), "'=SUM(A1:A9),'+1,'-2,'@x")
  })
})

describe('statements', () => {
  const NOW = new Date(Date.UTC(2026, 9, 29, 12))

  it('builds the period for each preset', () => {
    assert.deepEqual(statementPeriod('this_month', NOW), { from: '2026-10-01', to: '2026-10-29' })
    assert.deepEqual(statementPeriod('last_month', NOW), { from: '2026-09-01', to: '2026-09-30' })
    assert.deepEqual(statementPeriod('last_30_days', NOW), { from: '2026-09-30', to: '2026-10-29' })
    assert.deepEqual(statementPeriod('this_year', NOW), { from: '2026-01-01', to: '2026-10-29' })
  })

  it('handles last month in January', () => {
    assert.deepEqual(statementPeriod('last_month', new Date(Date.UTC(2026, 0, 15))), { from: '2025-12-01', to: '2025-12-31' })
  })

  it('totals orders, payouts and adjustments separately', () => {
    const line = (kind: 'order' | 'payout' | 'adjustment', amount_usd: number) =>
      ({ at: '2026-10-01T00:00:00Z', kind, ref: null, label: '', cod_usd: null, fee_usd: null, storage_usd: null, amount_usd })
    const totals = statementTotals({ lines: [line('order', 47), line('order', 27), line('payout', -54), line('payout', -20), line('adjustment', 5)] })
    assert.deepEqual(totals, { orders: 74, payouts: -74, adjustments: 5 })
    assert.deepEqual(statementTotals({ lines: [] }), { orders: 0, payouts: 0, adjustments: 0 })
  })
})
