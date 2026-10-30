import { createHash } from 'node:crypto'
import { test, expect, type APIRequestContext } from 'playwright/test'
import { seeded } from './helpers'
import { generateApiKey } from '../../lib/api-keys'

// The shop API under /api/v1: key auth, the shop's own prices, one shop never seeing another's orders.
const auth = (key: string) => ({ Authorization: 'Bearer ' + key })
const tag = () => Math.random().toString(36).slice(2, 8).toUpperCase()

async function makeShop(label: string) {
  const { db, workspaceId, areaId } = await seeded()
  const { data: shop, error } = await db.from('shops').insert({ workspace_id: workspaceId, name: `API ${label} ${tag()}` }).select('id').single()
  expect(error).toBeNull()
  const k = generateApiKey()
  const { data: row, error: keyError } = await db.from('shop_api_keys').insert({ workspace_id: workspaceId, shop_id: shop!.id, key_prefix: k.prefix, key_hash: k.hash }).select('id').single()
  expect(keyError).toBeNull()
  return { db, workspaceId, areaId, shopId: shop!.id, key: k.key, keyId: row!.id }
}

const newOrder = (request: APIRequestContext, key: string, extra: Record<string, unknown> = {}) =>
  request.post('/api/v1/orders', {
    headers: auth(key),
    data: { recipient: { name: 'API Customer', phone: '+961 3 123 456', address: 'Hamra, Beirut' }, codUsd: 25, ...extra },
  })

test('a request without a valid key is refused, and a revoked key stops working at once', async ({ request }) => {
  const s = await makeShop('keys')
  for (const headers of [{}, auth('cdr_live_' + '0'.repeat(48)), { Authorization: 'Bearer nope' }, { Authorization: s.key }]) {
    const res = await request.get('/api/v1/zones', { headers })
    expect(res.status()).toBe(401)
    expect((await res.json()).error.code).toBe('unauthorized')
  }
  expect((await request.get('/api/v1/zones', { headers: auth(s.key) })).status()).toBe(200)
  // Using a key is recorded
  const { data: used } = await s.db.from('shop_api_keys').select('last_used_at').eq('id', s.keyId).single()
  expect(used!.last_used_at).not.toBeNull()
  await s.db.from('shop_api_keys').update({ revoked_at: new Date().toISOString() }).eq('id', s.keyId)
  const revoked = await request.get('/api/v1/zones', { headers: auth(s.key) })
  expect(revoked.status()).toBe(401)
  // Only the hash is stored: the key itself is nowhere in the table
  const { data: stored } = await s.db.from('shop_api_keys').select('*').eq('id', s.keyId).single()
  expect(JSON.stringify(stored)).not.toContain(s.key)
  expect(stored!.key_hash).toBe(createHash('sha256').update(s.key).digest('hex'))
})

test('an order made through the API uses the shop price for the zone, and a repeated reference is refused', async ({ request }) => {
  const s = await makeShop('create')
  await s.db.from('shop_area_prices').upsert({ workspace_id: s.workspaceId, shop_id: s.shopId, area_id: s.areaId, fee_usd: 4.25 })

  const zones = await (await request.get('/api/v1/zones', { headers: auth(s.key) })).json()
  const zone = zones.zones.find((z: { id: string }) => z.id === s.areaId)
  expect(zone.deliveryFeeUsd).toBe(4.25) // this shop's own price, not the zone's 3.00

  const reference = 'WC-' + tag()
  const res = await newOrder(request, s.key, { zoneId: s.areaId, reference, notes: 'Ring twice' })
  expect(res.status()).toBe(201)
  const { order } = await res.json()
  expect(order).toMatchObject({ reference, status: 'pending', zoneId: s.areaId, deliveryFeeUsd: 4.25, codUsd: 25, notes: 'Ring twice' })
  expect(order.code).toMatch(/^CD-/)
  expect(order.trackingUrl).toContain('/track/')
  expect(JSON.stringify(order)).not.toMatch(/driver_pay|driverPay|workspace/i)

  const { data: row } = await s.db.from('orders').select('shop_id, workspace_id, external_ref, delivery_fee_usd, created_by').eq('code', order.code).single()
  expect(row).toMatchObject({ shop_id: s.shopId, workspace_id: s.workspaceId, external_ref: reference, created_by: null })

  const again = await newOrder(request, s.key, { reference })
  expect(again.status()).toBe(409)
  expect((await again.json()).error).toMatchObject({ code: 'duplicate_reference', orderCode: order.code })
  const { count } = await s.db.from('orders').select('id', { count: 'exact', head: true }).eq('shop_id', s.shopId).eq('external_ref', reference)
  expect(count).toBe(1)

  // Bad requests say what is wrong
  const noRecipient = await request.post('/api/v1/orders', { headers: auth(s.key), data: { codUsd: 5 } })
  expect(noRecipient.status()).toBe(400)
  expect((await noRecipient.json()).error.code).toBe('invalid_request')
  const badZone = await newOrder(request, s.key, { zoneId: '00000000-0000-4000-8000-0000000000aa' })
  expect(badZone.status()).toBe(400)
  const notJson = await request.post('/api/v1/orders', { headers: { ...auth(s.key), 'Content-Type': 'application/json' }, data: '{oops' })
  expect(notJson.status()).toBe(400)
  const noPrice = await newOrder(request, s.key) // no zone: the company default price applies
  expect(noPrice.status()).toBe(201)
})

