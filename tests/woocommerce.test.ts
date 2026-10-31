import test from 'node:test'
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { verifyWooSignature, wooCollectUsd, wooSkipReason, wooIncomingOrder } from '../lib/woocommerce'

const order = (extra: Record<string, unknown> = {}) => ({
  id: 7421, number: '7421', status: 'processing', currency: 'USD', total: '48.50', payment_method: 'cod', date_paid: null,
  customer_note: 'Leave with the guard',
  shipping: { first_name: 'Rita', last_name: 'Haddad', address_1: 'Bliss Street 12', address_2: 'Floor 3', city: 'Beirut', state: 'LB-BA', country: 'LB', phone: '03 123 456' },
  billing: { first_name: 'Rita', last_name: 'H.', city: 'Beirut', phone: '70 999 888', email: 'rita@example.com' },
  ...extra,
})

test('WooCommerce signs the exact body with the webhook secret, in base64', () => {
  const raw = JSON.stringify(order()), secret = 'whsec_woo'
  const good = createHmac('sha256', secret).update(raw).digest('base64')
  assert.equal(verifyWooSignature(raw, good, secret), true)
  assert.equal(verifyWooSignature(raw + ' ', good, secret), false, 'changed body')
  assert.equal(verifyWooSignature(raw, good, 'other'), false, 'wrong secret')
  for (const bad of ['', 'not-base64!!', good.slice(0, -4), createHmac('sha256', secret).update(raw).digest('hex')]) {
    assert.equal(verifyWooSignature(raw, bad, secret), false, bad)
  }
})

test('only cash on delivery is collected by the courier', () => {
  assert.equal(wooCollectUsd(order(), 90000), 48.5)
  assert.equal(wooCollectUsd(order({ payment_method: 'stripe', date_paid: '2026-11-01T10:00:00' }), 90000), 0, 'paid online')
  assert.equal(wooCollectUsd(order({ payment_method: 'bacs', date_paid: null }), 90000), 0, 'bank transfer is settled outside Cedar')
  assert.equal(wooCollectUsd(order({ currency: 'LBP', total: '4500000' }), 90000), 50)
  assert.equal(wooCollectUsd(order({ total: '12.345' }), 90000), 12.35)
  assert.throws(() => wooCollectUsd(order({ currency: 'EUR' }), 90000), /currency/i)
  assert.throws(() => wooCollectUsd(order({ total: 'abc' }), 90000))
  assert.throws(() => wooCollectUsd(order({ total: '-5' }), 90000))
})

test('orders that are not a delivery to make are skipped, with the reason', () => {
  assert.equal(wooSkipReason(order()), null)
  assert.equal(wooSkipReason(order({ status: 'pending' })), null)
  assert.equal(wooSkipReason(order({ status: 'on-hold' })), null)
  for (const status of ['cancelled', 'refunded', 'failed', 'trash', 'auto-draft', 'checkout-draft', 'completed']) {
    assert.match(String(wooSkipReason(order({ status }))), new RegExp(status))
  }
  assert.match(String(wooSkipReason({ status: 'processing' })), /order id/i)
  assert.match(String(wooSkipReason(order({ id: undefined }))), /order id/i)
})

test('a WooCommerce order becomes a Cedar order with the shipping details', () => {
  const incoming = wooIncomingOrder(order())
  assert.deepEqual(incoming.identity, { external_ref: 'woocommerce:7421' })
  assert.deepEqual(incoming.repeat, { column: 'external_ref', value: 'woocommerce:7421' })
  assert.deepEqual(incoming.areaTerms, ['Beirut', 'LB-BA'])
  assert.equal(incoming.recipient.name, 'Rita Haddad')
  assert.equal(incoming.recipient.address, 'Bliss Street 12, Floor 3, Beirut, LB-BA, LB')
  assert.match(incoming.recipient.phone, /3\s?123\s?456/)
  assert.match(incoming.note(true), /WooCommerce #7421/)
  assert.match(incoming.note(true), /Leave with the guard/)
  assert.doesNotMatch(incoming.note(true), /manual review/)
  assert.match(incoming.note(false), /Area needs manual review/)
  assert.equal(incoming.collectUsd(90000), 48.5)

  // No shipping address: the billing details are used, and a name is always present
  const billingOnly = wooIncomingOrder(order({ shipping: { first_name: '', last_name: '', address_1: '', city: '' } }))
  assert.equal(billingOnly.recipient.name, 'Rita H.')
  assert.match(billingOnly.recipient.phone, /70\s?999\s?888/)
  assert.equal(wooIncomingOrder(order({ shipping: {}, billing: {} })).recipient.name, 'WooCommerce Customer')
})
