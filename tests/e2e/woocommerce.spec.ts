import { createHmac } from 'node:crypto'
import { test, expect, type APIRequestContext } from 'playwright/test'
import { seeded, signInMerchant } from './helpers'

const sign = (raw: string, secret: string) => createHmac('sha256', secret).update(raw).digest('base64')
const wooOrder = (id: number, extra: Record<string, unknown> = {}) => ({
  id, number: String(id), status: 'processing', currency: 'USD', total: '48.50', payment_method: 'cod', date_paid: null, customer_note: 'Ring twice',
  shipping: { first_name: 'Rita', last_name: 'Haddad', address_1: 'Bliss Street 12', city: 'Beirut Central', state: 'LB-BA', country: 'LB', phone: '03 123 456' },
  billing: { first_name: 'Rita', last_name: 'Haddad', phone: '03 123 456' },
  ...extra,
})
async function post(request: APIRequestContext, shopId: string, secret: string, payload: unknown, headers: Record<string, string> = {}) {
  const raw = typeof payload === 'string' ? payload : JSON.stringify(payload)
  return request.post(`/api/webhooks/woocommerce/${shopId}`, {
    headers: { 'Content-Type': 'application/json', 'X-WC-Webhook-Topic': 'order.created', 'X-WC-Webhook-Signature': sign(raw, secret), ...headers },
    data: raw,
  })
}

test('a merchant connects WooCommerce, and signed new orders become Cedar orders', async ({ page, request }) => {
  test.slow()
  const { db, shopId, areaId } = await seeded()
  await db.from('shop_woocommerce').delete().eq('shop_id', shopId)
  const id = 900000 + Math.floor(Math.random() * 90000)
  try {
    await signInMerchant(page)
    await page.goto('/portal/integrations')
    await page.getByRole('button', { name: 'Connect WooCommerce' }).click()
    const secret = (await page.getByTestId('secret-value').textContent())!.trim()
    expect(secret).toMatch(/^whsec_[0-9a-f]{48}$/)
    const deliveryUrl = (await page.getByTestId('secret-extra').textContent())!.trim()
    expect(deliveryUrl).toMatch(new RegExp(`/api/webhooks/woocommerce/${shopId}$`))
    await page.reload()
    await expect(page.getByTestId('woo-connected')).toBeVisible()
    expect(await page.content()).not.toContain(secret)

    // WooCommerce's test message when the webhook is saved
    const ping = await post(request, shopId, secret, 'webhook_id=12', { 'Content-Type': 'application/x-www-form-urlencoded' })
    expect(ping.status()).toBe(200)
    expect((await ping.json()).status).toBe('ping')

    // A cash-on-delivery order becomes a Cedar order for this shop, priced by its zone, with the cash to collect
    const made = await post(request, shopId, secret, wooOrder(id))
    expect(made.status()).toBe(200)
    const { data: row } = await db.from('orders').select('shop_id, area_id, collection_usd, delivery_fee_usd, recipient_name, recipient_address, external_ref, status, notes').eq('external_ref', 'woocommerce:' + id).single()
    expect(row).toMatchObject({ shop_id: shopId, area_id: areaId, collection_usd: 48.5, recipient_name: 'Rita Haddad', external_ref: 'woocommerce:' + id })
    expect(row!.recipient_address).toContain('Bliss Street 12')
    expect(row!.notes).toContain('WooCommerce #' + id)
    expect(Number(row!.delivery_fee_usd)).toBeGreaterThan(0)

    // The same order again does not make a second delivery
    const again = await post(request, shopId, secret, wooOrder(id))
    expect(again.status()).toBe(200)
    expect((await again.json()).skipped).toBe(true)
    const { count } = await db.from('orders').select('id', { count: 'exact', head: true }).eq('external_ref', 'woocommerce:' + id)
    expect(count).toBe(1)

    // Paid online: nothing to collect. Cancelled: not imported. Other topics: ignored.
    expect((await post(request, shopId, secret, wooOrder(id + 1, { payment_method: 'stripe', date_paid: '2026-11-01T10:00:00' }))).status()).toBe(200)
    const { data: prepaid } = await db.from('orders').select('collection_usd').eq('external_ref', 'woocommerce:' + (id + 1)).single()
    expect(prepaid!.collection_usd).toBe(0)
    const cancelled = await post(request, shopId, secret, wooOrder(id + 2, { status: 'cancelled' }))
    expect((await cancelled.json()).skipped).toBe(true)
    expect((await db.from('orders').select('id', { count: 'exact', head: true }).eq('external_ref', 'woocommerce:' + (id + 2))).count).toBe(0)
    const other = await post(request, shopId, secret, wooOrder(id + 3), { 'X-WC-Webhook-Topic': 'order.updated' })
    expect((await other.json()).status).toBe('ignored')
    expect((await db.from('orders').select('id', { count: 'exact', head: true }).eq('external_ref', 'woocommerce:' + (id + 3))).count).toBe(0)

    // Wrong or missing signatures and unknown shops are all refused the same way
    expect((await post(request, shopId, 'whsec_wrong', wooOrder(id + 4))).status()).toBe(401)
    expect((await post(request, shopId, secret, wooOrder(id + 4), { 'X-WC-Webhook-Signature': '' })).status()).toBe(401)
    expect((await post(request, '00000000-0000-4000-8000-0000000000bb', secret, wooOrder(id + 4))).status()).toBe(401)
    expect((await db.from('orders').select('id', { count: 'exact', head: true }).eq('external_ref', 'woocommerce:' + (id + 4))).count).toBe(0)

    // Connecting again makes a new secret and the old one stops working
    page.once('dialog', d => d.accept())
    await page.getByRole('button', { name: 'New secret' }).click()
    const fresh = (await page.getByTestId('secret-value').textContent())!.trim()
    expect(fresh).not.toBe(secret)
    expect((await post(request, shopId, secret, wooOrder(id + 5))).status()).toBe(401)
    expect((await post(request, shopId, fresh, wooOrder(id + 5))).status()).toBe(200)
    await expect(page.getByTestId('woo-connected')).toContainText('Last order received')

    // Disconnecting stops new orders
    page.once('dialog', d => d.accept())
    await page.getByRole('button', { name: 'Disconnect' }).click()
    await expect(page.getByTestId('woo-connected')).toHaveCount(0)
    expect((await post(request, shopId, fresh, wooOrder(id + 6))).status()).toBe(401)
  } finally {
    await db.from('shop_woocommerce').delete().eq('shop_id', shopId)
  }
})
