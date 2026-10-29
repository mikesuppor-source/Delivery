import { test, expect } from 'playwright/test'
import { seeded, signInOwner } from './helpers'

// The finance screens switch to Arabic and run right to left when the language toggle is set to Arabic.
// Which sentences have an Arabic line is checked in tests/i18n-finance.test.ts; this checks they reach the screen.
test.describe('Finance screens in Arabic', () => {
  test('Shop Payouts, Courier Pay and Expenses are in Arabic and right to left', async ({ page }) => {
    test.slow()
    await page.addInitScript(() => {
      try { localStorage.setItem('cedar_locale', 'ar') } catch { /* private window: the test then fails visibly below */ }
    })
    await signInOwner(page)

    await page.goto('/finance/payouts')
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
    await expect(page.locator('h1')).toHaveText('دفعات المتاجر')
    await expect(page.getByText('المتاجر الجاهزة للدفع')).toBeVisible()
    await expect(page.getByText('Shops ready to pay')).toHaveCount(0)

    await page.goto('/finance/courier-pay')
    await expect(page.locator('h1')).toHaveText('أجور السائقين')
    await page.getByRole('tab', { name: /المكافآت/ }).click()
    await expect(page.getByText('قواعد المكافآت')).toBeVisible()

    await page.goto('/finance/expenses')
    await expect(page.locator('h1')).toHaveText('المصروفات')
    await page.getByRole('button', { name: 'إضافة مصروف' }).first().click()
    await expect(page.getByText('صورة أو ملف PDF بحجم أقصاه 2.5 ميغابايت. اختياري.')).toBeVisible()
    await expect(page.getByText('A photo or a PDF, up to 2.5 MB. Optional.')).toHaveCount(0)
  })

  test('the shop page offers the statement in English and in Arabic', async ({ page }) => {
    const { shopId } = await seeded()
    await signInOwner(page)
    await page.goto(`/shops/${shopId}`)
    await page.getByText('Printable Statement').first().click()
    await expect(page.getByRole('link', { name: 'Download PDF statement' })).toHaveAttribute('href', /format=pdf$/)
    await expect(page.getByRole('link', { name: 'Download in Arabic (عربي)' })).toHaveAttribute('href', /format=pdf&lang=ar$/)
  })
})
