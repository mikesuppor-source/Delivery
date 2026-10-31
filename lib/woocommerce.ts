import { createHmac, timingSafeEqual } from 'node:crypto'
import { ApiError, money, textField } from './api'
import { createImportedOrder, type IncomingOrder } from './import-orders'
import { formatLebanesePhone } from './phone'

// WooCommerce stores send each new order to Cedar through WooCommerce's own Webhooks feature
// (WooCommerce > Settings > Advanced > Webhooks). Nothing about the shop's WooCommerce login is kept here:
// only a signing secret that Cedar made, which proves a message really came from that store.
type Woo = Record<string, any>

/** WooCommerce signs the exact request body with HMAC-SHA256 and sends it in base64 in X-WC-Webhook-Signature. */
export function verifyWooSignature(raw: string, signature: string, secret: string) {
  if (!/^[A-Za-z0-9+/]{43}=$/.test(signature ?? '')) return false
  const expected = createHmac('sha256', secret).update(raw).digest()
  const supplied = Buffer.from(signature, 'base64')
  return expected.length === supplied.length && timingSafeEqual(expected, supplied)
}

const IMPORT_STATUSES = ['pending', 'processing', 'on-hold']

/** Why this order should not become a delivery, or null when it should. */
export function wooSkipReason(payload: Woo) {
  if (!payload?.id) return 'Missing WooCommerce order id'
  const status = String(payload.status ?? '')
  return IMPORT_STATUSES.includes(status) ? null : `Order status is ${status || 'unknown'}`
}

/** Cash the courier collects, in USD. Only cash on delivery is collected; every other payment is settled outside Cedar. */
export function wooCollectUsd(payload: Woo, rate: number) {
  const currency = String(payload.currency ?? '').toUpperCase()
  if (!['USD', 'LBP'].includes(currency)) throw new ApiError(400, 'Unsupported order currency: ' + currency)
  if (payload.payment_method !== 'cod') return 0
  const total = money(payload.total, 'order total')
  return currency === 'LBP' ? Math.round(total / rate * 100) / 100 : total
}

export function wooIncomingOrder(payload: Woo): IncomingOrder {
  const ref = 'woocommerce:' + String(payload.id)
  const ship = payload.shipping?.address_1 || payload.shipping?.first_name ? payload.shipping : {}
  const bill = payload.billing ?? {}
  const pick = (key: string) => ship[key] || bill[key] || ''
  const name = [pick('first_name'), pick('last_name')].filter(Boolean).join(' ') || 'WooCommerce Customer'
  return {
    identity: { external_ref: ref },
    repeat: { column: 'external_ref', value: ref },
    areaTerms: [pick('city'), pick('state')],
    collectUsd: rate => wooCollectUsd(payload, rate),
    recipient: {
      name: textField(name, 'recipient', 200),
      phone: formatLebanesePhone(String(ship.phone || bill.phone || '')),
      address: [ship.address_1 || bill.address_1, ship.address_2 || bill.address_2, pick('city'), pick('state'), pick('country')].filter(Boolean).join(', ').slice(0, 1000),
    },
    note: matched => 'WooCommerce #' + String(payload.number ?? payload.id) + (matched ? '' : ' | Area needs manual review') + ' | ' + String(payload.customer_note ?? ''),
  }
}

export async function importWooCommerceOrder(shop: { id: string; workspace_id: string; prefix?: string | null }, payload: Woo) {
  const skip = wooSkipReason(payload)
  if (skip) return { skipped: true as const, reason: skip }
  return createImportedOrder(shop, wooIncomingOrder(payload))
}
