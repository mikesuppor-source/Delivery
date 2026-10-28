import { test, expect } from 'playwright/test'
import { apiCall, seeded, signInMerchant, signInOwner } from './helpers'

test('dispatch creates and edits an order sending only the fields a form would', async ({ page }) => {
  const { workspaceId, shopId } = await seeded()
  await signInOwner(page)

  const created = await apiCall(page, '/api/orders', 'POST', { workspaceId, shopId, recipientName: 'Minimal Desk', recipientPhone: '+961 3 777 888' })
  expect(created.status, JSON.stringify(created.body)).toBe(200)
  expect(created.body.order).toMatchObject({ status: 'pending', collection_usd: 0, service_type: 'delivery', is_breakable: false })

  const edited = await apiCall(page, '/api/orders', 'PATCH', { workspaceId, orderId: created.body.order.id, notes: 'Ring twice', collectionUsd: '12.50' })
  expect(edited.status, JSON.stringify(edited.body)).toBe(200)
  expect(edited.body.order).toMatchObject({ notes: 'Ring twice', collection_usd: 12.5 })

  const rejected = await apiCall(page, '/api/orders', 'POST', { workspaceId, collectionUsd: -5 })
  expect(rejected.status).toBe(400)
  expect(rejected.body.error).toBe('Invalid collectionUsd')
})

test('order search matches punctuation literally and cannot add filters', async ({ page }) => {
  const { workspaceId, shopId } = await seeded()
  await signInOwner(page)
  const address = 'Mar Mikhael, Beirut "Bldg (7)"'
  const created = await apiCall(page, '/api/orders', 'POST', { workspaceId, shopId, recipientName: 'Search Probe', recipientAddress: address })
  expect(created.status, JSON.stringify(created.body)).toBe(200)

  const search = (term: string) => apiCall(page, '/api/orders?search=' + encodeURIComponent(term))
  const withComma = await search('Mar Mikhael, Beirut "Bldg (7)"')
  expect(withComma.status).toBe(200)
  expect(withComma.body.orders.map((o: { id: string }) => o.id)).toContain(created.body.order.id)

  const injection = await search('zzz%",code.neq.x,recipient_name.ilike."zzz')
  expect(injection.status).toBe(200)
  expect(injection.body.count).toBe(0)
})

test('the New Order form submits real form data that passes validation', async ({ page }) => {
  test.slow() // the first visit compiles the page in dev mode
  await seeded()
  await signInOwner(page)
  await page.goto('/orders/new')

  await page.locator('#shop-id').selectOption({ index: 1 })
  await page.locator('#area-id').selectOption({ index: 1 })
  await page.locator('#net-item-price').fill('20')
  await page.locator('#recipient-name').fill('Form Customer')
  await page.locator('#recipient-phone').fill('+961 70 123 456')
  await page.getByPlaceholder(/Achrafieh, Sassine Square/).fill('Gemmayzeh, Beirut')
  await page.getByRole('button', { name: 'Create & Add Another' }).first().click()

  await expect(page.getByText(/Order #\S+ created successfully/)).toBeVisible()
})

test('a merchant places and cancels an order from the portal', async ({ page }) => {
  const { areaId } = await seeded()
  await signInMerchant(page)

  const placed = await apiCall(page, '/api/portal/orders', 'POST', {
    areaId, recipientName: 'Minimal Portal', recipientPhone: '03 777 888', recipientAddress: 'Achrafieh, Beirut',
  })
  expect(placed.status, JSON.stringify(placed.body)).toBe(200)
  expect(placed.body.order).toMatchObject({ status: 'pending', delivery_fee_usd: 3 })

  const cancelled = await apiCall(page, '/api/portal/orders', 'PATCH', { action: 'cancel', orderId: placed.body.order.id })
  expect(cancelled.status, JSON.stringify(cancelled.body)).toBe(200)
  expect(cancelled.body.order.status).toBe('cancelled')
})
