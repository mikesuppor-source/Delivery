import { test, expect } from 'playwright/test'
import { creditShop, seeded, signInMerchant } from './helpers'

// The merchant portal, driven through its real forms.

test('merchant places an order through the portal form', async ({ page }) => {
  test.slow()
  const { db } = await seeded()
  const name = 'Portal Form ' + Math.random().toString(36).slice(2, 7)

  await signInMerchant(page)
  await page.getByRole('button', { name: /Make New Delivery Order/ }).click()
  await page.getByPlaceholder('e.g. Maya Haddad').fill(name)
  await page.getByPlaceholder('e.g. 70 123456 or +961 71 889900').fill('70 123 456')
  await page.getByPlaceholder(/Achrafieh, Sassine Square/).fill('Badaro, Beirut')
  await page.getByPlaceholder('0.00').first().fill('18.50')

  expect(await page.locator('form:has(button:has-text("Confirm & Generate Waybill Slip")) :invalid').count()).toBe(0)
  await page.getByRole('button', { name: 'Confirm & Generate Waybill Slip' }).click()

  await expect.poll(async () => (await db.from('orders').select('status').eq('recipient_name', name).maybeSingle()).data?.status).toBe('pending')
})

test('merchant requests a payout with cents through the portal', async ({ page }) => {
  test.slow()
  const { db, shopId } = await seeded()
  await creditShop(50) // comfortably above the request, whatever earlier runs left pending
  const account = 'Whish 70-' + Math.floor(Math.random() * 1e6)

  await signInMerchant(page)
  await page.getByRole('button', { name: /Request Payout \/ Cash-Out/ }).click()
  // Type straight away: the amount must not be replaced when the balance finishes loading
  await page.getByPlaceholder('Enter amount to withdraw').fill('12.25')
  await page.waitForTimeout(1500)
  await expect(page.getByPlaceholder('Enter amount to withdraw')).toHaveValue('12.25')
  await page.getByPlaceholder(/Whish Phone 70-123456/).fill(account)
  await page.getByRole('button', { name: 'Submit Cash-Out Request' }).click()

  await expect
    .poll(async () => (await db.from('cashout_requests').select('amount_usd, status, shop_id').eq('account_details', account).maybeSingle()).data)
    .toMatchObject({ amount_usd: 12.25, status: 'pending', shop_id: shopId })
})
