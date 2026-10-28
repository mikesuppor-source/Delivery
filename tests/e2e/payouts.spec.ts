import { test, expect } from 'playwright/test'
import { apiCall, creditShop, seeded, signInMerchant, signInOwner } from './helpers'

test('merchant payouts cannot overdraw, and are paid exactly once', async ({ page, browser }) => {
  const { db, workspaceId } = await seeded()
  await creditShop(20)

  await signInMerchant(page)
  const available = (await apiCall(page, '/api/portal/cashout')).body.availableUsd as number
  expect(available).toBeGreaterThanOrEqual(20)

  const request = { method: 'whish', accountDetails: '71 000 111' }
  const [first, second] = await Promise.all([
    apiCall(page, '/api/portal/cashout', 'POST', { ...request, amountUsd: available }),
    apiCall(page, '/api/portal/cashout', 'POST', { ...request, amountUsd: available }),
  ])
  expect([first.status, second.status].sort()).toEqual([200, 400])
  expect((await apiCall(page, '/api/portal/cashout', 'POST', { ...request, amountUsd: 0.01 })).status).toBe(400)
  const requestId = (first.status === 200 ? first : second).body.cashout.id as string

  const dispatch = await browser.newContext()
  const owner = await dispatch.newPage()
  await signInOwner(owner)
  const decide = (action: string) => apiCall(owner, '/api/admin/cashout', 'PATCH', { workspaceId, requestId, action })

  expect((await decide('approve')).status).toBe(200)
  expect((await decide('approve')).status).toBe(409)
  const paid = await Promise.all([decide('mark_paid'), decide('mark_paid')])
  expect(paid.map(r => r.status).sort()).toEqual([200, 400])
  expect((await decide('reject')).status).toBe(409)
  await dispatch.close()

  const { count } = await db.from('settlements').select('id', { count: 'exact', head: true }).eq('idempotency_key', requestId)
  expect(count).toBe(1)
})

test("a self-made workspace cannot see other companies' payout requests", async ({ page }) => {
  await signInMerchant(page)
  const created = await apiCall(page, '/api/workspace', 'POST', { name: 'E2E Probe Co' })
  expect(created.status, JSON.stringify(created.body)).toBe(200)
  const peek = await apiCall(page, '/api/admin/cashout?workspaceId=' + created.body.workspace.id)
  expect(peek.status).toBe(200)
  expect(peek.body.requests).toEqual([])

  // Remove the probe workspace again so repeated runs stay tidy
  const { db } = await seeded()
  await db.from('workspaces').delete().eq('id', created.body.workspace.id)
})
