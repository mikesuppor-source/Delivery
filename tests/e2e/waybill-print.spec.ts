import { test, expect } from 'playwright/test'
import { seeded, signInOwner } from './helpers'

// The waybill window on the desk orders list sits on top of the list. The browser's own print would print the
// whole page behind it, so the window's Print button opens the print page for that order, which holds only the receipt.
type Counter = { printCalls: number }

test('the desk waybill window prints only the receipt, not the orders list behind it', async ({ page, context }) => {
  test.slow()
  const { db, workspaceId, shopId, areaId } = await seeded()
  const code = 'LS-WB' + Math.random().toString(36).slice(2, 7).toUpperCase()
  const { error } = await db.from('orders').insert({
    workspace_id: workspaceId, shop_id: shopId, area_id: areaId, code, status: 'pending', usd_to_lbp_rate: 89500,
    collection_usd: 40, delivery_fee_usd: 3, driver_pay_usd: 2, recipient_name: 'Waybill Customer', recipient_phone: '+961 3 777 888',
    recipient_address: 'Hamra Street 7',
  })
  expect(error).toBeNull()

  // Count print requests instead of opening the browser's print dialog
  await context.addInitScript(() => {
    const counter = window as unknown as Counter
    counter.printCalls = 0
    window.print = () => { counter.printCalls++ }
  })

  await signInOwner(page)
  await page.goto('/orders')
  await expect(page.getByRole('heading', { name: 'Orders' })).toBeVisible({ timeout: 30_000 })
  await page.locator('tr', { hasText: code }).getByRole('button', { name: 'Slip' }).click()

  const windowOverList = page.getByRole('dialog', { name: /Waybill Receipt/ })
  await expect(windowOverList).toBeVisible()
  const printLink = windowOverList.getByRole('link', { name: /Print Receipt/ })
  await expect(printLink).toHaveAttribute('href', `/print/order/${code}?print=true`)
  await expect(printLink).toHaveAttribute('target', '_blank')

  // It opens the print page, which holds the receipt and nothing else, and asks the browser to print that page
  const [printPage] = await Promise.all([context.waitForEvent('page'), printLink.click()])
  await expect(printPage).toHaveURL(new RegExp(`/print/order/${code}\\?print=true$`), { timeout: 30_000 })
  await expect(printPage.locator('.printable-receipt-area')).toContainText(code)
  await expect(printPage.getByRole('heading', { name: 'Orders' })).toHaveCount(0)
  await expect(printPage.getByRole('button', { name: 'Last Year' })).toHaveCount(0)
  await expect.poll(() => printPage.evaluate(() => (window as unknown as Counter).printCalls)).toBe(1)

  // The orders page itself was not printed
  expect(await page.evaluate(() => (window as unknown as Counter).printCalls)).toBe(0)
})
