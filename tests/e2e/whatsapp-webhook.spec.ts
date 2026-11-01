import { createHmac } from 'node:crypto'
import { test, expect, type APIRequestContext } from 'playwright/test'
import { seeded } from './helpers'

// The test signs its own messages the way Meta does. The settings are for the throwaway local stack only.
const VERIFY = process.env.WHATSAPP_VERIFY_TOKEN
const SECRET = process.env.WHATSAPP_APP_SECRET
const CRON = process.env.CRON_SECRET
const sign = (raw: string, secret = SECRET!) => 'sha256=' + createHmac('sha256', secret).update(raw).digest('hex')

const payload = (phoneNumberId: string, statuses: unknown[] = [], messages: unknown[] = []) => ({
  object: 'whatsapp_business_account',
  entry: [{ id: 'WABA', changes: [{ field: 'messages', value: { metadata: { phone_number_id: phoneNumberId }, statuses, messages } }] }],
})
async function post(request: APIRequestContext, body: unknown, signature?: string) {
  const raw = JSON.stringify(body)
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (signature === undefined) headers['X-Hub-Signature-256'] = sign(raw)
  else if (signature) headers['X-Hub-Signature-256'] = signature
  return request.post('/api/webhooks/whatsapp', { headers, data: raw })
}

test('WhatsApp receipts update messages, and STOP and START change who is messaged', async ({ request }) => {
  test.skip(!VERIFY || !SECRET || !CRON, 'needs WHATSAPP_VERIFY_TOKEN, WHATSAPP_APP_SECRET and CRON_SECRET')
  test.slow()
  const { db, workspaceId, shopId, areaId, courierId } = await seeded()
  const stamp = Math.random().toString(36).slice(2, 8)
  const pnid = 'PNID' + stamp
  const phone = '+961 71 555 666'
  const key = '96171555666'
  const wamid = (n: string) => `wamid.${stamp}.${n}`
  const before = (await db.from('workspaces').select('whatsapp_phone_number_id').eq('id', workspaceId).single()).data!
  await db.from('workspaces').update({ whatsapp_phone_number_id: pnid }).eq('id', workspaceId)
  const orderIds: string[] = []
  const makeOrder = async () => {
    const code = 'LS-WA' + Math.random().toString(36).slice(2, 7).toUpperCase()
    const { data, error } = await db.from('orders').insert({
      workspace_id: workspaceId, shop_id: shopId, area_id: areaId, driver_id: courierId, code, status: 'assigned', usd_to_lbp_rate: 89500,
      collection_usd: 10, delivery_fee_usd: 3, driver_pay_usd: 2, recipient_name: 'WA Customer', recipient_phone: phone, recipient_address: 'Hamra Street 12',
    }).select('id').single()
    expect(error).toBeNull()
    orderIds.push(data!.id)
    return data!.id
  }
  const cron = () => request.get('/api/cron/messages', { headers: { Authorization: 'Bearer ' + CRON } })
  const logged = async (orderId: string) => (await db.from('message_log').select('template, status').eq('order_id', orderId).eq('direction', 'out')).data ?? []
  try {
    // Meta's check when the webhook is saved
    const ok = await request.get(`/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=${VERIFY}&hub.challenge=424242`)
    expect(ok.status()).toBe(200)
    expect(await ok.text()).toBe('424242')
    expect((await request.get('/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=1')).status()).toBe(403)
    expect((await request.get('/api/webhooks/whatsapp')).status()).toBe(403)

    // Unsigned or wrongly signed messages are refused and change nothing
    expect((await post(request, payload(pnid), '')).status()).toBe(401)
    expect((await post(request, payload(pnid, [{ id: wamid('a'), status: 'read' }]), sign('{}', 'wrong-secret'))).status()).toBe(401)

    // Receipts move a message forward and never back; a failure shows its reason
    const insert = async (n: string) => (await db.from('message_log').insert({
      workspace_id: workspaceId, channel: 'whatsapp', template: 'delivered', to_phone: phone, status: 'sent', provider_message_id: wamid(n),
    }).select('id').single()).data!.id
    const a = await insert('a')
    const b = await insert('b')
    const state = async (id: string) => (await db.from('message_log').select('status, error, delivered_at, read_at').eq('id', id).single()).data!
    const t0 = Math.floor(Date.now() / 1000)
    expect((await post(request, payload(pnid, [{ id: wamid('a'), status: 'delivered', timestamp: String(t0) }]))).status()).toBe(200)
    expect((await state(a)).status).toBe('delivered')
    expect((await state(a)).delivered_at).not.toBeNull()
    await post(request, payload(pnid, [{ id: wamid('a'), status: 'read', timestamp: String(t0 + 5) }]))
    expect((await state(a)).status).toBe('read')
    expect((await state(a)).read_at).not.toBeNull()
    await post(request, payload(pnid, [{ id: wamid('a'), status: 'delivered', timestamp: String(t0 + 6) }])) // a late receipt
    expect((await state(a)).status).toBe('read')
    await post(request, payload(pnid, [{ id: wamid('b'), status: 'failed', errors: [{ title: 'Message undeliverable', message: 'Not a WhatsApp user' }] }]))
    expect(await state(b)).toMatchObject({ status: 'failed', error: 'Message undeliverable: Not a WhatsApp user' })
    expect((await post(request, payload(pnid, [{ id: 'wamid.unknown', status: 'read' }]))).status()).toBe(200) // not ours: ignored

    // The customer replies STOP: remembered, and the same webhook sent twice is stored once
    const stop = payload(pnid, [], [{ id: wamid('in1'), from: key, timestamp: String(t0), type: 'text', text: { body: 'STOP' } }])
    expect(await (await post(request, stop)).json()).toMatchObject({ success: true, replies: 1, optedOut: 1 })
    await post(request, stop)
    expect((await db.from('customer_opt_outs').select('phone').eq('workspace_id', workspaceId).eq('phone', key)).data).toEqual([{ phone: key }])
    expect((await db.from('message_log').select('id').eq('provider_message_id', wamid('in1'))).data).toHaveLength(1)
    const reply = (await db.from('message_log').select('direction, status, body, to_phone').eq('provider_message_id', wamid('in1')).single()).data!
    expect(reply).toMatchObject({ direction: 'in', status: 'received', body: 'STOP', to_phone: '+' + key })

    // While opted out, a status change queues a message but nothing is sent
    const muted = await makeOrder()
    await db.from('orders').update({ status: 'picked_up' }).eq('id', muted)
    expect((await cron()).status()).toBe(200)
    expect(await logged(muted)).toEqual([])
    expect((await db.from('customer_message_queue').select('template, status').eq('order_id', muted)).data).toEqual([{ template: 'out_for_delivery', status: 'skipped' }])

    // START turns the messages back on
    await post(request, payload(pnid, [], [{ id: wamid('in2'), from: key, type: 'text', text: { body: 'start' } }]))
    expect((await db.from('customer_opt_outs').select('phone').eq('workspace_id', workspaceId).eq('phone', key)).data).toEqual([])
    const again = await makeOrder()
    await db.from('orders').update({ status: 'picked_up' }).eq('id', again)
    await cron()
    expect((await logged(again)).map(m => m.template)).toEqual(['out_for_delivery'])

    // A message that arrives on another company's number is not stored
    await post(request, payload('PNID-OTHER', [], [{ id: wamid('in3'), from: key, type: 'text', text: { body: 'hello' } }]))
    expect((await db.from('message_log').select('id').eq('provider_message_id', wamid('in3'))).data).toHaveLength(0)
  } finally {
    for (const id of orderIds) await db.from('orders').delete().eq('id', id)
    await db.from('message_log').delete().like('provider_message_id', `wamid.${stamp}.%`)
    await db.from('customer_opt_outs').delete().eq('workspace_id', workspaceId).eq('phone', key)
    await db.from('workspaces').update({ whatsapp_phone_number_id: before.whatsapp_phone_number_id }).eq('id', workspaceId)
  }
})

test('the privacy and terms pages are public', async ({ request }) => {
  for (const [path, heading] of [['/privacy', 'Privacy Policy'], ['/terms', 'Terms of Service']]) {
    const res = await request.get(path)
    expect(res.status(), path).toBe(200)
    expect(await res.text()).toContain(heading)
  }
})
