import test from 'node:test'
import assert from 'node:assert/strict'
import {
  renderTemplate,
  MESSAGE_TEMPLATES,
  SimulatedMessagingProvider,
  MessageTemplate,
} from '../lib/messaging'

test('renderTemplate: renders English order_created template with interpolated parameters', () => {
  const result = renderTemplate('order_created', 'en', {
    code: 'CED-101',
    shop: 'Beirut Boutique',
    track_url: 'https://track.cedar.test/track/xyz-123',
  })

  assert.equal(
    result,
    'Your order #CED-101 from Beirut Boutique is confirmed! Track your package here: https://track.cedar.test/track/xyz-123'
  )
})

test('renderTemplate: renders Arabic order_created template with interpolated parameters', () => {
  const result = renderTemplate('order_created', 'ar', {
    code: 'CED-101',
    shop: 'بيروت بوتيك',
    track_url: 'https://track.cedar.test/track/xyz-123',
  })

  assert.equal(
    result,
    'تم تأكيد طلبك #CED-101 من متجر بيروت بوتيك! يمكنك تتبع شحنتك هنا: https://track.cedar.test/track/xyz-123'
  )
})

test('renderTemplate: supports all lifecycle notification templates in both languages', () => {
  const templates: MessageTemplate[] = [
    'order_created',
    'out_for_delivery',
    'delivered',
    'failed_attempt',
    'held',
  ]

  const sampleParams = {
    code: 'CED-999',
    shop: 'Cedar Test Shop',
    courier: 'Ahmad',
    track_url: 'https://track.cedar.test/track/token',
    reason: 'Customer not answering phone',
    date: 'tomorrow 10:00 AM',
  }

  for (const t of templates) {
    const en = renderTemplate(t, 'en', sampleParams)
    const ar = renderTemplate(t, 'ar', sampleParams)

    assert.ok(en.length > 10, `EN template for ${t} should produce non-empty text`)
    assert.ok(ar.length > 10, `AR template for ${t} should produce non-empty text`)
    assert.match(en, /CED-999/, `EN template for ${t} should include order code`)
    assert.match(ar, /CED-999/, `AR template for ${t} should include order code`)
    assert.match(en, /https:\/\/track\.cedar\.test/, `EN template for ${t} should include tracking link`)
    assert.match(ar, /https:\/\/track\.cedar\.test/, `AR template for ${t} should include tracking link`)
  }
})

test('renderTemplate: falls back to English when language is not provided or unknown', () => {
  const result = renderTemplate('delivered', undefined as any, {
    code: 'CED-555',
    track_url: 'https://track.cedar.test/track/555',
  })

  assert.match(result, /Your order #CED-555 has been delivered!/)
})

test('SimulatedMessagingProvider: returns success with simulated ID', async () => {
  const provider = new SimulatedMessagingProvider()
  const res = await provider.send(
    {
      workspaceId: 'ws-123',
      toPhone: '+961 70 111 222',
      template: 'order_created',
      params: { code: 'CED-123' },
    },
    'Test message body'
  )

  assert.equal(res.success, true)
  assert.ok(res.id && res.id.startsWith('sim-'))
})
