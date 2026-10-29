/**
 * tests/pricing.test.ts
 * Unit tests for lib/pricing.ts — pure functions, no database needed.
 * Run with: npm test (which runs node:test on files matching tests/*.test.ts)
 */

import { strict as assert } from 'node:assert'
import { describe, it } from 'node:test'
import { priceOrder, collectionFor, breakdown, money } from '../lib/pricing.js'
import type { ZonePrice, PricingDefaults } from '../lib/pricing.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const zone = (override: Partial<ZonePrice> = {}): ZonePrice => ({
  fee_usd: 8,
  driver_pay_usd: 1,
  return_fee_usd: 2,
  return_driver_pay_usd: 1,
  ...override,
})

const defaults = (override: Partial<PricingDefaults> = {}): PricingDefaults => ({
  default_delivery_fee_usd: 5,
  default_driver_pay_usd: 2,
  ...override,
})

// ---------------------------------------------------------------------------
// money() rounding
// ---------------------------------------------------------------------------

describe('money()', () => {
  it('rounds 0.1 + 0.2 correctly', () => {
    assert.equal(money(0.1 + 0.2), 0.30)
  })
  it('rounds to 2 decimal places', () => {
    // Note: 1.005 cannot be represented exactly in IEEE-754 binary float —
    // the actual stored value is 1.00499999... which rounds DOWN to 1.00.
    // This is expected and correct; the money() function rounds what it gets.
    assert.equal(money(1.004), 1.00)
    assert.equal(money(1.006), 1.01)
    assert.equal(money(7.555), 7.56)
    assert.equal(money(3.145), 3.15)
  })
  it('handles zero', () => {
    assert.equal(money(0), 0)
  })
  it('handles negative', () => {
    assert.equal(money(-3.5), -3.50)
  })
})

// ---------------------------------------------------------------------------
// priceOrder() — waterfall priority
// ---------------------------------------------------------------------------

describe('priceOrder() — fee waterfall', () => {
  it('shop special price wins over zone fee', () => {
    const p = priceOrder(zone({ fee_usd: 8 }), 6, defaults())
    assert.equal(p.feeUsd, 6, 'shop special price should win')
  })

  it('zone fee wins over workspace default when no shop price', () => {
    const p = priceOrder(zone({ fee_usd: 8 }), null, defaults({ default_delivery_fee_usd: 5 }))
    assert.equal(p.feeUsd, 8, 'zone fee should win')
  })

  it('workspace default wins when no zone and no shop price', () => {
    const p = priceOrder(null, null, defaults({ default_delivery_fee_usd: 5 }))
    assert.equal(p.feeUsd, 5)
  })

  it('falls back to $3 when nothing is set', () => {
    const p = priceOrder(null, null, { default_delivery_fee_usd: null, default_driver_pay_usd: null })
    assert.equal(p.feeUsd, 3)
  })
})

describe('priceOrder() — courier pay waterfall', () => {
  it('zone driver_pay_usd is used when set', () => {
    const p = priceOrder(zone({ driver_pay_usd: 4 }), null, defaults({ default_driver_pay_usd: 2 }))
    assert.equal(p.driverPayUsd, 4)
  })

  it('null zone driver_pay_usd falls back to workspace default', () => {
    const p = priceOrder(zone({ driver_pay_usd: null }), null, defaults({ default_driver_pay_usd: 3 }))
    assert.equal(p.driverPayUsd, 3)
  })

  it('falls back to $1 when nothing is set', () => {
    const p = priceOrder(null, null, { default_delivery_fee_usd: null, default_driver_pay_usd: null })
    assert.equal(p.driverPayUsd, 1)
  })
})

describe('priceOrder() — return pricing', () => {
  it('uses zone return_fee_usd', () => {
    const p = priceOrder(zone({ return_fee_usd: 3 }), null, defaults())
    assert.equal(p.returnFeeUsd, 3)
  })

  it('uses zone return_driver_pay_usd', () => {
    const p = priceOrder(zone({ return_driver_pay_usd: 1.50 }), null, defaults())
    assert.equal(p.returnDriverPayUsd, 1.50)
  })

  it('falls back to $2 return fee when no zone', () => {
    const p = priceOrder(null, null, defaults())
    assert.equal(p.returnFeeUsd, 2)
  })

  it('falls back to $1 return courier pay when no zone', () => {
    const p = priceOrder(null, null, defaults())
    assert.equal(p.returnDriverPayUsd, 1)
  })
})

// ---------------------------------------------------------------------------
// collectionFor()
// ---------------------------------------------------------------------------

describe('collectionFor()', () => {
  it('"added" mode: customer pays item + fee', () => {
    assert.equal(collectionFor(10, 8, 'added'), 18)
  })

  it('"free" mode: customer pays item only', () => {
    assert.equal(collectionFor(10, 8, 'free'), 10)
  })

  it('rounds to cents', () => {
    // 10.10 + 7.90 = 18.00 exactly
    assert.equal(collectionFor(10.10, 7.90, 'added'), 18.00)
  })
})

// ---------------------------------------------------------------------------
// breakdown()
// ---------------------------------------------------------------------------

describe('breakdown()', () => {
  it('matches the owner example from BUILD_PLAN §1.1 (Beirut)', () => {
    const b = breakdown(18, 8, 1)
    assert.equal(b.customerPays, 18, 'customer pays $18')
    assert.equal(b.shopReceives, 10, 'shop receives $10')
    assert.equal(b.courierEarns, 1, 'courier earns $1')
    assert.equal(b.companyKeeps, 7, 'company keeps $7')
  })

  it('matches the owner example from BUILD_PLAN §1.1 (far zone)', () => {
    const b = breakdown(18, 8, 4)
    assert.equal(b.customerPays, 18)
    assert.equal(b.shopReceives, 10)
    assert.equal(b.courierEarns, 4)
    assert.equal(b.companyKeeps, 4)
  })

  it('free delivery mode: shop absorbs the fee', () => {
    const b = breakdown(10, 8, 1)  // COD=item only
    assert.equal(b.customerPays, 10)
    assert.equal(b.shopReceives, 2, 'shop gets 10-8=2')
    assert.equal(b.courierEarns, 1)
    assert.equal(b.companyKeeps, 7)
  })

  it('returned parcel: COD=0, fee=return_fee, profit=fee-pay', () => {
    // Return: fee=2, driver pay=1, collection=0
    const b = breakdown(0, 2, 1)
    assert.equal(b.customerPays, 0)
    assert.equal(b.shopReceives, -2, 'shop is charged the return fee')
    assert.equal(b.courierEarns, 1)
    assert.equal(b.companyKeeps, 1)
  })

  it('rounding does not accumulate errors across four fields', () => {
    const b = breakdown(18.01, 7.99, 0.99)
    // 18.01 - 7.99 = 10.02; 7.99 - 0.99 = 7.00
    assert.equal(b.shopReceives, 10.02)
    assert.equal(b.companyKeeps, 7.00)
  })
})
