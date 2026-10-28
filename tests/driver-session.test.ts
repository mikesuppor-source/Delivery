import { test } from 'node:test'
import assert from 'node:assert/strict'
import { driverPin, generateDriverPin, signDriverSession, verifyDriverSession } from '../lib/driver-session'

const secret = 'test-secret-that-is-long-enough-000000'
const driverId = '00000000-0000-4000-8000-000000000008'

test('courier session round-trips and rejects tampering, other secrets and expiry', () => {
  const now = 1_700_000_000_000
  const token = signDriverSession({ driverId, version: 3, expiresAt: now + 60_000 }, secret)
  assert.deepEqual(verifyDriverSession(token, secret, now), { driverId, version: 3, expiresAt: now + 60_000 })

  const otherDriver = token.replace(driverId, '00000000-0000-4000-8000-000000000009')
  assert.equal(verifyDriverSession(otherDriver, secret, now), null)
  assert.equal(verifyDriverSession(token.replace('.3.', '.4.'), secret, now), null)
  assert.equal(verifyDriverSession(token, secret + 'x', now), null)
  assert.equal(verifyDriverSession(token, secret, now + 60_000), null)
})

test('courier session rejects malformed and legacy values', () => {
  // The old cookie held only the courier ID, which must never grant access on its own
  for (const value of [undefined, '', driverId, 'v1.' + driverId, 'v2.' + driverId + '.1.9999999999999.sig', 'a.b.c.d.e']) {
    assert.equal(verifyDriverSession(value, secret), null)
  }
})

test('courier PINs must be 4-8 digits and not trivially guessable', () => {
  for (const pin of ['4829', '482913', ' 48291375 ']) assert.equal(driverPin(pin), pin.trim())
  for (const pin of ['1234', '0000', '111111', '123456', '987654', '123', '123456789', 'abcd', '12a4', '', null]) {
    assert.throws(() => driverPin(pin), `${pin} should be rejected`)
  }
})

test('generated PINs are six digits and always pass the PIN rules', () => {
  for (let i = 0; i < 500; i++) {
    const pin = generateDriverPin()
    assert.match(pin, /^\d{6}$/)
    assert.equal(driverPin(pin), pin)
  }
})
