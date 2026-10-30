import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { test, expect } from 'playwright/test'
import { seeded, signInMerchant } from './helpers'
import { verifyWebhookSignature } from '../../lib/webhook-signature'

// Merchant portal, "Connect Store": the key is shown once and works, revoking stops it, the webhook secret is shown once.
// Needs CRON_SECRET and WEBHOOK_ALLOW_LOCAL=1 in the app's environment (CI sets both).
test('a merchant makes an API key, uses it, revokes it, and sets up a webhook', async ({ page, request }) => {
  test.slow()
  expect(process.env.CRON_SECRET, 'run with CRON_SECRET and WEBHOOK_ALLOW_LOCAL=1 set').toBeTruthy()
  const { db, shopId, workspaceId, courierId } = await seeded()
  await db.from('shop_webhooks').delete().eq('shop_id', shopId)

  const got: Array<{ body: string; signature: string }> = []
  const server = http.createServer((req, res) => {
    let body = ''
    req.on('data', c => body += c)
    req.on('end', () => { got.push({ body, signature: String(req.headers['x-cedar-signature']) }); res.end('ok') })
  })
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r))
  const receiverUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/hook`

  try {
    await signInMerchant(page)
    await page.goto('/portal')
    await page.getByRole('link', { name: 'Connect Store' }).click()
    await expect(page.getByRole('heading', { name: 'Connect your store' })).toBeVisible()

    // A new key is shown once, in full, and works at once
    await page.getByLabel('Key name').fill('E2E website')
    await page.getByRole('button', { name: 'Create key' }).click()
    const shown = page.getByTestId('secret-value')
    await expect(shown).toBeVisible()
    const key = (await shown.textContent())!.trim()
    expect(key).toMatch(/^cdr_live_[0-9a-f]{48}$/)
    const zones = await request.get('/api/v1/zones', { headers: { Authorization: 'Bearer ' + key } })
    expect(zones.status()).toBe(200)

    // After a reload only the start of the key is left on the page
    await page.reload()
    await expect(page.getByTestId('secret-shown')).toHaveCount(0)
    const row = page.getByTestId('key-row').filter({ hasText: 'E2E website' })
    await expect(row).toContainText(key.slice(0, 13) + '…')
    expect(await page.content()).not.toContain(key)

    // Revoking stops it at once
    page.once('dialog', d => d.accept())
    await row.getByRole('button', { name: 'Revoke' }).click()
    await expect(row.getByText('Revoked')).toBeVisible()
    expect((await request.get('/api/v1/zones', { headers: { Authorization: 'Bearer ' + key } })).status()).toBe(401)

    // An unsafe webhook address is refused with a reason
    await page.getByLabel('Webhook address').fill('https://169.254.169.254/latest')
    await page.getByRole('button', { name: 'Turn on webhook' }).click()
    await expect(page.getByTestId('error')).toContainText('public https webhook address')
    await page.getByLabel('Webhook address').fill('http://example.com/hook')
    await page.getByRole('button', { name: 'Turn on webhook' }).click()
    await expect(page.getByTestId('error')).toContainText('https://')

    // A good address turns the webhook on and shows the signing secret once
    await page.getByLabel('Webhook address').fill(receiverUrl)
    await page.getByRole('button', { name: 'Turn on webhook' }).click()
    const secretBox = page.getByTestId('secret-value')
    await expect(secretBox).toBeVisible()
    const secret = (await secretBox.textContent())!.trim()
    expect(secret).toMatch(/^whsec_[0-9a-f]{48}$/)
    await page.reload()
    expect(await page.content()).not.toContain(secret)
    await expect(page.getByRole('button', { name: 'Save address' })).toBeVisible()

    // An order of this shop changes status: the message is sent and shows in the log
    const code = 'PI-' + Math.random().toString(36).slice(2, 7).toUpperCase()
    const { error } = await db.from('orders').insert({ workspace_id: workspaceId, shop_id: shopId, code, usd_to_lbp_rate: 89500 })
    expect(error).toBeNull()
    await db.from('orders').update({ status: 'assigned', driver_id: courierId }).eq('code', code)
    const run = await request.get('/api/cron/webhooks', { headers: { Authorization: 'Bearer ' + process.env.CRON_SECRET } })
    expect((await run.json()).delivered).toBeGreaterThanOrEqual(1)
    expect(got.length).toBeGreaterThanOrEqual(1)
    expect(verifyWebhookSignature(secret, got[0].body, got[0].signature)).toBe(true)
    await page.reload()
    const log = page.getByTestId('delivery-row').filter({ hasText: code })
    await expect(log).toContainText('order.status_changed')
    await expect(log).toContainText('delivered')

    // Turning it off stops new messages from being queued
    await page.getByRole('button', { name: 'Turn off' }).click()
    await expect(page.getByText('Off', { exact: true })).toBeVisible()
    await db.from('orders').update({ status: 'picked_up' }).eq('code', code)
    const { count } = await db.from('webhook_deliveries').select('id', { count: 'exact', head: true }).eq('shop_id', shopId).eq('status', 'pending')
    expect(count).toBe(0)
  } finally {
    await db.from('shop_webhooks').delete().eq('shop_id', shopId)
    await db.from('shop_api_keys').delete().eq('shop_id', shopId)
    await new Promise<void>(r => { server.closeAllConnections(); server.close(() => r()) })
  }
})

test('the API description is public and the documentation page lists every endpoint', async ({ page, request }) => {
  test.slow()
  const spec = await request.get('/api/v1/openapi.json') // no key and no sign-in: it holds nothing private
  expect(spec.status()).toBe(200)
  const doc = await spec.json()
  expect(doc.openapi).toMatch(/^3\./)
  expect(Object.keys(doc.paths)).toEqual(expect.arrayContaining(['/orders', '/orders/{code}', '/orders/{code}/cancel', '/zones']))

  await signInMerchant(page)
  await page.goto('/portal/api-docs')
  await expect(page.getByRole('heading', { name: 'API documentation' })).toBeVisible()
  for (const path of ['/api/v1/zones', '/api/v1/orders', '/api/v1/orders/{code}', '/api/v1/orders/{code}/cancel']) {
    await expect(page.getByRole('cell', { name: path, exact: true }).first()).toBeVisible()
  }
  await expect(page.getByText('X-Cedar-Signature').first()).toBeVisible()
})
