import { test, expect, type Page } from 'playwright/test'
import { apiCall, seeded, signInMerchant, paceCourierLogin, COURIER } from './helpers'

// Pickups, route order and returns handover are used by couriers and staff. Each call must come from a real courier session or a
// permitted login, and must only touch what that caller owns.
const FAKE = { Cookie: 'cedar_driver_session=anything', 'Content-Type': 'application/json' }

async function courierSignIn(page: Page, courierId: string) {
  await paceCourierLogin()
  await page.goto('/driver')
  await page.locator('input[type=tel]').fill(COURIER.phone)
  await page.locator('input[type=password]').fill(COURIER.pin)
  await page.locator('button[type=submit]').click()
  await expect(page).toHaveURL(new RegExp('/driver/' + courierId), { timeout: 30_000 })
}

test('a made-up courier cookie opens none of the shared courier routes', async ({ request }) => {
  const { workspaceId, shopId, courierId } = await seeded()
  const zero = '00000000-0000-4000-8000-000000000000'
  const calls = [
    request.get('/api/pickups?workspaceId=' + workspaceId, { headers: FAKE }),
    request.post('/api/pickups', { headers: FAKE, data: { workspaceId, shopId, parcelCount: 1 } }),
    request.patch('/api/pickups', { headers: FAKE, data: { pickupId: zero, status: 'collected' } }),
    request.post('/api/orders/route', { headers: FAKE, data: { driverId: courierId, optimize: true } }),
    request.get('/api/orders/returns-handover?workspaceId=' + workspaceId, { headers: FAKE }),
    request.post('/api/orders/returns-handover', { headers: FAKE, data: { shopId, orderIds: [zero] } }),
  ]
  for (const response of await Promise.all(calls)) expect(response.status()).toBe(401)
})

test('a shop login reaches only its own pickups and returns, and cannot act as a courier or staff', async ({ page }) => {
  test.slow()
  const { db, workspaceId, shopId, courierId } = await seeded()
  const { data: other } = await db.from('shops').insert({ workspace_id: workspaceId, name: 'Other Access Shop ' + Math.random().toString(36).slice(2, 6), prefix: 'OA' }).select('id').single()
  const { data: pickup } = await db.from('pickups').insert({ workspace_id: workspaceId, shop_id: shopId, driver_id: courierId, parcel_count: 1, status: 'assigned' }).select('id').single()
  try {
    await signInMerchant(page)
    expect((await apiCall(page, `/api/pickups?shopId=${shopId}&workspaceId=${workspaceId}`)).status).toBe(200)
    expect((await apiCall(page, `/api/pickups?workspaceId=${workspaceId}`)).status).toBe(403)
    expect((await apiCall(page, `/api/pickups?shopId=${other!.id}&workspaceId=${workspaceId}`)).status).toBe(403)
    expect((await apiCall(page, `/api/pickups?driverId=${courierId}`)).status).toBeGreaterThanOrEqual(401)
    // A shop asks for a pickup for itself, not for another shop
    const own = await apiCall(page, '/api/pickups', 'POST', { workspaceId, shopId, parcelCount: 1 })
    expect(own.status).toBe(200)
    await db.from('pickups').delete().eq('id', own.body.pickup.id)
    expect((await apiCall(page, '/api/pickups', 'POST', { workspaceId, shopId: other!.id, parcelCount: 1 })).status).toBe(403)
    // It cannot assign, cancel or collect a pickup
    expect((await apiCall(page, '/api/pickups', 'PATCH', { pickupId: pickup!.id, status: 'cancelled' })).status).toBe(403)
    expect((await apiCall(page, '/api/pickups', 'PATCH', { pickupId: pickup!.id, status: 'collected' })).status).toBe(403)
    expect((await apiCall(page, '/api/orders/route', 'POST', { driverId: courierId, optimize: true })).status).toBeGreaterThanOrEqual(401)
    expect((await apiCall(page, `/api/orders/returns-handover?shopId=${shopId}`)).status).toBe(200)
    expect((await apiCall(page, `/api/orders/returns-handover?workspaceId=${workspaceId}`)).status).toBe(403)
    expect((await apiCall(page, `/api/orders/returns-handover?shopId=${other!.id}`)).status).toBe(403)
  } finally {
    await db.from('pickups').delete().eq('id', pickup!.id)
    await db.from('shops').delete().eq('id', other!.id)
  }
})

test('a courier collects only their own pickups and hands over only their own returned parcels', async ({ page }) => {
  test.slow()
  const { db, workspaceId, shopId, areaId, courierId, otherCourierId } = await seeded()
  const order = async (driverId: string) => (await db.from('orders').insert({
    workspace_id: workspaceId, shop_id: shopId, area_id: areaId, driver_id: driverId, code: 'LS-RA' + Math.random().toString(36).slice(2, 7).toUpperCase(), status: 'returned',
    usd_to_lbp_rate: 89500, collection_usd: 0, delivery_fee_usd: 3, driver_pay_usd: 2, recipient_name: 'Return Customer', recipient_phone: '+961 71 444 555', recipient_address: 'Hamra',
  }).select('id').single()).data!.id
  const [mine, theirs] = [await order(courierId), await order(otherCourierId)]
  const pickup = async (driverId: string | null) => (await db.from('pickups').insert({ workspace_id: workspaceId, shop_id: shopId, driver_id: driverId, parcel_count: 1, status: 'assigned' }).select('id').single()).data!.id
  const [ownPickup, otherPickup] = [await pickup(courierId), await pickup(otherCourierId)]
  try {
    await courierSignIn(page, courierId)
    expect((await apiCall(page, '/api/pickups?driverId=' + courierId)).status).toBe(200)
    expect((await apiCall(page, '/api/pickups?driverId=' + otherCourierId)).status).toBeGreaterThanOrEqual(401)
    expect((await apiCall(page, `/api/pickups?workspaceId=${workspaceId}`)).status).toBeGreaterThanOrEqual(401)
    expect((await apiCall(page, '/api/pickups', 'PATCH', { pickupId: otherPickup, status: 'collected', driverId: courierId })).status).toBe(403)
    expect((await apiCall(page, '/api/pickups', 'PATCH', { pickupId: ownPickup, status: 'cancelled' })).status).toBe(403)
    expect((await apiCall(page, '/api/pickups', 'PATCH', { pickupId: ownPickup, status: 'collected' })).status).toBe(200)
    expect((await apiCall(page, '/api/orders/route', 'POST', { driverId: otherCourierId, optimize: true })).status).toBeGreaterThanOrEqual(401)
    expect((await apiCall(page, '/api/orders/route', 'POST', { driverId: courierId, optimize: true })).status).toBe(200)
    expect((await apiCall(page, '/api/orders/returns-handover', 'POST', { shopId, orderIds: [theirs] })).status).toBe(403)
    expect((await apiCall(page, '/api/orders/returns-handover', 'POST', { shopId, orderIds: [mine, theirs] })).status).toBe(403)
    expect((await apiCall(page, '/api/orders/returns-handover', 'POST', { shopId, orderIds: [mine] })).status).toBe(200)
    expect((await db.from('orders').select('returns_handed_at').eq('id', theirs).single()).data!.returns_handed_at).toBeNull()
  } finally {
    await db.from('pickups').delete().in('id', [ownPickup, otherPickup])
    await db.from('orders').delete().in('id', [mine, theirs])
  }
})
