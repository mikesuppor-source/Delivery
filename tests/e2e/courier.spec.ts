import { test, expect } from 'playwright/test'
import { COURIER, apiCall, seeded, signInOwner } from './helpers'

test('a courier ID on its own opens nothing', async ({ page, request }) => {
  const { courierId } = await seeded()

  await page.goto('/driver/' + courierId)
  await expect(page).toHaveURL(/\/driver$/)

  const attempts = [
    request.get('/api/driver/orders?driverId=' + courierId),
    request.post('/api/driver/location', { data: { driverId: courierId, lat: 33.9, lng: 35.5 } }),
    request.post('/api/driver/push/subscribe', { data: { driverId: courierId, test: true } }),
    request.patch('/api/driver/orders', { data: { driverId: courierId, orderId: courierId, status: 'picked_up' } }),
  ]
  for (const response of await Promise.all(attempts)) expect(response.status()).toBe(401)
})

test('a courier signs in with phone and PIN and can only reach their own run sheet', async ({ page }) => {
  const { courierId, otherCourierId } = await seeded()

  await page.goto('/driver')
  await page.locator('input[type=tel]').fill(COURIER.phone)
  await page.locator('input[type=password]').fill(COURIER.pin)
  await page.locator('button[type=submit]').click()
  await expect(page).toHaveURL(new RegExp('/driver/' + courierId))

  expect(await page.evaluate(() => document.cookie)).not.toContain('cedar_driver_session')
  expect((await apiCall(page, '/api/driver/orders?driverId=' + courierId)).status).toBe(200)
  expect((await apiCall(page, '/api/driver/orders?driverId=' + otherCourierId)).status).toBe(401)
  expect((await apiCall(page, '/api/driver/location', 'POST', { driverId: otherCourierId, lat: 33.9, lng: 35.5 })).status).toBe(401)
})

test('wrong PINs are refused and repeated guesses are rate limited', async ({ request }) => {
  // A number nobody uses, so earlier runs in the same minute do not interfere
  const phone = '79' + String(Math.floor(Math.random() * 1e6)).padStart(6, '0')
  // The limit (5 per number) counts per calendar minute. If the guesses straddle a
  // minute boundary the count restarts once, so a block must come within 11 tries.
  const statuses: number[] = []
  for (let i = 0; i < 11 && !statuses.includes(429); i++) {
    statuses.push((await request.post('/api/driver/auth', { data: { phone, pin: String(500000 + i) } })).status())
  }
  expect(statuses.at(-1)).toBe(429)
  expect(statuses.slice(0, -1).every(s => s === 401)).toBe(true)
  expect(statuses.length).toBeGreaterThanOrEqual(6)
  expect((await request.post('/api/driver/auth', { data: { phone: '+961 70 222 333', pin: '1234' } })).status()).toBe(401)
})

test('resetting a PIN signs the courier out of every device', async ({ page, browser }) => {
  const { courierId, workspaceId } = await seeded()
  const login = await page.request.post('/api/driver/auth', { data: { phone: COURIER.phone, pin: COURIER.pin } })
  expect(login.status()).toBe(200)
  await page.goto('/driver/' + courierId)
  expect((await apiCall(page, '/api/driver/orders?driverId=' + courierId)).status).toBe(200)

  const dispatch = await browser.newContext()
  const owner = await dispatch.newPage()
  await signInOwner(owner)
  const reset = await apiCall(owner, '/api/drivers/' + courierId, 'PATCH', { workspaceId, resetPin: true })
  expect(reset.status).toBe(200)
  expect(reset.body.pin).toMatch(/^\d{6}$/)
  await dispatch.close()

  expect((await apiCall(page, '/api/driver/orders?driverId=' + courierId)).status).toBe(401)
  await page.goto('/driver/' + courierId)
  await expect(page).toHaveURL(/\/driver$/)
})
