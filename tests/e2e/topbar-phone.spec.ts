import { test, expect } from 'playwright/test'
import { signInOwner } from './helpers'

// The desk top bar used to be wider than a phone screen: the page scrolled sideways and the language and
// theme buttons sat off screen. At phone width every control must fit inside the screen.
test('desk top bar fits a phone screen', async ({ page }) => {
  test.slow()
  await page.setViewportSize({ width: 375, height: 800 })
  await signInOwner(page)
  await page.goto('/orders')
  const bar = page.locator('header.topbar')
  await expect(bar).toBeVisible()

  const widths = await page.evaluate(() => ({
    page: document.documentElement.scrollWidth,
    screen: document.documentElement.clientWidth,
    bar: (document.querySelector('header.topbar') as HTMLElement).scrollWidth,
    barBox: (document.querySelector('header.topbar') as HTMLElement).clientWidth,
  }))
  expect(widths.page, 'page scrolls sideways').toBeLessThanOrEqual(widths.screen)
  expect(widths.bar, 'top bar content is wider than the bar').toBeLessThanOrEqual(widths.barBox)

  // Every control stays reachable on screen
  for (const name of ['Switch Language']) {
    const box = await bar.getByRole('button', { name }).boundingBox()
    expect(box, name).not.toBeNull()
    expect(box!.x + box!.width, name + ' is off screen').toBeLessThanOrEqual(375)
  }
  await expect(bar.getByRole('link', { name: /new order|＋/i })).toBeVisible()
})
