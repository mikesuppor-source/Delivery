import test from 'node:test'
import assert from 'node:assert/strict'
import { addressPin, decideProof, FAR_FROM_ADDRESS_M, type ProofInput } from '../lib/delivery-proof'

const base: ProofInput = { hasCode: true, codeResult: null, fallback: null, queuedOffline: false, distanceM: 40, courierHadLocation: true }
const ok = { result: 'ok', triesLeft: 5 } as const
const decide = (over: Partial<ProofInput>) => decideProof({ ...base, ...over })

test('the right customer code proves delivery', () => {
  assert.deepEqual(decide({ codeResult: ok }), { allow: true, method: 'code', flags: [] })
})

test('an order from before codes existed keeps the old rules', () => {
  assert.deepEqual(decide({ hasCode: false }), { allow: true, method: 'legacy', flags: [] })
  assert.deepEqual(decide({ hasCode: false, courierHadLocation: false, distanceM: null }), { allow: true, method: 'legacy', flags: [] }, 'no location flag for old orders')
})

test('without the code, delivery is refused with a plain instruction', () => {
  const none = decide({})
  assert.equal(none.allow, false); assert.match((none as { error: string }).error, /Ask the customer for the delivery code/)
  const wrong = decide({ codeResult: { result: 'wrong', triesLeft: 3 } })
  assert.equal(wrong.allow, false); assert.match((wrong as { error: string }).error, /wrong\. 3 tries left/)
  assert.match((decide({ codeResult: { result: 'wrong', triesLeft: 1 } }) as { error: string }).error, /1 try left/)
  const locked = decide({ codeResult: { result: 'locked', triesLeft: 0 } })
  assert.equal(locked.allow, false); assert.match((locked as { error: string }).error, /Too many wrong codes/)
})

test('the customer cannot show the code: a photo is required and the delivery is flagged', () => {
  const noPhoto = decide({ fallback: { reason: 'no_phone', hasPhoto: false } })
  assert.equal(noPhoto.allow, false); assert.match((noPhoto as { error: string }).error, /photo/)
  assert.deepEqual(decide({ fallback: { reason: 'no_phone', hasPhoto: true } }), { allow: true, method: 'fallback', flags: ['no_code'] })
  assert.deepEqual(decide({ fallback: { reason: 'other', hasPhoto: true }, codeResult: { result: 'wrong', triesLeft: 2 } }), { allow: true, method: 'fallback', flags: ['wrong_code'] })
  assert.deepEqual(decide({ fallback: { reason: 'refused_code', hasPhoto: true }, codeResult: { result: 'locked', triesLeft: 0 } }), { allow: true, method: 'fallback', flags: ['wrong_code'] })
})

test('a delivery marked while offline is accepted but flagged, because the code could not be checked at the door', () => {
  assert.deepEqual(decide({ queuedOffline: true, codeResult: { result: 'wrong', triesLeft: 4 } }), { allow: true, method: 'fallback', flags: ['unverified_code'] })
  assert.deepEqual(decide({ queuedOffline: true, codeResult: ok }), { allow: true, method: 'code', flags: [] }, 'a code that checks out is fine even from the queue')
  assert.equal(decide({ queuedOffline: true }).allow, false, 'offline with no code and no photo is still refused')
})

test('the courier\'s location is compared with the address pin', () => {
  assert.deepEqual(decide({ codeResult: ok, distanceM: FAR_FROM_ADDRESS_M }).allow && (decide({ codeResult: ok, distanceM: FAR_FROM_ADDRESS_M }) as { flags: string[] }).flags, [], 'at the limit is fine')
  assert.deepEqual((decide({ codeResult: ok, distanceM: FAR_FROM_ADDRESS_M + 1 }) as { flags: string[] }).flags, ['far_from_address'])
  assert.deepEqual((decide({ codeResult: ok, distanceM: null }) as { flags: string[] }).flags, [], 'no address pin, nothing to compare')
  assert.deepEqual((decide({ codeResult: ok, courierHadLocation: false, distanceM: null }) as { flags: string[] }).flags, ['no_location'])
  assert.deepEqual((decide({ codeResult: ok, distanceM: 5000 }) as { flags: string[] }).flags, ['far_from_address'], 'far away is flagged even though the code was right')
  assert.deepEqual((decide({ fallback: { reason: 'not_present', hasPhoto: true }, distanceM: 2000 }) as { flags: string[] }).flags, ['no_code', 'far_from_address'])
})

test('the address pin comes from the shared location or from coordinates in the address', () => {
  assert.deepEqual(addressPin({ location_lat: 33.9, location_lng: 35.5, recipient_address: 'Hamra' }), { lat: 33.9, lng: 35.5 })
  assert.deepEqual(addressPin({ recipient_address: '33.8938, 35.5018' }), { lat: 33.8938, lng: 35.5018 })
  assert.equal(addressPin({ recipient_address: 'Hamra Street 12' }), null)
  assert.equal(addressPin({}), null)
})
