import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { META_TEMPLATES, templateMessage, templateParameters, templatesDocument, type TemplateKey } from '../lib/whatsapp-templates'
import { WhatsAppCloudProvider } from '../lib/messaging'
import { messageLanguage, messageParams, stillRelevant, type MessageOrder } from '../lib/customer-messages'

const KEYS = Object.keys(META_TEMPLATES) as TemplateKey[]
const variables = (text: string) => [...text.matchAll(/\{\{(\d+)\}\}/g)].map(m => Number(m[1]))

test('every template follows Meta\'s rules, in both languages', () => {
  const names = new Set<string>()
  for (const key of KEYS) {
    const t = META_TEMPLATES[key]
    assert.match(t.name, /^[a-z][a-z0-9_]{0,511}$/, key + ': template names are lowercase letters, digits and underscores')
    assert.ok(!names.has(t.name), key + ': duplicate template name')
    names.add(t.name)
    for (const lang of ['en', 'ar'] as const) {
      const text = t[lang]
      const found = variables(text)
      assert.deepEqual(found, t.params.map((_, i) => i + 1), `${key}/${lang}: variables must be {{1}}, {{2}}, ... in order, one per parameter`)
      assert.ok(!/^\s*\{\{/.test(text) && !/\}\}\s*[.!?]?\s*$/.test(text), `${key}/${lang}: Meta rejects a text that starts or ends with a variable`)
      assert.ok(text.length <= 1024, `${key}/${lang}: body is longer than 1024 characters`)
      assert.ok(!/\{\{\d+\}\}\s*\{\{\d+\}\}/.test(text), `${key}/${lang}: two variables next to each other`)
    }
  }
})

test('the message body carries the variables in the order the template expects', () => {
  const body = templateMessage('96171111222', 'out_for_delivery', 'ar', { code: 'CED-1', courier: 'Rami', track_url: 'https://x.test/track/1', shop: 'ignored' })
  assert.equal(body.type, 'template')
  assert.equal(body.to, '96171111222')
  assert.equal(body.template.name, 'cedar_out_for_delivery')
  assert.equal(body.template.language.code, 'ar')
  assert.deepEqual(body.template.components[0].parameters.map(p => p.text), ['CED-1', 'Rami', 'https://x.test/track/1'])
})

test('variables are cleaned the way WhatsApp requires', () => {
  const [a, b, c] = templateParameters('failed_attempt', { code: 'CED-2', reason: 'no\nanswer\t today', track_url: '' })
  assert.equal(a.text, 'CED-2')
  assert.equal(b.text, 'no answer today')
  assert.equal(c.text, '-', 'an empty value becomes a dash, because WhatsApp refuses empty variables')
})

test('the WhatsApp provider sends an approved template and reports errors plainly', async () => {
  const calls: Array<{ url: string; init: RequestInit }> = []
  const ok = new WhatsAppCloudProvider('tok', '123', (async (url: string, init: RequestInit) => {
    calls.push({ url, init })
    return { ok: true, json: async () => ({ messages: [{ id: 'wamid.1' }] }) } as Response
  }) as unknown as typeof fetch)
  const sent = await ok.send({ workspaceId: 'w', toPhone: '71 111 222', template: 'delivered', lang: 'en', params: { code: 'CED-3', track_url: 'https://x.test/t' } }, 'ignored')
  assert.deepEqual(sent, { success: true, id: 'wamid.1' })
  assert.equal(calls[0].url, 'https://graph.facebook.com/v21.0/123/messages')
  assert.equal((calls[0].init.headers as Record<string, string>).Authorization, 'Bearer tok')
  const posted = JSON.parse(String(calls[0].init.body))
  assert.equal(posted.type, 'template')
  assert.equal(posted.to, '96171111222')
  assert.equal(posted.template.name, 'cedar_delivered')

  const refused = new WhatsAppCloudProvider('tok', '123', (async () => ({ ok: false, json: async () => ({ error: { message: 'Template not approved' } }) }) as Response) as unknown as typeof fetch)
  assert.deepEqual(await refused.send({ workspaceId: 'w', toPhone: '71 111 222', template: 'delivered', params: {} }, ''), { success: false, error: 'Template not approved' })
  const down = new WhatsAppCloudProvider('tok', '123', (async () => { throw new Error('offline') }) as unknown as typeof fetch)
  assert.deepEqual(await down.send({ workspaceId: 'w', toPhone: '71 111 222', template: 'delivered', params: {} }, ''), { success: false, error: 'offline' })
})

const order: MessageOrder = { code: 'CED-9', status: 'picked_up', is_held: false, recipient_phone: '71 111 222', tracking_token: 'tok123', shop: { name: 'Beirut Boutique' }, driver: { name: 'Rami' } }

test('a queued message is only sent while the order still matches it', () => {
  assert.equal(stillRelevant('out_for_delivery', { status: 'picked_up', is_held: false }), true)
  assert.equal(stillRelevant('out_for_delivery', { status: 'delivered', is_held: false }), false, 'the parcel was already delivered')
  assert.equal(stillRelevant('delivered', { status: 'delivered', is_held: false }), true)
  assert.equal(stillRelevant('failed_attempt', { status: 'failed', is_held: false }), true)
  assert.equal(stillRelevant('failed_attempt', { status: 'cancelled', is_held: false }), false)
  assert.equal(stillRelevant('held', { status: 'pending', is_held: true }), true)
  assert.equal(stillRelevant('held', { status: 'pending', is_held: false }), false, 'already released')
})

test('message values: language by number, readable reasons, dates and links', () => {
  assert.equal(messageLanguage('71 111 222'), 'ar')
  assert.equal(messageLanguage('+44 7700 900123'), 'en')
  const ar = messageParams({ order, lang: 'ar', baseUrl: 'https://site.test', attemptResult: 'no_answer', deliverAfter: '2026-11-05' })
  assert.equal(ar.track_url, 'https://site.test/track/tok123')
  assert.equal(ar.reason, 'لم يتم الرد')
  assert.equal(ar.courier, 'Rami')
  const en = messageParams({ order: { ...order, driver: null, tracking_token: null }, lang: 'en', baseUrl: 'https://site.test', attemptResult: 'weird', deliverAfter: null })
  assert.equal(en.track_url, 'https://site.test/track/CED-9', 'falls back to the order code')
  assert.equal(en.courier, 'Cedar')
  assert.equal(en.reason, 'a delivery problem')
  assert.equal(en.date, 'further notice')
  assert.match(messageParams({ order, lang: 'en', baseUrl: 'x', deliverAfter: '2026-11-05' }).date, /5 Nov/)
})

test('docs/WHATSAPP_TEMPLATES.md matches the templates in the code', () => {
  const doc = readFileSync('docs/WHATSAPP_TEMPLATES.md', 'utf8').replace(/\r\n/g, '\n')
  assert.equal(doc.trimEnd(), templatesDocument().trimEnd(), 'run: npx tsx scripts/write-whatsapp-templates-doc.ts')
})
