import test from 'node:test'
import assert from 'node:assert/strict'
import { DRIVER_STRINGS, useDriverTranslation } from '../lib/driver-i18n'
import { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY } from '../lib/push'

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

test('VAPID push configuration has valid public and private keys', () => {
  assert.ok(VAPID_PUBLIC_KEY && VAPID_PUBLIC_KEY.length > 50, 'Valid VAPID public key present')
  assert.ok(VAPID_PRIVATE_KEY && VAPID_PRIVATE_KEY.length > 30, 'Valid VAPID private key present')
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
