import { test, expect, type Page } from 'playwright/test'
import { apiCall, seeded, signInOwner, COURIER } from './helpers'

// The customer's delivery code: shown only on the customer's private link, checked on the server, and a delivery without it is
// flagged for the owner. Photos below are the smallest valid JPEG: its first two bytes are all the server looks at.
const PHOTO = 'data:image/jpeg;base64,/9j/2Q=='
const PIN = { lat: 33.8938, lng: 35.5018 }

async function courierSignIn(page: Page, courierId: string) {
  await page.goto('/driver')
  await page.locator('input[type=tel]').fill(COURIER.phone)
  await page.locator('input[type=password]').fill(COURIER.pin)
  await page.locator('button[type=submit]').click()
  await expect(page).toHaveURL(new RegExp('/driver/' + courierId), { timeout: 30_000 })
}

async function parcel(status: 'assigned' | 'picked_up' = 'picked_up', withPin = true) {
  const { db, workspaceId, shopId, areaId, courierId } = await seeded()
  const code = 'LS-DP' + Math.random().toString(36).slice(2, 7).toUpperCase()
  const { data, error } = await db.from('orders').insert({
    workspace_id: workspaceId, shop_id: shopId, area_id: areaId, driver_id: courierId, code, status: 'assigned', usd_to_lbp_rate: 89500,
    collection_usd: 12, delivery_fee_usd: 3, driver_pay_usd: 2, recipient_name: 'Proof Customer', recipient_phone: '+961 71 888 777', recipient_address: 'Hamra Street 12',
    ...(withPin ? { location_lat: PIN.lat, location_lng: PIN.lng } : {}),
  }).select('id, tracking_token').single()
  expect(error).toBeNull()
  if (status === 'picked_up') await db.from('orders').update({ status: 'picked_up' }).eq('id', data!.id)
  const secret = (await db.from('order_delivery_codes').select('code').eq('order_id', data!.id).single()).data!.code
  return { db, id: data!.id, token: data!.tracking_token as string, code, secret, courierId }
}

const deliver = (page: Page, order: { id: string }, courierId: string, extra: Record<string, unknown> = {}) =>
  apiCall(page, '/api/driver/orders', 'PATCH', { orderId: order.id, driverId: courierId, status: 'delivered', podCollectedUsd: 12, podCollectedLbp: 0, ...extra })

test('the customer code is shown only on the private tracking link, and the courier never receives it', async ({ page, request }) => {
  test.slow()
  const o = await parcel()
  try {
    const own = await request.get('/track/' + o.token)
    expect(own.status()).toBe(200)
    const html = await own.text()
    expect(html).toContain('data-testid="delivery-code-card"')
    expect(html).toContain(o.secret)
    expect(html).toContain('data:image/png;base64,') // the QR

    // The printed order code, which anyone can see on the parcel, shows no code
    const printed = await (await request.get('/track/' + encodeURIComponent(o.code))).text()
    expect(printed).not.toContain('delivery-code-card')
    expect(printed).not.toContain(o.secret)

    // The courier's order list says a code is needed, without saying which
    await courierSignIn(page, o.courierId)
    const list = await apiCall(page, '/api/driver/orders?driverId=' + o.courierId)
    const mine = list.body.orders.find((x: { id: string }) => x.id === o.id)
    expect(mine.code_required).toBe(true)
    expect(JSON.stringify(list.body)).not.toContain('"delivery_code"')
    expect(JSON.stringify(mine)).not.toContain('"' + o.secret + '"')
  } finally {
    await o.db.from('orders').delete().eq('id', o.id)
  }
})

test('a delivery needs the customer code, or a photo and a flag', async ({ page }) => {
  test.slow()
  const o = await parcel()
  const wrong = o.secret === '0000' ? '1111' : '0000'
  const row = async () => (await o.db.from('orders').select('status, proof_method, proof_flags, proof_reason, proof_distance_m, proof_lat').eq('id', o.id).single()).data!
  try {
    await courierSignIn(page, o.courierId)
    // No code, no photo: refused with instructions
    const none = await deliver(page, o, o.courierId)
    expect(none.status).toBe(400)
    expect(none.body.error).toMatch(/Ask the customer for the delivery code/)
    // A wrong code counts a try
    const bad = await deliver(page, o, o.courierId, { deliveryCode: wrong })
    expect(bad.status).toBe(400)
    expect(bad.body.error).toMatch(/wrong\. 4 tries left/)
    expect((await row()).status).toBe('picked_up')
    // Without a code, a fallback needs a photo
    expect((await deliver(page, o, o.courierId, { proofFallbackReason: 'no_phone' })).status).toBe(400)
    // The right code, from the door, proves delivery with no flags
    const good = await deliver(page, o, o.courierId, { deliveryCode: ' ' + o.secret + ' ', deliveryLat: PIN.lat + 0.0003, deliveryLng: PIN.lng })
    expect(good.status).toBe(200)
    expect(await row()).toMatchObject({ status: 'delivered', proof_method: 'code', proof_flags: [], proof_reason: null })
    expect((await row()).proof_distance_m).toBeLessThan(60)
  } finally {
    await o.db.from('orders').delete().eq('id', o.id)
  }
})

