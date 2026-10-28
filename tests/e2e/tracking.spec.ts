import { test, expect } from 'playwright/test'
import { seeded } from './helpers'

test('phone tracking needs the exact number and hides addresses and courier IDs', async ({ request }) => {
  const { db, workspaceId, shopId, areaId, courierId, otherCourierId } = await seeded()
  // A fresh order on a number no other test uses (search shows a customer's 20 latest orders)
  const digits = String(Math.floor(Math.random() * 1e6)).padStart(6, '0')
  const code = 'LS-TP' + digits
  const { error } = await db.from('orders').insert({
    workspace_id: workspaceId, shop_id: shopId, area_id: areaId, driver_id: courierId, code, status: 'assigned', usd_to_lbp_rate: 89500,
    recipient_name: 'Phone Probe', recipient_phone: '+961 71 ' + digits, recipient_address: 'Hamra Street 12, Beirut',
  })
  expect(error).toBeNull()

  const partial = await (await request.get('/track?phone=3')).text()
  expect(partial).toContain('Enter your full mobile number')

  const exact = await (await request.get('/track?phone=071' + digits)).text()
  expect(exact).toContain(code)
  expect(exact).not.toContain('Hamra Street')
  expect(exact).not.toContain(courierId)
  expect(exact).not.toContain(otherCourierId)
})

test('order codes match exactly and never reveal the private tracking token', async ({ request }) => {
  const { db, courierId } = await seeded()
  const { data } = await db.from('orders').select('tracking_token').eq('code', 'LS-ASSIGN1').single()
  const token = (data as { tracking_token: string }).tracking_token

  expect(await (await request.get('/track/LS-%25')).text()).toContain('Tracking Code Not Found')

  const byCode = await (await request.get('/track/ls-assign1')).text()
  expect(byCode).not.toContain('Tracking Code Not Found')
  expect(byCode).not.toContain(token)
  expect(byCode).not.toContain(courierId)
  expect(byCode).not.toMatch(/GPS Pin|Building Pin Linked/)

  // The private link sent to the customer still offers GPS sharing
  expect(await (await request.get('/track/' + token)).text()).toMatch(/GPS Pin|Building Pin Linked/)
})

test('waybills require sign-in', async ({ request }) => {
  const response = await request.get('/print/order/LS-ASSIGN1', { maxRedirects: 0 })
  expect(response.status()).toBe(307)
  expect(response.headers().location).toContain('/login')
})
