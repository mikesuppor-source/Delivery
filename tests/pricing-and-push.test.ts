import test from 'node:test'
import assert from 'node:assert/strict'
import { DRIVER_STRINGS, useDriverTranslation } from '../lib/driver-i18n'
import webpush from 'web-push'
import { isPushConfigured, sendPushToDriver } from '../lib/push'
import { sameServerKey } from '../app/driver/[id]/run-sheet/shared'

test('Driver i18n translation engine provides accurate bilingual mappings', () => {
  const tEn = useDriverTranslation('en')
  const tAr = useDriverTranslation('ar')

  // Core mobile labels
  assert.equal(tEn('courierActive'), 'Courier Active')
  assert.equal(tAr('courierActive'), 'السائق نشط')

  assert.equal(tEn('toDeliverTab'), 'To Deliver')
  assert.equal(tAr('toDeliverTab'), 'قيد التوصيل')

  assert.equal(tEn('markDelivered'), 'Mark Delivered (POD)')
  assert.equal(tAr('markDelivered'), 'تأكيد التسليم (POD)')

  assert.equal(tEn('codToCollect'), 'COD to Collect')
  assert.equal(tAr('codToCollect'), 'مبالغ مطلوب تحصيلها')

  // Switch button labels
  assert.equal(tEn('switchLang'), 'عربي')
  assert.equal(tAr('switchLang'), 'EN')
})

const PUSH_SETTINGS = ['NEXT_PUBLIC_VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_SUBJECT'] as const

async function withPushSettings(values: Partial<Record<(typeof PUSH_SETTINGS)[number], string>>, run: () => void | Promise<void>) {
  const saved = Object.fromEntries(PUSH_SETTINGS.map(name => [name, process.env[name]]))
  for (const name of PUSH_SETTINGS) {
    const value = values[name]
    if (value === undefined) delete process.env[name]
    else process.env[name] = value
  }
  try {
    await run()
  } finally {
    for (const name of PUSH_SETTINGS) {
      if (saved[name] === undefined) delete process.env[name]
      else process.env[name] = saved[name]
    }
  }
}

test('push notifications are off until a key pair is set, and nothing is sent', async () => {
  await withPushSettings({}, async () => {
    assert.equal(isPushConfigured(), false)
    const result = await sendPushToDriver('00000000-0000-4000-8000-000000000001', { title: 'Test', body: 'Test' })
    assert.equal(result.sent, 0)
    assert.equal(result.failed, 0)
    assert.match(result.errors?.[0] ?? '', /not set up/)
  })
})

test('push notifications turn on with a valid key pair and stay off with a missing or broken one', async () => {
  const pair = webpush.generateVAPIDKeys()
  await withPushSettings({ NEXT_PUBLIC_VAPID_PUBLIC_KEY: pair.publicKey, VAPID_PRIVATE_KEY: pair.privateKey }, () => {
    assert.equal(isPushConfigured(), true)
  })
  await withPushSettings({ NEXT_PUBLIC_VAPID_PUBLIC_KEY: pair.publicKey }, () => assert.equal(isPushConfigured(), false))
  await withPushSettings({ VAPID_PRIVATE_KEY: pair.privateKey }, () => assert.equal(isPushConfigured(), false))
  await withPushSettings({ NEXT_PUBLIC_VAPID_PUBLIC_KEY: 'not-a-key', VAPID_PRIVATE_KEY: 'not-a-key-either' }, () => assert.equal(isPushConfigured(), false))
})

test('a phone registered with an older signing key is recognised so it can register again', () => {
  const oldPair = webpush.generateVAPIDKeys()
  const newPair = webpush.generateVAPIDKeys()
  const bytes = (key: string) => new Uint8Array(Buffer.from(key, 'base64url'))
  const registeredWithOld = bytes(oldPair.publicKey).buffer
  assert.equal(sameServerKey(registeredWithOld, bytes(oldPair.publicKey)), true)
  assert.equal(sameServerKey(registeredWithOld, bytes(newPair.publicKey)), false)
  assert.equal(sameServerKey(null, bytes(newPair.publicKey)), true) // the browser does not say: leave it alone
})

test('Arabic dictionary has corresponding translations for all English keys', () => {
  const enKeys = Object.keys(DRIVER_STRINGS.en) as Array<keyof typeof DRIVER_STRINGS.en>
  for (const key of enKeys) {
    assert.ok(
      DRIVER_STRINGS.ar[key] && DRIVER_STRINGS.ar[key].trim().length > 0,
      `Missing Arabic translation for key: ${key}`
    )
  }
})
