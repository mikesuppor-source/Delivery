import { test, expect } from 'playwright/test'
import { COURIER, seeded } from './helpers'

// Exercises the courier run sheet screen itself, so refactors of its UI are covered.
test('courier run sheet: search, pick up, tabs, language, shift handover, exit', async ({ page }) => {
  test.slow() // first visit compiles the run sheet in dev mode
  const { db, workspaceId, shopId, areaId, courierId } = await seeded()
  const code = 'LS-RS' + Math.random().toString(36).slice(2, 7).toUpperCase()
  const { error } = await db.from('orders').insert({
    workspace_id: workspaceId, shop_id: shopId, area_id: areaId, driver_id: courierId, code, status: 'assigned',
    usd_to_lbp_rate: 89500, collection_usd: 15, delivery_fee_usd: 3, driver_pay_usd: 2,
    recipient_name: 'Run Sheet Probe', recipient_phone: '+961 3 444 555', recipient_address: 'Badaro, Beirut',
  })
  expect(error).toBeNull()

  expect((await page.request.post('/api/driver/auth', { data: { phone: COURIER.phone, pin: COURIER.pin } })).status()).toBe(200)
  await page.goto('/driver/' + courierId)
  await expect(page.getByText('Rami Courier')).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText('Courier Active')).toBeVisible()

  // Search narrows the list to the probe order
  const search = page.getByPlaceholder('Search by customer, phone, code, area…')
  await search.fill(code)
  await expect(page.getByText(code).first()).toBeVisible()
  await expect(page.getByRole('button', { name: 'Pick Up from Store' })).toHaveCount(1)

  // Picking up moves the order to the next step
  await page.getByRole('button', { name: 'Pick Up from Store' }).click()
  await expect(page.getByRole('button', { name: /Delivered & POD/ })).toBeVisible({ timeout: 20_000 })
  const { data: picked } = await db.from('orders').select('status').eq('code', code).single()
  expect(picked?.status).toBe('picked_up')

  // A search with no match shows the empty state
  await search.fill('no-such-order-zzz')
  await expect(page.getByText('No orders found matching your filter.')).toBeVisible()
  await search.fill(code)

  // The Delivered tab does not list an order that is only picked up
  await page.getByRole('button', { name: /^Delivered \(/ }).click()
  await expect(page.getByText(code)).toHaveCount(0)
  await page.getByRole('button', { name: /^To Deliver \(/ }).click()
  await expect(page.getByText(code).first()).toBeVisible()

  // Arabic switches the layout to right-to-left and back
  const languageSwitch = page.getByTitle('Switch Language / تغيير اللغة')
  await languageSwitch.click()
  await expect(page.locator('div[dir="rtl"]').first()).toBeVisible()
  await expect(page.getByText(/قيد التوصيل/).first()).toBeVisible()
  await languageSwitch.click()
  await expect(page.locator('div[dir="ltr"]').first()).toBeVisible()

  // Shift handover summary opens
  await page.getByRole('button', { name: /Shift Handover/ }).click()
  await expect(page.getByText('End-of-Day Shift Handover')).toBeVisible()
  await page.keyboard.press('Escape')
  await page.goto('/driver/' + courierId)

  // Exit signs the courier out
  await page.getByRole('button', { name: 'Exit' }).click()
  await expect(page).toHaveURL(/\/driver$/)
  await page.goto('/driver/' + courierId)
  await expect(page).toHaveURL(/\/driver$/)
})
