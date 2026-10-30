import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash, createHmac } from 'node:crypto'
import { generateApiKey, hashApiKey, bearerKey } from '../lib/api-keys'
import { signWebhook, verifyWebhookSignature } from '../lib/webhook-signature'
import { validateWebhookUrl, isPrivateAddress } from '../lib/webhook-url'

test('an API key is random, shown once, and only its hash is kept', () => {
  const a = generateApiKey(), b = generateApiKey()
  assert.match(a.key, /^cdr_live_[0-9a-f]{48}$/)
  assert.notEqual(a.key, b.key)
  assert.equal(a.prefix, a.key.slice(0, 13))
  assert.equal(a.hash, createHash('sha256').update(a.key).digest('hex'))
  assert.equal(hashApiKey(a.key), a.hash)
  assert.equal(a.hash.includes(a.key), false)
})

test('the bearer header yields a key only when it looks like one', () => {
  const { key } = generateApiKey()
  assert.equal(bearerKey('Bearer ' + key), key)
  assert.equal(bearerKey('bearer ' + key), key)
  for (const bad of [null, '', 'Bearer', 'Bearer abc', key, 'Basic ' + key, 'Bearer ' + key + 'x', 'Bearer ' + key.toUpperCase()]) {
    assert.equal(bearerKey(bad), null, String(bad))
  }
})

test('a webhook signature covers the time and the exact body', () => {
  const secret = 'whsec_test', body = '{"event":"order.delivered","data":{"code":"CD-1"}}', t = 1_800_000_000
  const header = signWebhook(secret, body, t)
  const expected = createHmac('sha256', secret).update(`${t}.${body}`).digest('hex')
  assert.equal(header, `t=${t},v1=${expected}`)
  assert.equal(verifyWebhookSignature(secret, body, header, { nowSeconds: t + 10 }), true)
  assert.equal(verifyWebhookSignature(secret, body + ' ', header, { nowSeconds: t }), false, 'changed body')
  assert.equal(verifyWebhookSignature('other', body, header, { nowSeconds: t }), false, 'wrong secret')
  assert.equal(verifyWebhookSignature(secret, body, header, { nowSeconds: t + 301 }), false, 'replayed later than the tolerance')
  assert.equal(verifyWebhookSignature(secret, body, header, { nowSeconds: t + 301, toleranceSeconds: 600 }), true)
  for (const bad of ['', 'v1=abc', `t=${t}`, `t=${t},v1=zz`, `t=abc,v1=${expected}`, `t=${t + 1},v1=${expected}`]) {
    assert.equal(verifyWebhookSignature(secret, body, bad, { nowSeconds: t }), false, bad)
  }
})

test('a webhook address must be a public https address', () => {
  assert.equal(validateWebhookUrl('https://hooks.example.com/cedar?x=1'), 'https://hooks.example.com/cedar?x=1')
  assert.equal(validateWebhookUrl('  https://hooks.example.com  '), 'https://hooks.example.com/')
  const refused = [
    'http://hooks.example.com/x', 'ftp://hooks.example.com/x', 'https://user:pass@hooks.example.com/x', 'not a url', '',
    'https://localhost/x', 'https://app.localhost/x', 'https://127.0.0.1/x', 'https://127.1/x', 'https://0.0.0.0/x', 'https://10.1.2.3/x',
    'https://192.168.1.5/x', 'https://172.16.0.1/x', 'https://172.31.255.255/x', 'https://169.254.169.254/latest/meta-data',
    'https://[::1]/x', 'https://[fd00::1]/x', 'https://[fe80::1]/x', 'https://[::ffff:10.0.0.1]/x',
    'https://printer.local/x', 'https://db.internal/x', 'https://intranet/x', 'https://2130706433/x', 'https://0x7f000001/x',
    'https://' + 'a'.repeat(600) + '.example.com/x',
  ]
  for (const url of refused) assert.throws(() => validateWebhookUrl(url), /webhook/i, url)
  // Tests and local development may point at a receiver on this machine, only when they say so
  assert.equal(validateWebhookUrl('http://127.0.0.1:4010/hook', { allowLocal: true }), 'http://127.0.0.1:4010/hook')
  assert.throws(() => validateWebhookUrl('http://169.254.169.254/x', { allowLocal: true }), /webhook/i, 'link-local stays blocked')
})

test('private and special addresses are recognised', () => {
  for (const ip of ['127.0.0.1', '10.0.0.1', '172.20.1.1', '192.168.0.1', '169.254.1.1', '100.64.0.1', '0.0.0.0', '224.0.0.1', '::1', '::', 'fc00::1', 'fd12::1', 'fe80::1', '::ffff:127.0.0.1', '::ffff:192.168.1.1'])
    assert.equal(isPrivateAddress(ip), true, ip)
  for (const ip of ['8.8.8.8', '1.1.1.1', '93.184.216.34', '172.32.0.1', '2606:4700:4700::1111', '::ffff:8.8.8.8'])
    assert.equal(isPrivateAddress(ip), false, ip)
})