test('a shop sees, lists and cancels only its own orders', async ({ request }) => {
  const mine = await makeShop('mine'), other = await makeShop('other')
  const a = (await (await newOrder(request, mine.key, { reference: 'A-' + tag() })).json()).order
  const b = (await (await newOrder(request, other.key)).json()).order

  expect((await request.get(`/api/v1/orders/${a.code}`, { headers: auth(mine.key) })).status()).toBe(200)
  expect((await request.get(`/api/v1/orders/${a.code.toLowerCase()}`, { headers: auth(mine.key) })).status()).toBe(200)
  const foreign = await request.get(`/api/v1/orders/${b.code}`, { headers: auth(mine.key) })
  expect(foreign.status()).toBe(404) // not 403: another shop's order is not even confirmed to exist
  expect((await request.post(`/api/v1/orders/${b.code}/cancel`, { headers: auth(mine.key) })).status()).toBe(404)
  const { data: untouched } = await other.db.from('orders').select('status').eq('code', b.code).single()
  expect(untouched!.status).toBe('pending')

  const list = await (await request.get('/api/v1/orders?status=pending&limit=10', { headers: auth(mine.key) })).json()
  expect(list.orders.map((o: { code: string }) => o.code)).toEqual([a.code])
  expect(list.hasMore).toBe(false)
  const future = await (await request.get('/api/v1/orders?from=2999-01-01', { headers: auth(mine.key) })).json()
  expect(future.orders).toEqual([])
  expect((await request.get('/api/v1/orders?status=bogus', { headers: auth(mine.key) })).status()).toBe(400)
  expect((await request.get('/api/v1/orders?from=not-a-date', { headers: auth(mine.key) })).status()).toBe(400)

  const cancelled = await request.post(`/api/v1/orders/${a.code}/cancel`, { headers: auth(mine.key) })
  expect(cancelled.status()).toBe(200)
  expect((await cancelled.json()).order.status).toBe('cancelled')
  const twice = await request.post(`/api/v1/orders/${a.code}/cancel`, { headers: auth(mine.key) })
  expect(twice.status()).toBe(409)
  expect((await twice.json()).error).toMatchObject({ code: 'not_cancellable', status: 'cancelled' })

  // Once a courier has it, the shop can no longer cancel it through the API
  const { courierId } = await seeded()
  const c = (await (await newOrder(request, mine.key)).json()).order
  await mine.db.from('orders').update({ status: 'assigned', driver_id: courierId }).eq('code', c.code)
  const late = await request.post(`/api/v1/orders/${c.code}/cancel`, { headers: auth(mine.key) })
  expect(late.status()).toBe(409)
  expect((await late.json()).error.status).toBe('assigned')
})

test('too many requests in a minute are slowed down', async ({ request }) => {
  const s = await makeShop('limit')
  const bucket = createHash('sha256').update('v1:' + s.keyId).digest('hex')
  for (let i = 0; i < 125; i++) await s.db.rpc('consume_limit', { p_key: bucket, p_max: 120 })
  const res = await request.get('/api/v1/zones', { headers: auth(s.key) })
  expect(res.status()).toBe(429)
  expect(res.headers()['retry-after']).toBe('60')
  expect((await res.json()).error.code).toBe('rate_limited')
})

// ─── Webhooks: the whole path from an order change to a signed message at the shop's system ──────────────────────────
// Needs CRON_SECRET and WEBHOOK_ALLOW_LOCAL=1 in the app's environment (CI sets both; locally pass them on the command line)
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { verifyWebhookSignature } from '../../lib/webhook-signature'

