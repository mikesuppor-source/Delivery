import { test, expect } from 'playwright/test'
import { seeded } from './helpers'

test('phone tracking needs the exact number and hides addresses and courier IDs', async ({ request }) => {
  const { courierId, otherCourierId } = await seeded()

  const partial = await (await request.get('/track?phone=3')).text()
  expect(partial).toContain('Enter your full mobile number')

  const exact = await (await request.get('/track?phone=03555666')).text()
  expect(exact).toContain('LS-ASSIGN1')
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
