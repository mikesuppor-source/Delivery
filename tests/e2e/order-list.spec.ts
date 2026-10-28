import { test, expect, type Page } from 'playwright/test'
import { seeded, signInOwner } from './helpers'

// Exercises the desk order list screen itself, so refactors of its UI are covered.

async function probeOrder(code: string, fields: Record<string, unknown> = {}) {
  const { db, workspaceId, shopId, areaId } = await seeded()
  const { data, error } = await db
    .from('orders')
    .insert({
      workspace_id: workspaceId, shop_id: shopId, area_id: areaId, code, status: 'pending', usd_to_lbp_rate: 89500,
      collection_usd: 20, delivery_fee_usd: 3, driver_pay_usd: 2, recipient_name: 'List Probe', recipient_phone: '+961 3 222 111',
      recipient_address: 'Verdun, Beirut', ...fields,
    })
    .select('id')
    .single()
  expect(error).toBeNull()
  return data!.id as string
}

const newCode = (prefix: string) => prefix + Math.random().toString(36).slice(2, 7).toUpperCase()
const row = (page: Page, code: string) => page.locator('tr', { hasText: code })

async function statusOf(code: string) {
  const { db } = await seeded()
  const { data } = await db.from('orders').select('status, driver_id, notes').eq('code', code).single()
  return data!
}

test('order list: tabs, timeframe, inline courier and status, edit, bulk action, CSV', async ({ page }) => {
  test.slow()
  const { courierId } = await seeded()
  const code = newCode('LS-OL')
  await probeOrder(code)

  await signInOwner(page)
  await page.goto('/orders')
  await expect(page.getByRole('heading', { name: 'Orders' })).toBeVisible({ timeout: 30_000 })
  await expect(row(page, code)).toBeVisible()

  // Status tabs and timeframe filters
  await page.getByRole('button', { name: /^Delivered \(/ }).click()
  await expect(row(page, code)).toHaveCount(0)
  await page.getByRole('button', { name: /^Pending \(/ }).click()
  await expect(row(page, code)).toBeVisible()
  await page.getByRole('button', { name: 'Last Year' }).click()
  await expect(row(page, code)).toHaveCount(0)
  await page.getByRole('button', { name: 'Reset to All Time' }).click()
  await expect(row(page, code)).toBeVisible()
  await page.getByRole('button', { name: /^All \(/ }).click()

  // Assign a courier from the row
  await row(page, code).locator('select[title="Assign driver now"]').selectOption({ label: 'Rami Courier' })
  await expect.poll(async () => (await statusOf(code)).driver_id).toBe(courierId)
  expect((await statusOf(code)).status).toBe('assigned')

  // Change status from the row
  await row(page, code).locator('select.badge').selectOption('picked_up')
  await expect.poll(async () => (await statusOf(code)).status).toBe('picked_up')

  // Edit dialog saves notes
  await row(page, code).getByRole('button', { name: 'Edit' }).click()
  await expect(page.getByText(`Edit Order #${code}`)).toBeVisible()
  await page.locator('label', { hasText: 'Notes / Instructions' }).locator('xpath=..').locator('textarea, input').first().fill('Call before arriving')
  // Nothing in the form may block saving (the default 1 kg weight once did)
  expect(await page.locator('form:has(button:has-text("Save Changes")) :invalid').count()).toBe(0)
  await page.getByRole('button', { name: 'Save Changes' }).click()
  await expect(page.getByText(`Edit Order #${code}`)).toHaveCount(0)
  await expect.poll(async () => (await statusOf(code)).notes).toBe('Call before arriving')

  // Bulk action on a selected row
  await row(page, code).locator('input[type=checkbox]').check()
  await expect(page.getByText('1 Orders Selected')).toBeVisible()
  await page.getByRole('button', { name: 'Mark Returned' }).click()
  await expect.poll(async () => (await statusOf(code)).status).toBe('returned')

  // CSV export downloads a file
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export CSV' }).click()
  expect((await download).suggestedFilename()).toMatch(/^cedar_orders_export_\d{4}-\d{2}-\d{2}\.csv$/)
})

test('order list: delivering an order without a courier asks for one first', async ({ page }) => {
  test.slow()
  const { courierId } = await seeded()
  const code = newCode('LS-DR')
  await probeOrder(code)

  await signInOwner(page)
  await page.goto('/orders')
  await expect(row(page, code)).toBeVisible({ timeout: 30_000 })

  await row(page, code).locator('select.badge').selectOption('delivered')
  await expect(page.getByText('Driver Assignment Required')).toBeVisible()
  await page.locator('select[required]').filter({ has: page.locator('option', { hasText: '-- Choose Driver --' }) }).selectOption(courierId)
  await page.getByRole('button', { name: 'Assign Courier & Update Status' }).click()
  await expect.poll(async () => (await statusOf(code)).status).toBe('delivered')
  expect((await statusOf(code)).driver_id).toBe(courierId)
})
