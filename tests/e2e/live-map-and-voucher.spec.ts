import { randomUUID } from 'node:crypto'
import { test, expect } from 'playwright/test'
import { creditShop, seeded, signInOwner } from './helpers'

type Printable = { printCalls: number }

test.describe('Live map and the shift handover voucher', () => {
  test('the live map has a real size and a courier list, and shows customer text as plain text', async ({ page }) => {
    test.slow()
    const { db, workspaceId, courierId, shopId, areaId } = await seeded()
    await db.from('drivers').update({ current_lat: 33.8938, current_lng: 35.5018, last_location_at: new Date().toISOString() }).eq('id', courierId)

    // A stop whose customer details are written to run code, if the map ever treats them as HTML
    const { data: order, error } = await db.from('orders').insert({
      workspace_id: workspaceId, shop_id: shopId, area_id: areaId, driver_id: courierId,
      code: 'LS-MAP' + Math.random().toString(36).slice(2, 7).toUpperCase(), status: 'assigned',
      usd_to_lbp_rate: 89500, collection_usd: 25, delivery_fee_usd: 3, driver_pay_usd: 2,
      recipient_name: `<img src=x onerror="document.title='XSS-RAN'">`, recipient_phone: '+961 3 555 666', recipient_address: '"><u>underlined</u>',
      location_lat: 33.9, location_lng: 35.52,
    }).select('id').single()
    if (error || !order) throw new Error('Could not create order: ' + error?.message)

    try {
      await signInOwner(page)
      await page.goto('/map')
      await expect(page.locator('h1')).toContainText('Live Courier Map')

      // The map was once squeezed to nothing because the page had lost its styles
      const canvas = page.locator('.leaflet-container')
      await expect(canvas).toBeVisible()
      const box = await canvas.boundingBox()
      expect(box?.width).toBeGreaterThan(300)
      expect(box?.height).toBeGreaterThan(300)

      // It says how many couriers are on the map, and why one is missing
      await expect(page.getByText(/\d+ of \d+ couriers? ha(s|ve) a GPS position on the map/)).toBeVisible()
      await expect(page.locator('.custom-driver-pin').first()).toContainText('Rami Courier')

      // Picking a courier draws their stops; the customer's text is shown as text and never runs
      await page.getByRole('complementary', { name: 'Couriers' }).getByRole('button', { name: /Rami Courier/ }).click()
      await page.locator('.custom-stop-pin').first().click()
      const popup = page.locator('.leaflet-popup-content')
      await expect(popup).toContainText('underlined')
      await expect(popup).toContainText('<img src=x')
      await expect(popup.locator('img, u')).toHaveCount(0)
      await expect(page).not.toHaveTitle(/XSS-RAN/)
    } finally {
      // Orders can only be cancelled while pending, so finish this one the way a real delivery ends
      for (const status of ['picked_up', 'delivered'] as const) await db.from('orders').update({ status }).eq('id', order.id)
    }
  })

  test('closing a shift opens the handover voucher with the cash handed in, ready to print', async ({ page, context }) => {
    test.slow()
    const { courierId } = await seeded()
    await creditShop(12) // the courier collected cash on that delivery and still holds it

    // The voucher asks the browser to print as soon as it opens. Count the requests instead of opening a print dialog.
    await context.addInitScript(() => {
      const w = window as unknown as Printable
      w.printCalls = 0
      window.print = () => { w.printCalls += 1 }
    })
    await signInOwner(page)
    await page.goto(`/drivers/${courierId}`)
    await page.getByRole('button', { name: /Close Shift & Settle/ }).click()

    const opened = context.waitForEvent('page')
    await page.getByRole('button', { name: /Confirm & Print Handover Slip/ }).click()
    const voucher = await opened
    await voucher.waitForLoadState('domcontentloaded')

    await expect(voucher).toHaveURL(/\/print\/settlement\/[0-9a-f-]{36}\?print=1$/)
    await expect(voucher.getByText('COURIER COD CASH REMITTANCE VOUCHER')).toBeVisible()
    await expect(voucher.getByText('Rami Courier').first()).toBeVisible()
    const printButton = voucher.getByRole('button', { name: /Print Voucher Slip/ })
    await expect(printButton).toBeVisible()

    // It printed on its own, and the button prints again
    const calls = () => voucher.evaluate(() => (window as unknown as Printable).printCalls)
    await expect.poll(calls).toBe(1)
    await printButton.click()
    await expect.poll(calls).toBe(2)
  })

  test('a voucher that does not exist is a not-found page, not an error', async ({ page }) => {
    await signInOwner(page)
    const response = await page.goto(`/print/settlement/${randomUUID()}`)
    expect(response?.status()).toBe(404)
  })
})