test('far from the address, no code, offline and locked deliveries are accepted only with their flags', async ({ page }) => {
  test.slow()
  const far = await parcel()
  const noCode = await parcel()
  const offline = await parcel()
  const locked = await parcel()
  const row = async (o: { db: Awaited<ReturnType<typeof parcel>>['db']; id: string }) => (await o.db.from('orders').select('status, proof_method, proof_flags, proof_reason').eq('id', o.id).single()).data!
  try {
    await courierSignIn(page, far.courierId)
    // Right code, but the courier is about 5 km from the pin
    expect((await deliver(page, far, far.courierId, { deliveryCode: far.secret, deliveryLat: PIN.lat + 0.05, deliveryLng: PIN.lng })).status).toBe(200)
    expect(await row(far)).toMatchObject({ status: 'delivered', proof_method: 'code', proof_flags: ['far_from_address'] })
    // The customer cannot show the code: a photo and a reason, flagged for review
    expect((await deliver(page, noCode, noCode.courierId, { proofFallbackReason: 'not_present', podPhoto: PHOTO, deliveryLat: PIN.lat, deliveryLng: PIN.lng })).status).toBe(200)
    expect(await row(noCode)).toMatchObject({ status: 'delivered', proof_method: 'fallback', proof_flags: ['no_code'], proof_reason: 'not_present' })
    // Saved offline with a code that could not be checked: accepted when it syncs, flagged
    expect((await deliver(page, offline, offline.courierId, { deliveryCode: offline.secret === '0000' ? '1111' : '0000', queuedAt: Date.now() - 60_000, deliveryLat: PIN.lat, deliveryLng: PIN.lng })).status).toBe(200)
    expect(await row(offline)).toMatchObject({ status: 'delivered', proof_method: 'fallback', proof_flags: ['unverified_code'] })
    // Five wrong codes lock it: even the right code is then refused, and the courier is told to use the photo
    const wrong = locked.secret === '0000' ? '1111' : '0000'
    for (let i = 0; i < 5; i++) expect((await deliver(page, locked, locked.courierId, { deliveryCode: wrong })).status).toBe(400)
    const refused = await deliver(page, locked, locked.courierId, { deliveryCode: locked.secret })
    expect(refused.status).toBe(400)
    expect(refused.body.error).toMatch(/Too many wrong codes/)
    expect((await deliver(page, locked, locked.courierId, { deliveryCode: locked.secret, proofFallbackReason: 'other', podPhoto: PHOTO, deliveryLat: PIN.lat, deliveryLng: PIN.lng })).status).toBe(200)
    expect(await row(locked)).toMatchObject({ proof_method: 'fallback', proof_flags: ['wrong_code'] })
  } finally {
    for (const o of [far, noCode, offline, locked]) await o.db.from('orders').delete().eq('id', o.id)
  }
})

