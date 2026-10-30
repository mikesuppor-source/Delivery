import { test, expect } from 'playwright/test'
import { COURIER, apiCall, seeded, signInOwner } from './helpers'

// When dispatch blocks a courier or issues a new PIN, the courier's open screen must stop working at once:
// it signs itself out and says why, instead of going on showing saved orders.

async function openRunSheet(page: import('playwright/test').Page, courierId: string) {
  const login = await page.request.post('/api/driver/auth', { data: { phone: COURIER.phone, pin: COURIER.pin } })
  expect(login.status()).toBe(200)
  await page.goto('/driver/' + courierId)
  await expect(page).toHaveURL(new RegExp('/driver/' + courierId))
  expect((await apiCall(page, '/api/driver/orders?driverId=' + courierId)).status).toBe(200)
}

test('blocking a courier signs their open screen out, and unblocking does not bring the old session back', async ({ page, browser }) => {
  test.slow()
  const { courierId, workspaceId } = await seeded()
  await openRunSheet(page, courierId)

  const dispatch = await browser.newContext()
  const owner = await dispatch.newPage()
  await signInOwner(owner)
  const set = (active: boolean) => apiCall(owner, '/api/drivers/' + courierId, 'PATCH', { workspaceId, active })
  try {
    expect((await set(false)).status).toBe(200)
    // The open screen notices within seconds and goes back to sign-in with an explanation
    await expect(page).toHaveURL(/\/driver\?ended=blocked$/, { timeout: 30_000 })
    await expect(page.getByText(/ended by dispatch/i)).toBeVisible()
    expect((await apiCall(page, '/api/driver/orders?driverId=' + courierId)).status).toBe(403)
    // Unblocked again, the old session stays dead: the courier has to sign in afresh
    expect((await set(true)).status).toBe(200)
    expect((await apiCall(page, '/api/driver/orders?driverId=' + courierId)).status).toBe(401)
  } finally {
    await set(true)
    await dispatch.close()
  }
})

test('a new PIN signs the open courier screen out with an explanation', async ({ page, browser }) => {
  test.slow()
  const { courierId, workspaceId } = await seeded()
  await openRunSheet(page, courierId)

  const dispatch = await browser.newContext()
  const owner = await dispatch.newPage()
  await signInOwner(owner)
  expect((await apiCall(owner, '/api/drivers/' + courierId, 'PATCH', { workspaceId, resetPin: true })).status).toBe(200)
  await dispatch.close()

  await expect(page).toHaveURL(/\/driver\?ended=session$/, { timeout: 30_000 })
  await expect(page.getByText(/signed out/i)).toBeVisible()
})

test('the courier profile has a Block button that blocks and unblocks', async ({ page }) => {
  test.slow()
  const { courierId } = await seeded()
  await signInOwner(page)
  await page.goto('/drivers/' + courierId)
  page.on('dialog', dialog => dialog.accept())

  await page.getByRole('button', { name: 'Block courier' }).click()
  await expect(page.getByRole('button', { name: 'Unblock courier' })).toBeVisible({ timeout: 30_000 })
  await page.getByRole('button', { name: 'Unblock courier' }).click()
  await expect(page.getByRole('button', { name: 'Block courier' })).toBeVisible({ timeout: 30_000 })
})
