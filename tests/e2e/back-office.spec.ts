import { test, expect } from 'playwright/test'
import { seeded, signInOwner } from './helpers'

// Statements and bulk import, driven through the real desk screens.

test('statements: record a shop payout with cents', async ({ page }) => {
  test.slow()
  const { db, shopId } = await seeded()
  const note = 'E2E payout ' + Math.random().toString(36).slice(2, 8)

  await signInOwner(page)
  await page.goto('/statements')
  await page.getByRole('button', { name: 'Record settlement' }).click()
  await expect(page.getByText('Record Cash Settlement')).toBeVisible()

  const field = (label: string) => page.locator('.field', { hasText: label })
  await field('Settlement Type').locator('select').selectOption('shop_payment')
  await field('Select Shop').locator('select').selectOption(shopId)
  await field('Amount (USD)').locator('input').fill('12.25')
  await field('Note / Receipt Reference').locator('input, textarea').first().fill(note)

  // Amounts with cents must not be blocked by the browser
  expect(await page.locator('form:has(button:has-text("Confirm Settlement")) :invalid').count()).toBe(0)
  await page.getByRole('button', { name: 'Confirm Settlement' }).click()

  await expect
    .poll(async () => (await db.from('settlements').select('amount_usd, type, shop_id').eq('note', note).maybeSingle()).data)
    .toMatchObject({ amount_usd: 12.25, type: 'shop_payment', shop_id: shopId })
})

test('bulk import: a CSV file becomes pending orders', async ({ page }) => {
  test.slow()
  const { db } = await seeded()
  const tag = 'Import ' + Math.random().toString(36).slice(2, 7)
  // Header names as in the import template (a bare "Name" column is read as a Shopify order number)
  const csv = [
    'Recipient Name,Phone,Address,City,Total,Notes',
    `${tag} One,+961 70 111 001,Hamra Street 1,Beirut,15.50,first`,
    `${tag} Two,+961 70 111 002,Mar Mikhael 2,Beirut,22,second`,
  ].join('\n')

  await signInOwner(page)
  await page.goto('/orders')
  await page.getByRole('button', { name: /Import CSV \/ Shopify/ }).click()
  await page.locator('input[type=file]').setInputFiles({ name: 'orders.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) })
  await expect(page.getByText(`${tag} One`)).toBeVisible()
  await page.getByRole('button', { name: 'Import 2 Orders into Cedar' }).click()

  await expect
    .poll(async () => (await db.from('orders').select('status, collection_usd').like('recipient_name', `${tag}%`)).data?.length)
    .toBe(2)
  const { data } = await db.from('orders').select('status, collection_usd, recipient_name').like('recipient_name', `${tag}%`).order('recipient_name')
  expect(data).toMatchObject([
    { status: 'pending', collection_usd: 15.5, recipient_name: `${tag} One` },
    { status: 'pending', collection_usd: 22, recipient_name: `${tag} Two` },
  ])
})
