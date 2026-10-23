import { formatUSD, formatLBP, usdToLbp } from './utils'

/**
 * Normalizes phone numbers for WhatsApp wa.me links.
 * Handles Lebanese phone numbers (e.g., 03..., 70..., 71..., 76..., 78..., 79..., 81...)
 * as well as international numbers with country codes.
 */
export function normalizePhoneForWhatsApp(phone: string): string {
  if (!phone) return ''

  // Strip all non-digits
  let cleaned = phone.replace(/\D/g, '')

  // Remove leading international 00
  if (cleaned.startsWith('00')) {
    cleaned = cleaned.substring(2)
  }

  // Lebanese local numbers: 8 digits starting with 03, 70, 71, 76, 78, 79, 81, 01, 04, 05, etc.
  // Example: 03123456 -> 9613123456, 70123456 -> 96170123456
  if (cleaned.startsWith('0') && cleaned.length === 8) {
    cleaned = '961' + cleaned.substring(1)
  } else if (cleaned.length === 8 && /^(3|70|71|76|78|79|81|1|4|5|6|7|8|9)/.test(cleaned)) {
    cleaned = '961' + cleaned
  } else if (cleaned.length === 7 && /^(1|4|5|6|7|8|9)/.test(cleaned)) {
    cleaned = '961' + cleaned
  }

  return cleaned
}

/**
 * Builds a direct wa.me link with pre-filled message
 */
export function getWhatsAppUrl(phone: string, message: string): string {
  const normalized = normalizePhoneForWhatsApp(phone)
  if (!normalized) return '#'
  return `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`
}

/**
 * Generates customer delivery notification message
 */
export function buildCustomerOrderMessage(order: {
  code: string
  recipient_name?: string | null
  recipient_address?: string | null
  collection_usd: number
  delivery_fee_usd?: number
  usd_to_lbp_rate: number
  shop?: { name: string } | null
}): string {
  const customer = order.recipient_name?.trim() || 'Customer'
  const shopName = order.shop?.name || 'our partner store'
  const rate = Number(order.usd_to_lbp_rate) || 89500
  const colUSD = Number(order.collection_usd) || 0
  const colLBP = usdToLbp(colUSD, rate)

  let msg = `Hello ${customer} 👋\n\n`
  msg += `This is *Cedar Delivery Desk* regarding your delivery order *${order.code}* from *${shopName}*.\n\n`

  if (colUSD > 0) {
    msg += `💵 *Amount to Collect:* ${formatUSD(colUSD)} (~ ${formatLBP(colLBP)})\n`
  } else {
    msg += `💵 *Amount to Collect:* Prepaid / $0.00\n`
  }

  if (order.recipient_address) {
    msg += `📍 *Delivery Address:* ${order.recipient_address}\n`
  }

  msg += `\nPlease reply with your live location pin 📍 or let us know if you are available to receive your order today.\n\nThank you! 🌲`
  return msg
}

/**
 * Generates courier assignment / dispatch notification message
 */
export function buildDriverDispatchMessage(order: {
  code: string
  recipient_name?: string | null
  recipient_phone?: string | null
  recipient_address?: string | null
  collection_usd: number
  delivery_fee_usd?: number
  driver_pay_usd?: number
  usd_to_lbp_rate: number
  shop?: { name: string; phone?: string | null } | null
  area?: { name: string } | null
}): string {
  const shopName = order.shop?.name || 'Partner Store'
  const rate = Number(order.usd_to_lbp_rate) || 89500
  const colUSD = Number(order.collection_usd) || 0
  const colLBP = usdToLbp(colUSD, rate)
  const driverPay = Number(order.driver_pay_usd) || 0

  let msg = `🚚 *NEW DISPATCH — ORDER ${order.code}*\n`
  msg += `─────────────────────────\n`
  msg += `🏪 *Store:* ${shopName}${order.shop?.phone ? ' (' + order.shop.phone + ')' : ''}\n`
  msg += `👤 *Customer:* ${order.recipient_name || 'N/A'}\n`
  if (order.recipient_phone) {
    msg += `📞 *Phone:* ${order.recipient_phone}\n`
  }
  if (order.area?.name) {
    msg += `🗺️ *Zone:* ${order.area.name}\n`
  }
  if (order.recipient_address) {
    msg += `📍 *Address:* ${order.recipient_address}\n`
  }
  msg += `💵 *Cash to Collect:* ${formatUSD(colUSD)} (${formatLBP(colLBP)})\n`
  if (driverPay > 0) {
    msg += `⭐ *Your Commission:* ${formatUSD(driverPay)}\n`
  }
  msg += `─────────────────────────\n`
  msg += `Please confirm pickup when ready.`
  return msg
}
