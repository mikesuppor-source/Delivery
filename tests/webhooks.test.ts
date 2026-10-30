import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { sendWebhook, webhookBody, type WebhookJob } from '../lib/webhooks'
import { verifyWebhookSignature } from '../lib/webhook-signature'

type Seen = { method?: string; headers: http.IncomingHttpHeaders; body: string }

async function receiver(status: number, delayMs = 0) {
  const seen: Seen[] = []
  const server = http.createServer((req, res) => {
    let body = ''
    req.on('data', c => body += c)
    req.on('end', () => {
      seen.push({ method: req.method, headers: req.headers, body })
      setTimeout(() => { res.statusCode = status; res.end('ok') }, delayMs)
    })
  })
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r))
  return { seen, url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/hook`, close: () => new Promise<void>(r => { server.closeAllConnections(); server.close(() => r()) }) }
}

const job = (url: string): WebhookJob => ({
  id: '11111111-1111-4111-8111-111111111111', event: 'order.delivered', created_at: '2026-11-01T10:00:00.000Z',
  payload: { code: 'CD-ABC123', status: 'delivered' }, url, secret: 'whsec_unit',
})

test('a delivered message is a signed JSON post that the receiver can verify', async () => {
  const r = await receiver(200)
  try {
    const sent = job(r.url)
    const result = await sendWebhook(sent, { allowLocal: true })
    assert.deepEqual(result, { ok: true, status: 200, error: null })
    assert.equal(r.seen.length, 1)
    const [got] = r.seen
    assert.equal(got.method, 'POST')
    assert.equal(got.headers['content-type'], 'application/json')
    assert.equal(got.headers['x-cedar-event'], 'order.delivered')
    assert.equal(got.headers['x-cedar-delivery'], sent.id)
    assert.equal(got.body, webhookBody(sent))
    assert.deepEqual(JSON.parse(got.body), { id: sent.id, event: 'order.delivered', createdAt: sent.created_at, data: sent.payload })
    assert.equal(verifyWebhookSignature('whsec_unit', got.body, String(got.headers['x-cedar-signature'])), true)
    assert.equal(verifyWebhookSignature('someone-else', got.body, String(got.headers['x-cedar-signature'])), false)
  } finally { await r.close() }
})

test('any answer that is not 2xx counts as a failure, with the reason', async () => {
  for (const status of [301, 404, 500]) {
    const r = await receiver(status)
    try {
      const result = await sendWebhook(job(r.url), { allowLocal: true })
      assert.equal(result.ok, false)
      assert.equal(result.status, status)
      assert.match(String(result.error), new RegExp(String(status)))
    } finally { await r.close() }
  }
})

test('a receiver that does not answer in time is a failure, not a hang', async () => {
  const r = await receiver(200, 1500)
  try {
    const started = Date.now()
    const result = await sendWebhook(job(r.url), { allowLocal: true, timeoutMs: 300 })
    assert.equal(result.ok, false)
    assert.equal(result.status, null)
    assert.match(String(result.error), /timed out/i)
    assert.ok(Date.now() - started < 1400, 'waited for the slow receiver')
  } finally { await r.close() }
})

test('a webhook cannot reach a private address, however it is reached', async () => {
  const r = await receiver(200)
  try {
    // Local addresses are refused unless a test or local development says so
    const refused = await sendWebhook(job(r.url))
    assert.equal(refused.ok, false)
    assert.match(String(refused.error), /webhook/i)
    assert.equal(r.seen.length, 0, 'the request was sent anyway')
    // A public-looking name that resolves to a private address is stopped when connecting
    const sneaky = await sendWebhook(job('https://hooks.example.com/x'), {
      lookup: (_host, _options, cb) => cb(null, [{ address: '10.0.0.5', family: 4 }]),
    })
    assert.equal(sneaky.ok, false)
    assert.match(String(sneaky.error), /private network/i)
    // Even with local allowed, other private networks and the metadata address stay blocked
    const metadata = await sendWebhook(job('https://hooks.example.com/x'), {
      allowLocal: true, lookup: (_host, _options, cb) => cb(null, [{ address: '169.254.169.254', family: 4 }]),
    })
    assert.equal(metadata.ok, false)
    assert.match(String(metadata.error), /private network/i)
  } finally { await r.close() }
})
