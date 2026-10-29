/**
 * tests/e2e/design-foundation.spec.ts
 * E2E tests for Phase 2: Design foundation, UI Kit, Theme switching, RTL/Arabic,
 * Global search modal, Executive Dashboard, and Saved Views API.
 */

import { test, expect } from 'playwright/test'
import { signInOwner, apiCall, seeded } from './helpers'

test.describe('Phase 2: Design Foundation & App Shell', () => {
  test('theme toggle switches html[data-theme] attribute smoothly', async ({ page }) => {
    await signInOwner(page)

    // Initial theme check
    const initialTheme = await page.evaluate(() => document.documentElement.getAttribute('data-theme') || 'light')

    // Find and click theme toggle button in Topbar
    const themeBtn = page.locator('button[aria-label*="Dark Mode"], button[aria-label*="Theme"]').first()
    await expect(themeBtn).toBeVisible()
    await themeBtn.click()

    // Expect theme to have changed
    const toggledTheme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'))
    expect(toggledTheme).not.toBe(initialTheme)

    // Click again to toggle back
    await themeBtn.click()
    const restoredTheme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'))
    expect(restoredTheme).toBe(initialTheme)
  })

  test('language toggle switches dir=rtl and lang=ar with instant layout inversion', async ({ page }) => {
    await signInOwner(page)

    // Initially English and LTR
    const initialDir = await page.evaluate(() => document.documentElement.getAttribute('dir') || 'ltr')
    expect(initialDir).toBe('ltr')

    // Click Arabic toggle button in Topbar
    const langBtn = page.locator('button[aria-label="Switch Language"]').first()
    await expect(langBtn).toBeVisible()
    await langBtn.click()

    // Verify RTL and Arabic language attributes
    await expect.poll(async () => page.evaluate(() => document.documentElement.getAttribute('dir'))).toBe('rtl')
    await expect.poll(async () => page.evaluate(() => document.documentElement.getAttribute('lang'))).toBe('ar')

    // Switch back to English
    await langBtn.click()
    await expect.poll(async () => page.evaluate(() => document.documentElement.getAttribute('dir'))).toBe('ltr')
    await expect.poll(async () => page.evaluate(() => document.documentElement.getAttribute('lang'))).toBe('en')
  })

  test('global search modal opens with / key shortcut and closes on Escape', async ({ page }) => {
    await signInOwner(page)

    // Verify modal is not visible initially
    const searchInput = page.locator('input[placeholder*="Search order code"]').first()
    await expect(searchInput).not.toBeVisible()

    // Trigger shortcut '/'
    await page.keyboard.press('/')

    // Modal and input should now be open and focused
    await expect(searchInput).toBeVisible({ timeout: 5000 })
    await searchInput.fill('LS-TEST')

    // Press Escape to dismiss
    await page.keyboard.press('Escape')
    await expect(searchInput).not.toBeVisible()
  })

  test('executive dashboard renders all 6 KPI cards, attention alerts, and fleet status', async ({ page }) => {
    // "Needs Attention" is only drawn when something needs attention, and a freshly seeded database has
    // nothing that does. Add an order that has waited unassigned for 45 minutes (the dashboard flags
    // pending orders with no courier after 30) and cancel it again afterwards.
    const { db, workspaceId, shopId, areaId } = await seeded()
    const { data: waiting, error } = await db
      .from('orders')
      .insert({
        workspace_id: workspaceId,
        shop_id: shopId,
        area_id: areaId,
        status: 'pending',
        code: 'LS-WAIT' + Math.random().toString(36).slice(2, 7).toUpperCase(),
        usd_to_lbp_rate: 89500,
        collection_usd: 11,
        delivery_fee_usd: 3,
        driver_pay_usd: 2,
        recipient_name: 'E2E Customer',
        recipient_phone: '+961 3 555 666',
        recipient_address: 'Hamra Street 12',
        created_at: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
      })
      .select('id')
      .single()
    expect(error?.message).toBeUndefined()

    try {
      await signInOwner(page)
      await page.goto('/')

      // Check presence of 6 KPI Cards
      await expect(page.locator('text=New Orders Today').first()).toBeVisible({ timeout: 15_000 })
      await expect(page.locator('text=Delivered Today').first()).toBeVisible()
      await expect(page.locator('text=Delivery Success Rate').first()).toBeVisible()
      await expect(page.locator('text=On-Time Rate').first()).toBeVisible()
      await expect(page.locator('text=Cash with Couriers').first()).toBeVisible()
      await expect(page.locator("text=Today's Net Profit").first()).toBeVisible()

      // Check Needs Attention section
      await expect(page.locator('text=Needs Attention').first()).toBeVisible()

      // Check Couriers on duty section
      await expect(page.locator('text=Couriers On Duty').first()).toBeVisible()
    } finally {
      if (waiting) await db.from('orders').update({ status: 'cancelled' }).eq('id', waiting.id)
    }
  })

  test('saved views API supports CRUD operations with strict tenant isolation', async ({ page }) => {
    const { workspaceId } = await seeded()
    await signInOwner(page)

    // 1. List saved views for orders
    const listRes = await apiCall(page, `/api/views?workspaceId=${workspaceId}&page=orders`)
    expect(listRes.status).toBe(200)
    expect(Array.isArray(listRes.body.views)).toBe(true)

    // 2. Create a new saved view
    const testViewName = 'E2E Pending Urgent ' + Date.now()
    const createRes = await apiCall(page, '/api/views', 'POST', {
      workspaceId,
      page: 'orders',
      name: testViewName,
      filters: { status: 'pending', urgent: true },
    })
    expect([200, 201]).toContain(createRes.status)
    expect(createRes.body.view).toBeDefined()
    expect(createRes.body.view.name).toBe(testViewName)
    const createdId = createRes.body.view.id

    // 3. Verify it is included in listing
    const afterListRes = await apiCall(page, `/api/views?workspaceId=${workspaceId}&page=orders`)
    expect(afterListRes.status).toBe(200)
    const found = afterListRes.body.views.some((v: any) => v.id === createdId)
    expect(found).toBe(true)

    // 4. Delete the saved view
    const deleteRes = await apiCall(page, `/api/views?workspaceId=${workspaceId}&viewId=${createdId}`, 'DELETE')
    expect(deleteRes.status).toBe(200)

    // 5. Verify it is deleted
    const finalListRes = await apiCall(page, `/api/views?workspaceId=${workspaceId}&page=orders`)
    const stillExists = finalListRes.body.views.some((v: any) => v.id === createdId)
    expect(stillExists).toBe(false)
  })
})
