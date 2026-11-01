import { test, expect } from 'playwright/test'
import { seeded, signInMerchant, apiCall, paceCourierLogin, COURIER } from './helpers'

// Recording or reading a delivery attempt must be limited to the courier who has the order (or the desk staff of that company).
async function newOrder(status: 'assigned' | 'picked_up' = 'picked_up') {
  const { db, workspaceId, shopId, areaId, courierId } = await seeded()
  const code = 'LS-AT' + Math.random().toString(36).slice(2, 7).toUpperCase()
  const { data, error } = await db.from('orders').insert({
    workspace_id: workspaceId, shop_id: shopId, area_id: areaId, driver_id: courierId, code, status, usd_to_lbp_rate: 89500,
    collection_usd: 15, delivery_fee_usd: 3, driver_pay_usd: 2, recipient_name: 'Attempt Customer', recipient_phone: '+961 71 222 333', recipient_address: 'Hamra Street 12',
  }).select('id').single()
  expect(error).toBeNull()
  return { db, id: data!.id, courierId }
}

test('a made-up courier cookie or a shop login cannot read or record delivery attempts', async ({ request, page }) => {
  test.slow()
  const { db, id } = await newOrder()
  try {
    // Any cookie value used to be enough to get past the sign-in check on this route
    const fake = { Cookie: 'cedar_driver_session=anything' }
    expect((await request.get('/api/orders/attempts?orderId=' + id, { headers: fake })).status()).toBe(401)
    const forged = await request.post('/api/orders/attempts', { headers: { ...fake, 'Content-Type': 'application/json' }, data: { orderId: id, result: 'delivered' } })
    expect(forged.status()).toBe(401)
    expect((await db.from('orders').select('status').eq('id', id).single()).data!.status).toBe('picked_up')

    // A signed-in shop is not the courier: it cannot mark its own parcel delivered
    await signInMerchant(page)
    const read = await apiCall(page, '/api/orders/attempts?orderId=' + id)
    expect(read.status).toBeGreaterThanOrEqual(401)
    const shop = await apiCall(page, '/api/orders/attempts', 'POST', { orderId: id, result: 'delivered' })
    expect(shop.status).toBeGreaterThanOrEqual(401)
    expect((await db.from('orders').select('status').eq('id', id).single()).data!.status).toBe('picked_up')
  } finally {
    await db.from('orders').delete().eq('id', id)
  }
})

test('a courier can record attempts only on their own orders', async ({ page }) => {
  test.slow()
  const { db, id, courierId } = await newOrder()
  const { otherCourierId } = await seeded()
  try {
    await paceCourierLogin()
    await page.goto('/driver')
    await page.locator('input[type=tel]').fill(COURIER.phone)
    await page.locator('input[type=password]').fill(COURIER.pin)
    await page.locator('button[type=submit]').click()
    await expect(page).toHaveURL(new RegExp('/driver/' + courierId), { timeout: 30_000 })
    // Another courier's id in the body does not give access, and an order that is not theirs is refused
    const spoof = await apiCall(page, '/api/orders/attempts', 'POST', { orderId: id, driverId: otherCourierId, result: 'no_answer' })
    expect(spoof.status).toBe(200)
    expect((await db.from('delivery_attempts').select('driver_id').eq('order_id', id)).data).toEqual([{ driver_id: courierId }])
    await db.from('orders').update({ driver_id: otherCourierId }).eq('id', id)
    expect((await apiCall(page, '/api/orders/attempts', 'POST', { orderId: id, result: 'no_answer' })).status).toBe(403)
    expect((await apiCall(page, '/api/orders/attempts?orderId=' + id)).status).toBe(403)
  } finally {
    await db.from('orders').delete().eq('id', id)
  }
})