type Got = { path: string; headers: http.IncomingHttpHeaders; body: string }
async function shopReceiver(answer: number) {
  const got: Got[] = []
  const server = http.createServer((req, res) => {
    let body = ''
    req.on('data', c => body += c)
    req.on('end', () => { got.push({ path: req.url ?? '', headers: req.headers, body }); res.statusCode = answer; res.end('ok') })
  })
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r))
  return { got, url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/hook`, close: () => new Promise<void>(r => { server.closeAllConnections(); server.close(() => r()) }) }
}
const cron = (request: APIRequestContext, secret = process.env.CRON_SECRET) =>
  request.get('/api/cron/webhooks', { headers: secret ? { Authorization: 'Bearer ' + secret } : {} })

test('an order change reaches the shop as a signed webhook, and the scheduler is for the scheduler only', async ({ request }) => {
  expect(process.env.CRON_SECRET, 'run with CRON_SECRET and WEBHOOK_ALLOW_LOCAL=1 set').toBeTruthy()
  expect((await cron(request, '')).status()).toBe(401)
  expect((await cron(request, 'wrong-secret')).status()).toBe(401)

  const s = await makeShop('hook')
  const r = await shopReceiver(200)
  try {
    await s.db.from('shop_webhooks').insert({ shop_id: s.shopId, workspace_id: s.workspaceId, url: r.url, secret: 'whsec_e2e' })
    const { order } = await (await newOrder(request, s.key, { reference: 'HOOK-' + tag() })).json()
    const { courierId } = await seeded()
    await s.db.from('orders').update({ status: 'assigned', driver_id: courierId }).eq('code', order.code)
    await s.db.from('orders').update({ status: 'picked_up' }).eq('code', order.code)
    await s.db.from('orders').update({ status: 'delivered', pod_collected_usd: 25 }).eq('code', order.code)

    const ran = await (await cron(request)).json()
    expect(ran.delivered).toBeGreaterThanOrEqual(4)
    const mine = r.got.map(g => ({ ...g, json: JSON.parse(g.body) }))
    expect(mine.map(m => m.json.event).sort()).toEqual(['order.delivered', 'order.status_changed', 'order.status_changed', 'order.status_changed'])
    for (const m of mine) {
      expect(verifyWebhookSignature('whsec_e2e', m.body, String(m.headers['x-cedar-signature']))).toBe(true)
      expect(m.json.data.code).toBe(order.code)
    }
    const done = mine.find(m => m.json.event === 'order.delivered')!
    expect(done.json.data).toMatchObject({ status: 'delivered', previousStatus: 'picked_up', collectedUsd: 25 })
    expect(JSON.stringify(mine.map(m => m.json))).not.toContain('whsec_e2e')

    // Sent messages are not sent again
    const nothing = await (await cron(request)).json()
    expect(nothing.claimed).toBe(0)
    const { data: rows } = await s.db.from('webhook_deliveries').select('status, attempts').eq('shop_id', s.shopId)
    expect(rows!.every(row => row.status === 'delivered' && row.attempts === 1)).toBe(true)
  } finally { await r.close() }
})

test('a webhook that fails is retried later, and an unsafe address is refused with a reason', async ({ request }) => {
  expect(process.env.CRON_SECRET, 'run with CRON_SECRET and WEBHOOK_ALLOW_LOCAL=1 set').toBeTruthy()
  const s = await makeShop('hookfail')
  const r = await shopReceiver(500)
  try {
    await s.db.from('shop_webhooks').insert({ shop_id: s.shopId, workspace_id: s.workspaceId, url: r.url, secret: 'whsec_fail' })
    const { order } = await (await newOrder(request, s.key)).json()
    await s.db.from('orders').update({ status: 'cancelled' }).eq('code', order.code)
    await cron(request)
    expect(r.got.length).toBe(1)
    const { data: failed } = await s.db.from('webhook_deliveries').select('status, attempts, last_status_code, last_error, next_attempt_at').eq('shop_id', s.shopId).single()
    expect(failed).toMatchObject({ status: 'pending', attempts: 1, last_status_code: 500 })
    expect(failed!.last_error).toContain('500')
    expect(new Date(failed!.next_attempt_at).getTime()).toBeGreaterThan(Date.now())
    // Not due yet: another run leaves it alone
    await cron(request)
    expect(r.got.length).toBe(1)

    // A shop that points its webhook at an internal address is refused when sending, with the reason on record
    await s.db.from('shop_webhooks').update({ url: 'https://169.254.169.254/latest/meta-data' }).eq('shop_id', s.shopId)
    await s.db.from('webhook_deliveries').update({ next_attempt_at: new Date(Date.now() - 1000).toISOString() }).eq('shop_id', s.shopId)
    await cron(request)
    const { data: blocked } = await s.db.from('webhook_deliveries').select('attempts, last_status_code, last_error').eq('shop_id', s.shopId).single()
    expect(blocked!.attempts).toBe(2)
    expect(blocked!.last_status_code).toBeNull()
    expect(blocked!.last_error).toMatch(/webhook address/i)
  } finally { await r.close() }
})
