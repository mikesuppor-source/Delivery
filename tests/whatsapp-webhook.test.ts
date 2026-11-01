import test from 'node:test'
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { canMoveTo, parseWebhook, phoneKey, replyIntent, verifyChallenge, verifyMetaSignature } from '../lib/whatsapp-webhook'

const sign = (raw: string, secret: string) => 'sha256=' + createHmac('sha256', secret).update(raw).digest('hex')

test('phone numbers are compared as digits with the country code', () => {
  for (const raw of ['+961 71 123 456', '71123456', '071123456', '0096171123456', '96171123456', '+961-71-123-456']) assert.equal(phoneKey(raw), '96171123456', raw)
  assert.equal(phoneKey('03 123 456'), '9613123456')
  assert.equal(phoneKey('+44 7700 900123'), '447700900123', 'foreign numbers keep their own country code')
  assert.equal(phoneKey(''), '')
})

test('Meta signatures are checked with the app secret', () => {
  const body = JSON.stringify({ object: 'whatsapp_business_account', entry: [] })
  assert.equal(verifyMetaSignature(body, sign(body, 'app-secret'), 'app-secret'), true)
  assert.equal(verifyMetaSignature(body, sign(body, 'other-secret'), 'app-secret'), false, 'signed with the wrong secret')
  assert.equal(verifyMetaSignature(body + ' ', sign(body, 'app-secret'), 'app-secret'), false, 'body changed after signing')
  assert.equal(verifyMetaSignature(body, null, 'app-secret'), false)
  assert.equal(verifyMetaSignature(body, 'sha256=nothex', 'app-secret'), false)
  assert.equal(verifyMetaSignature(body, sign(body, ''), ''), false, 'no secret configured means nothing is accepted')
})

test('the verify-token check answers the challenge only for the right token', () => {
  const ok = new URLSearchParams({ 'hub.mode': 'subscribe', 'hub.verify_token': 'tok-123', 'hub.challenge': '98765' })
  assert.equal(verifyChallenge(ok, 'tok-123'), '98765')
  assert.equal(verifyChallenge(ok, 'tok-124'), null)
  assert.equal(verifyChallenge(ok, ''), null, 'no token configured')
  assert.equal(verifyChallenge(new URLSearchParams({ 'hub.mode': 'unsubscribe', 'hub.verify_token': 'tok-123', 'hub.challenge': '1' }), 'tok-123'), null)
})

const receipt = (statuses: unknown[], messages: unknown[] = []) => ({
  object: 'whatsapp_business_account',
  entry: [{ id: 'WABA', changes: [{ field: 'messages', value: { metadata: { phone_number_id: 'PNID' }, statuses, messages } }] }],
})

test('delivery receipts and replies are picked out of a webhook body', () => {
  const body = receipt(
    [
      { id: 'wamid.A', status: 'delivered', timestamp: '1793500000', recipient_id: '96171123456' },
      { id: 'wamid.B', status: 'failed', timestamp: '1793500001', errors: [{ code: 131026, title: 'Message undeliverable', message: 'Not a WhatsApp user' }] },
      { id: 'wamid.C', status: 'deleted' },
      { status: 'read' },
    ],
    [
      { id: 'wamid.IN1', from: '96171123456', timestamp: '1793500002', type: 'text', text: { body: 'STOP' } },
      { id: 'wamid.IN2', from: '96170999888', type: 'button', button: { text: 'Thanks' } },
      { from: '961', type: 'text' },
    ],
  )
  const { statuses, inbound } = parseWebhook(body)
  assert.deepEqual(statuses.map(s => [s.providerId, s.status, s.phoneNumberId]), [['wamid.A', 'delivered', 'PNID'], ['wamid.B', 'failed', 'PNID']])
  assert.equal(statuses[1].error, 'Message undeliverable: Not a WhatsApp user')
  assert.equal(statuses[0].at.toISOString(), new Date(1793500000 * 1000).toISOString())
  assert.deepEqual(inbound.map(m => [m.providerId, m.from, m.text]), [['wamid.IN1', '96171123456', 'STOP'], ['wamid.IN2', '96170999888', 'Thanks']])
  assert.deepEqual(parseWebhook({ object: 'page', entry: [] }), { statuses: [], inbound: [] }, 'other kinds of webhook are ignored')
  assert.deepEqual(parseWebhook(null), { statuses: [], inbound: [] })
  assert.deepEqual(parseWebhook('garbage'), { statuses: [], inbound: [] })
})

test('only a reply that is just a stop or start word changes the opt-out', () => {
  for (const text of ['STOP', 'stop', ' Stop. ', 'unsubscribe', 'إيقاف', 'ايقاف', 'توقف', 'إلغاء الاشتراك']) assert.equal(replyIntent(text), 'stop', text)
  for (const text of ['START', 'start', 'Resume', 'استئناف']) assert.equal(replyIntent(text), 'start', text)
  for (const text of ['please do not stop at my door', 'where is my parcel?', 'thanks', '']) assert.equal(replyIntent(text), null, text)
})

test('a receipt only moves a message forward, except that a failure always shows', () => {
  assert.equal(canMoveTo('sent', 'delivered'), true)
  assert.equal(canMoveTo('delivered', 'read'), true)
  assert.equal(canMoveTo('read', 'delivered'), false, 'receipts can arrive out of order')
  assert.equal(canMoveTo('delivered', 'delivered'), false)
  assert.equal(canMoveTo('delivered', 'failed'), true)
  assert.equal(canMoveTo('failed', 'failed'), false)
  assert.equal(canMoveTo('failed', 'delivered'), false, 'a failed message is not revived by a late receipt')
})
