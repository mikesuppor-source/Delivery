import { test, expect, type Page } from 'playwright/test'
import { signInMerchant } from './helpers'

const TABS = ['Orders', 'Connect Store', 'API Guide']

/** Every menu link must sit inside the top bar (not above or below it) and the page must not scroll sideways. */
async function expectCleanHeader(page: Page) {
  const header = page.locator('header').first()
  const bar = (await header.boundingBox())!
  const menu = page.getByRole('navigation', { name: 'Shop menu' })
  for (const label of TABS) {
    const link = menu.getByRole('link', { name: label })
    await expect(link).toBeVisible()
    const box = (await link.boundingBox())!
    expect(box.y, label + ' is above the top bar').toBeGreaterThanOrEqual(bar.y - 1)
    expect(box.y + box.height, label + ' is below the top bar').toBeLessThanOrEqual(bar.y + bar.height + 1)
  }
  const sideways = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(sideways).toBeLessThanOrEqual(0)
}

test('the shop portal top bar is tidy on a desktop screen', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await signInMerchant(page)
  await expectCleanHeader(page)
  const menu = page.getByRole('navigation', { name: 'Shop menu' })
  await expect(menu.getByRole('link', { name: 'Orders' })).toHaveAttribute('aria-current', 'page')
  await expect(page.getByText('Daily Desk Rate')).toBeVisible()
  expect(await page.getByText('Daily Desk Rate').textContent()).not.toContain('$$')

  await menu.getByRole('link', { name: 'Connect Store' }).click()
  // Generous wait: a fresh dev server compiles the page on its first visit
  await expect(page).toHaveURL(/\/portal\/integrations$/, { timeout: 30_000 })
  await expectCleanHeader(page)
  await expect(page.getByRole('navigation', { name: 'Shop menu' }).getByRole('link', { name: 'Connect Store' })).toHaveAttribute('aria-current', 'page')
})

test('the shop portal top bar fits a phone screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 })
  await signInMerchant(page)
  const header = page.locator('header').first()
  expect((await header.boundingBox())!.width).toBeLessThanOrEqual(390)
  const sideways = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(sideways).toBeLessThanOrEqual(0)
  // The menu is one row that can be swiped, and its links are inside the top bar
  const menu = page.getByRole('navigation', { name: 'Shop menu' })
  const bar = (await header.boundingBox())!
  for (const label of TABS) {
    const link = menu.getByRole('link', { name: label })
    const box = (await link.boundingBox())!
    expect(box.y).toBeGreaterThanOrEqual(bar.y - 1)
    expect(box.y + box.height).toBeLessThanOrEqual(bar.y + bar.height + 1)
  }
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible()
})
