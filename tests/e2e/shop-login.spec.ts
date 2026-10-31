import { test, expect, type Page } from 'playwright/test'
import { apiCall, seeded, signInOwner, signInMerchant } from './helpers'

const PASSWORD = 'ShopLogin-2026-x'

async function newShop(name: string) {
  const { db, workspaceId } = await seeded()
  const { data, error } = await db.from('shops').insert({ workspace_id: workspaceId, name, prefix: 'SL', phone: '+961 71 000 111' }).select('id').single()
  if (error || !data) throw new Error('Could not create shop: ' + error?.message)
  return { db, id: data.id }
}

async function openLoginModal(page: Page, shopId: string, button: string) {
  await page.goto('/shops/' + shopId)
  await page.getByRole('button', { name: button }).click()
}

test('the desk gives a shop a login, and the shop sets a password and signs in', async ({ page, browser, request }) => {
  test.slow()
  const stamp = Math.random().toString(36).slice(2, 8)
  const name = 'Login Test Shop ' + stamp
  const email = `shoplogin-${stamp}@cedar.test`
  const { db, id } = await newShop(name)
  try {
    await signInOwner(page)
    await openLoginModal(page, id, 'Give this shop a login')
    await page.getByLabel('Shop email').fill(email)
    await page.getByRole('button', { name: 'Create login' }).click()
    const link = await page.getByTestId('login-link').inputValue()
    expect(link).toContain('/auth/v1/verify')
    await expect(page.getByTestId('login-created')).toContainText(email)

    // The shop is linked to the new login, which can already sign in once it has a password
    const { data: shop } = await db.from('shops').select('user_id').eq('id', id).single()
    expect(shop!.user_id).toBeTruthy()
    const { data: user } = await db.auth.admin.getUserById(shop!.user_id!)
    expect(user.user?.email).toBe(email)
    expect(user.user?.user_metadata?.role).toBe('merchant')

    // The shop opens the link, chooses a password, then signs in and lands in its own portal
    const verified = await request.get(link, { maxRedirects: 0 })
    expect(verified.status()).toBeGreaterThanOrEqual(300)
    const hash = new URL(verified.headers()['location']).hash
    expect(hash).toContain('access_token=')
    const shopContext = await browser.newContext()
    const shopPage = await shopContext.newPage()
    await shopPage.goto('http://localhost:3000/reset-password' + hash)
    await shopPage.locator('input[type=password]').first().fill(PASSWORD)
    await shopPage.locator('input[type=password]').nth(1).fill(PASSWORD)
    await shopPage.locator('button[type=submit]').click()
    // The link already signed the shop in, so it goes straight to its own portal
    await expect(shopPage).toHaveURL(/\/portal$/, { timeout: 30_000 })
    await expect(shopPage.getByText(name).first()).toBeVisible()
    await shopContext.close()

    // Later, a fresh browser signs in with the email and the chosen password
    const laterContext = await browser.newContext()
    const laterPage = await laterContext.newPage()
    await laterPage.goto('http://localhost:3000/login')
    await laterPage.locator('input[type=email]').fill(email)
    await laterPage.locator('input[type=password]').fill(PASSWORD)
    await laterPage.locator('button[type=submit]').click()
    await expect(laterPage).toHaveURL(/\/portal$/, { timeout: 30_000 })
    await expect(laterPage.getByText(name).first()).toBeVisible()
    await laterContext.close()

    // From now on the button offers a new password link instead
    await openLoginModal(page, id, 'New password link')
    await page.getByRole('button', { name: 'Make new link' }).click()
    await expect(page.getByTestId('login-created')).toContainText(email)
    expect(await page.getByTestId('login-link').inputValue()).not.toBe(link)

    // A second login for the same shop, an email that already has an account, and staff logins are refused
    const again = await apiCall(page, `/api/shops/${id}/login`, 'POST', { action: 'create', email: `second-${stamp}@cedar.test` })
    expect(again.status).toBe(409)
    const other = await newShop(name + ' B')
    try {
      const taken = await apiCall(page, `/api/shops/${other.id}/login`, 'POST', { action: 'create', email })
      expect(taken.status).toBe(409)
      expect((await other.db.from('shops').select('user_id').eq('id', other.id).single()).data!.user_id).toBeNull()
      const bad = await apiCall(page, `/api/shops/${other.id}/login`, 'POST', { action: 'create', email: 'not-an-email' })
      expect(bad.status).toBe(400)
      const { data: owner } = await db.auth.admin.listUsers()
      const ownerId = owner.users.find(u => u.email === 'owner@cedar.test')!.id
      await other.db.from('shops').update({ user_id: ownerId }).eq('id', other.id)
      const staff = await apiCall(page, `/api/shops/${other.id}/login`, 'POST', { action: 'link' })
      expect(staff.status).toBe(403)
    } finally {
      await other.db.from('shops').delete().eq('id', other.id)
    }
  } finally {
    const { data: row } = await db.from('shops').select('user_id').eq('id', id).maybeSingle()
    await db.from('shops').delete().eq('id', id)
    if (row?.user_id) await db.auth.admin.deleteUser(row.user_id)
  }
})

test('a shop login cannot make logins for shops', async ({ page }) => {
  const { shopId } = await seeded()
  await signInMerchant(page)
  const made = await apiCall(page, `/api/shops/${shopId}/login`, 'POST', { action: 'link' })
  expect(made.status).toBe(403)
  await page.context().clearCookies()
  const anon = await page.request.post(`/api/shops/${shopId}/login`, { data: { action: 'link' } })
  expect(anon.status()).toBe(401)
})
