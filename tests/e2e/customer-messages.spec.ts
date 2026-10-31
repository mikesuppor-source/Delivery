import { test, expect } from 'playwright/test'
import { seeded } from './helpers'

// With no WhatsApp credentials set (as here) Cedar uses its built-in simulator, so nothing leaves the machine.
const cron = (request: import('playwright/test').APIRequestContext, secret = process.env.CRON_SECRET) =>
  request.get('/api/cron/messages', { headers: secret ? { Authorization: 'Bearer ' + secret } : {} })

test('order status changes are queued, sent once, and logged', async ({ request }) => {
  test.slow()
  const { db, workspaceId, shopId, areaId, courierId } = await seeded()
  const code = 'LS-MSG' + Math.random().toString(36).slice(2, 7).toUpperCase()
  const { data: order, error } = await db.from('orders').insert({
    workspace_id: workspaceId, shop_id: shopId, area_id: areaId, driver_id: courierId, code, status: 'assigned',
    usd_to_lbp_rate: 89500, collection_usd: 20, delivery_fee_usd: 3, driver_pay_usd: 2,
    recipient_name: 'Msg Customer', recipient_phone: '+961 71 555 666', recipient_address: 'Hamra Street 12',
  }).select('id').single()
  expect(error).toBeNull()
  const orderId = order!.id
  try {
    const sentFor = async () => (await db.from('message_log').select('template, status, body, to_phone').eq('order_id', orderId).order('created_at')).data ?? []

    // The cron route is for the scheduler only
    expect((await cron(request, 'wrong-secret')).status()).toBe(401)
    expect((await cron(request, '')).status()).toBe(401)

    // The parcel leaves with the courier: one "out for delivery" message is queued, then sent
    await db.from('orders').update({ status: 'picked_up' }).eq('id', orderId)
    const queued = await db.from('customer_message_queue').select('template, status').eq('order_id', orderId)
    expect(queued.data).toEqual([{ template: 'out_for_delivery', status: 'pending' }])
    const first = await cron(request)
    expect(first.status()).toBe(200)
    expect((await first.json()).sent).toBeGreaterThanOrEqual(1)
    const afterFirst = await sentFor()
    expect(afterFirst.map(m => m.template)).toEqual(['out_for_delivery'])
    expect(afterFirst[0].status).toBe('sent')
    expect(afterFirst[0].to_phone).toBe('+961 71 555 666')
    expect(afterFirst[0].body).toContain(code)
    expect(afterFirst[0].body).toContain('/track/')

    // Running the job again sends nothing twice
    await cron(request)
    expect(await sentFor()).toHaveLength(1)

    // Delivery sends the "delivered" message
    await db.from('orders').update({ status: 'delivered' }).eq('id', orderId)
    await cron(request)
    expect((await sentFor()).map(m => m.template)).toEqual(['out_for_delivery', 'delivered'])
    const rows = (await db.from('customer_message_queue').select('status').eq('order_id', orderId)).data ?? []
    expect(rows.map(r => r.status)).toEqual(['sent', 'sent'])

    // A message that is out of date by the time it is sent is skipped, not sent
    const late = 'LS-MSG' + Math.random().toString(36).slice(2, 7).toUpperCase()
    const { data: other } = await db.from('orders').insert({
      workspace_id: workspaceId, shop_id: shopId, area_id: areaId, driver_id: courierId, code: late, status: 'assigned',
      usd_to_lbp_rate: 89500, collection_usd: 0, delivery_fee_usd: 3, driver_pay_usd: 2, recipient_name: 'Late', recipient_phone: '+961 71 777 888', recipient_address: 'Hamra',
    }).select('id').single()
    try {
      await db.from('orders').update({ status: 'picked_up' }).eq('id', other!.id)
      await db.from('orders').update({ status: 'delivered' }).eq('id', other!.id)
      await cron(request)
      const lateLog = (await db.from('message_log').select('template').eq('order_id', other!.id)).data ?? []
      expect(lateLog.map(m => m.template)).toEqual(['delivered'])
      const lateQueue = (await db.from('customer_message_queue').select('template, status').eq('order_id', other!.id).order('template')).data ?? []
      expect(lateQueue).toEqual([{ template: 'delivered', status: 'sent' }, { template: 'out_for_delivery', status: 'skipped' }])
    } finally {
      await db.from('orders').delete().eq('id', other!.id)
    }
  } finally {
    await db.from('orders').delete().eq('id', orderId)
  }
})
