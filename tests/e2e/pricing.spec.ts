import { test, expect } from 'playwright/test'
import { apiCall, seeded, signInMerchant, signInOwner } from './helpers'

test.describe('Phase 1: Pricing engine, shop special prices, and profit reports', () => {
  test('zone pricing, shop special prices, and return pricing flow through APIs', async ({ page }) => {
    const { workspaceId, shopId, areaId, courierId } = await seeded()
    await signInOwner(page)

    // Clear any pre-existing special price for this shop/area
    await apiCall(page, `/api/shops/${shopId}/prices`, 'PUT', {
      workspaceId,
      prices: [{ areaId, feeUsd: null }],
    })

    // 1. Update the delivery area to have specific zone prices
    const areaUpdate = await apiCall(page, '/api/areas', 'PATCH', {
      workspaceId,
      areaId,
      feeUsd: 8.0,
      driverPayUsd: 1.5,
      returnFeeUsd: 2.5,
      returnDriverPayUsd: 1.0,
    })
    expect(areaUpdate.status, JSON.stringify(areaUpdate.body)).toBe(200)

    // 2. Desk creates an order with no explicit fee/pay -> should resolve to zone fee ($8) and courier pay ($1.50)
    const order1 = await apiCall(page, '/api/orders', 'POST', {
      workspaceId,
      shopId,
      areaId,
      collectionUsd: 18.0,
      recipientName: 'Zone Price Customer',
      recipientPhone: '+961 70 111 222',
      recipientAddress: 'Beirut Zone Test',
    })
    expect(order1.status, JSON.stringify(order1.body)).toBe(200)
    expect(order1.body.order.delivery_fee_usd).toBe(8.0)
    expect(order1.body.order.driver_pay_usd).toBe(1.5)

    // 3. Set a special price for this shop on this area ($6.50 instead of $8.00)
    const setPrices = await apiCall(page, `/api/shops/${shopId}/prices`, 'PUT', {
      workspaceId,
      prices: [{ areaId, feeUsd: 6.5 }],
    })
    expect(setPrices.status, JSON.stringify(setPrices.body)).toBe(200)

    // Verify GET special prices
    const getPrices = await apiCall(page, `/api/shops/${shopId}/prices?workspaceId=${workspaceId}`)
    expect(getPrices.status, JSON.stringify(getPrices.body)).toBe(200)
    const matchedSpecial = getPrices.body.prices.find((p: { area_id: string }) => p.area_id === areaId)
    expect(matchedSpecial?.fee_usd).toBe(6.5)

    // 4. New desk order for this shop & zone now automatically uses shop's special price ($6.50)
    const orderSpecial = await apiCall(page, '/api/orders', 'POST', {
      workspaceId,
      shopId,
      areaId,
      collectionUsd: 16.5,
      recipientName: 'Special Price Customer',
      recipientPhone: '+961 70 333 444',
      recipientAddress: 'Hamra Special Test',
    })
    expect(orderSpecial.status, JSON.stringify(orderSpecial.body)).toBe(200)
    expect(orderSpecial.body.order.delivery_fee_usd).toBe(6.5)
    expect(orderSpecial.body.order.driver_pay_usd).toBe(1.5)

    // 5. Merchant portal places order -> automatically gets the shop's special fee ($6.50)
    await page.context().clearCookies()
    await signInMerchant(page)
    const portalOrder = await apiCall(page, '/api/portal/orders', 'POST', {
      areaId,
      collectionUsd: 25.0,
      recipientName: 'Portal Special Client',
      recipientPhone: '+961 71 555 666',
      recipientAddress: 'Achrafieh Portal Test',
    })
    expect(portalOrder.status, JSON.stringify(portalOrder.body)).toBe(200)
    expect(portalOrder.body.order.delivery_fee_usd).toBe(6.5)

    // 6. Return parcel workflow: mark order as returned -> uses zone return fee ($2.50) and return courier pay ($1.00)
    await page.context().clearCookies()
    await signInOwner(page)
    // First assign courier and mark picked_up
    await apiCall(page, '/api/orders', 'PATCH', {
      workspaceId,
      orderId: orderSpecial.body.order.id,
      driverId: courierId,
      status: 'picked_up',
    })
    const returned = await apiCall(page, '/api/orders', 'PATCH', {
      workspaceId,
      orderId: orderSpecial.body.order.id,
      status: 'returned',
    })
    expect(returned.status, JSON.stringify(returned.body)).toBe(200)
    expect(returned.body.order.status).toBe('returned')
    expect(returned.body.order.collection_usd).toBe(0)
    expect(returned.body.order.delivery_fee_usd).toBe(2.5)
    expect(returned.body.order.driver_pay_usd).toBe(1.0)

    // 7. Profit report API returns aggregated totals and breakdowns
    const from = new Date(Date.now() - 24 * 3600 * 1000).toISOString()
    const to = new Date(Date.now() + 24 * 3600 * 1000).toISOString()
    const reportRes = await apiCall(page, `/api/reports/profit?workspaceId=${workspaceId}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`)
    expect(reportRes.status, JSON.stringify(reportRes.body)).toBe(200)
    expect(reportRes.body.report.totals).toBeDefined()
    expect(Array.isArray(reportRes.body.report.by_zone)).toBe(true)
    expect(Array.isArray(reportRes.body.report.by_driver)).toBe(true)
    expect(Array.isArray(reportRes.body.report.by_shop)).toBe(true)
  })
})