test('the customer confirms or disputes a delivery from their own link, and a dispute is flagged', async ({ request }) => {
  test.slow()
  const yes = await parcel()
  const no = await parcel()
  try {
    for (const o of [yes, no]) await o.db.from('orders').update({ status: 'delivered', delivered_at: new Date().toISOString() }).eq('id', o.id)
    const page = await (await request.get('/track/' + yes.token)).text()
    expect(page).toContain('data-testid="received-card"')
    expect(page).not.toContain('data-testid="delivery-code-card"') // delivered: the code is no longer shown

    const post = (token: string, received: boolean, note?: string) => request.post('/api/orders/confirm', { data: { trackingToken: token, received, note } })
    expect((await post('LS-SHORT', true)).status()).toBe(400)
    expect((await post('a'.repeat(64), true)).status()).toBe(404)
    expect(await (await post(yes.token, true)).json()).toMatchObject({ success: true, result: 'confirmed' })
    expect(await (await post(yes.token, false, 'changed my mind')).json()).toMatchObject({ result: 'already' })
    expect((await yes.db.from('orders').select('customer_confirmed_at, proof_flags').eq('id', yes.id).single()).data).toMatchObject({ proof_flags: [] })

    expect(await (await post(no.token, false, 'Nobody came')).json()).toMatchObject({ result: 'disputed' })
    expect((await no.db.from('orders').select('proof_flags, customer_dispute_note, proof_reviewed_at').eq('id', no.id).single()).data).toMatchObject({ proof_flags: ['customer_disputed'], customer_dispute_note: 'Nobody came', proof_reviewed_at: null })
    expect(await (await request.get('/track/' + no.token)).text()).toContain('We told the delivery company')
  } finally {
    for (const o of [yes, no]) await o.db.from('orders').delete().eq('id', o.id)
  }
})

test('the courier screen asks for the customer code and explains what is wrong', async ({ page, context }) => {
  test.slow()
  await context.grantPermissions(['geolocation'])
  await context.setGeolocation({ latitude: PIN.lat, longitude: PIN.lng })
  const o = await parcel()
  const wrong = o.secret === '0000' ? '1111' : '0000'
  try {
    await courierSignIn(page, o.courierId)
    await page.getByPlaceholder('Search by customer, phone, code, area…').fill(o.code)
    await page.getByRole('button', { name: /Delivered & POD/ }).click()
    const box = page.getByTestId('delivery-code-box')
    await expect(box).toBeVisible()
    // The signature pad is gone for orders with a customer code
    await expect(page.getByText('Customer Signature (Digital POD)')).toHaveCount(0)
    const finish = page.getByRole('button', { name: /Complete Delivery & Collect Cash/ })

    // Nothing typed: a plain instruction, nothing sent
    await finish.click()
    await expect(page.getByTestId('proof-error')).toContainText('Ask the customer for their 4-digit delivery code')
    // A wrong code: the server's answer appears right there
    await page.getByLabel('Customer delivery code').fill(wrong)
    await finish.click()
    await expect(page.getByTestId('proof-error')).toContainText('wrong. 4 tries left')
    expect((await o.db.from('orders').select('status').eq('id', o.id).single()).data!.status).toBe('picked_up')
    // The customer cannot show the code: a photo is required first
    await page.getByLabel('Customer cannot show the code').check()
    await finish.click()
    await expect(page.getByTestId('proof-error')).toContainText('Take a photo')
    await page.getByLabel('Customer cannot show the code').uncheck()
    // The right code completes the delivery
    await page.getByLabel('Customer delivery code').fill(o.secret)
    await finish.click()
    await expect.poll(async () => (await o.db.from('orders').select('status, proof_method').eq('id', o.id).single()).data, { timeout: 20_000 }).toMatchObject({ status: 'delivered', proof_method: 'code' })
  } finally {
    await o.db.from('orders').delete().eq('id', o.id)
  }
})

test('the desk shows weak or disputed deliveries to review, and the owner marks them reviewed', async ({ page }) => {
  test.slow()
  const o = await parcel()
  try {
    await o.db.from('orders').update({
      status: 'delivered', delivered_at: new Date().toISOString(), proof_method: 'fallback', proof_flags: ['no_code', 'far_from_address'], proof_reason: 'not_present',
      proof_distance_m: 2400, customer_disputed_at: new Date().toISOString(), customer_dispute_note: 'Nobody came',
    }).eq('id', o.id)
    await signInOwner(page)
    await expect(page.getByTestId('proof-review-alert')).toContainText('deliveries to review')
    await page.goto('/orders/proof-review')
    const row = page.getByTestId('proof-row').filter({ hasText: o.code })
    await expect(row).toBeVisible()
    await expect(row).toContainText('could not show the delivery code')
    await expect(row).toContainText('far from the address')
    await expect(row).toContainText('2.4 km')
    await expect(row).toContainText('Nobody came')
    await row.getByRole('button', { name: 'Mark reviewed' }).click()
    await expect(row.getByText('Reviewed')).toBeVisible()
    expect((await o.db.from('orders').select('proof_reviewed_at').eq('id', o.id).single()).data!.proof_reviewed_at).not.toBeNull()
  } finally {
    await o.db.from('orders').delete().eq('id', o.id)
  }
})
