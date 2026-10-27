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
 * Resolves current tracking base URL dynamically from window or env
 */
export function getBaseUrl(): string {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin.replace(/\/$/, '')
  }
  return (process.env.NEXT_PUBLIC_SITE_URL || (process.env.NEXT_PUBLIC_SITE_URL || '')).replace(/\/$/, '')
}

/**
 * Builds direct customer WhatsApp URL from order parameters
 */
export function getCustomerOrderWhatsAppUrl(order: {
  customerPhone?: string | null
  customerName?: string | null
  orderCode: string
  trackingToken?: string
  shopName?: string | null
  collectionUsd: number
  collectionLbp?: number
  driverName?: string | null
  driverPhone?: string | null
  status?: string | null
}): string {
  if (!order.customerPhone) return '#'
  const baseUrl = getBaseUrl()
  const customer = order.customerName?.trim() || 'Customer'
  let msg = `Hello ${customer},\n\nThis is Cedar Delivery Desk regarding your order *#${order.orderCode}*`
  if (order.shopName) msg += ` from *${order.shopName}*`
  if (order.driverName) msg += ` handled by courier *${order.driverName}*`
  msg += `.\n\n`
  if (order.collectionUsd > 0) {
    msg += `*COD to Collect:* ${formatUSD(order.collectionUsd)}\n`
  }
  msg += `*Live Tracking:* ${baseUrl}/track/${order.trackingToken || order.orderCode}\n\n`
  msg += `Please reply with your delivery instructions or live location pin. Thank you!`
  return getWhatsAppUrl(order.customerPhone, msg)
}

/**
 * Generates customer delivery notification message
 */
export function buildCustomerOrderMessage(order: {
  code: string
  tracking_token?: string
  recipient_name?: string | null
  recipient_address?: string | null
  collection_usd: number
  delivery_fee_usd?: number
  usd_to_lbp_rate: number
  shop?: { name: string } | null
  driver?: { name: string; phone?: string | null } | null
  status?: string | null
}): string {
  const baseUrl = getBaseUrl()
  const customer = order.recipient_name?.trim() || 'Customer'
  const shopName = order.shop?.name || 'our partner store'
  const rate = Number(order.usd_to_lbp_rate) || 89500
  const colUSD = Number(order.collection_usd) || 0
  const colLBP = usdToLbp(colUSD, rate)

  // Out for delivery specific template
  if (order.status === 'picked_up' && order.driver?.name) {
    let msg = `Marhaba ${customer},\n\n`
    msg += `Your order *${order.code}* from *${shopName}* is *OUT FOR DELIVERY* today with courier *${order.driver.name}*`
    if (order.driver.phone) msg += ` (${order.driver.phone})`
    msg += `.\n\n`
    if (colUSD > 0) {
      msg += `*COD to Pay:* ${formatUSD(colUSD)} (~ ${formatLBP(colLBP)})\n`
    }
    if (order.recipient_address) {
      msg += `*Destination:* ${order.recipient_address}\n`
    }
    msg += `*Live Tracking:* ${baseUrl}/track/${order.tracking_token || order.code}\n\n`
    msg += `The courier will contact you shortly before arrival. Thank you!`
    return msg
  }

  // Delivered notification template
  if (order.status === 'delivered') {
    let msg = `Hello ${customer},\n\n`
    msg += `Your package *${order.code}* from *${shopName}* has been *DELIVERED* successfully.\n\n`
    if (colUSD > 0) {
      msg += `*Amount Collected:* ${formatUSD(colUSD)}\n`
    }
    msg += `*Delivery Receipt:* ${baseUrl}/track/${order.tracking_token || order.code}\n\n`
    msg += `Thank you for choosing Cedar Delivery!`
    return msg
  }

  let msg = `Hello ${customer},\n\n`
  msg += `This is *Cedar Delivery Desk* regarding your delivery order *${order.code}* from *${shopName}*.\n\n`

  if (colUSD > 0) {
    msg += `*Amount to Collect:* ${formatUSD(colUSD)} (~ ${formatLBP(colLBP)})\n`
  } else {
    msg += `*Amount to Collect:* Prepaid / $0.00\n`
  }

  if (order.recipient_address) {
    msg += `*Delivery Address:* ${order.recipient_address}\n`
  }

  msg += `*Track Package:* ${baseUrl}/track/${order.tracking_token || order.code}\n`

  msg += `\nPlease reply with your live location pin or let us know if you are available to receive your order today.\n\nThank you!`
  return msg
}

/**
 * Generates courier assignment / dispatch notification message
 */
export function buildCourierToCustomerMessage(order: {
  code: string
  tracking_token?: string
  recipient_name?: string | null
  recipient_address?: string | null
  collection_usd: number
  usd_to_lbp_rate?: number
  shop?: { name: string } | null
  driverName?: string | null
}, lang: 'en' | 'ar' = 'ar'): string {
  const baseUrl = getBaseUrl()
  const customer = order.recipient_name?.trim() || (lang === 'ar' ? 'العميل الكريم' : 'Customer')
  const shopName = order.shop?.name || (lang === 'ar' ? 'المتجر' : 'Store')
  const rate = Number(order.usd_to_lbp_rate) || 89500
  const colUSD = Number(order.collection_usd) || 0
  const colLBP = usdToLbp(colUSD, rate)
  const trackingLink = `${baseUrl}/track/${order.tracking_token || order.code}`

  if (lang === 'ar') {
    let msg = `مرحباً ${customer}! 🛵\n`
    msg += `معك سائق توصيل طلبك *#${order.code}* من متجر *${shopName}*.\n\n`
    if (colUSD > 0) {
      msg += `💵 *المبلغ المطلوب تحضيره عند الاستلام (COD):*\n`
      msg += `*${formatUSD(colUSD)}* (~ ${formatLBP(colLBP)})\n\n`
    } else {
      msg += `📦 *الطلب مدفوع مسبقاً ($0.00)*\n\n`
    }
    if (order.recipient_address) {
      msg += `📍 *عنوان التسليم:* ${order.recipient_address}\n\n`
    }
    msg += `📲 يرجى إرسال موقعك المباشر (Location Pin) لتسهيل الوصول إليك:\n${trackingLink}\n\n`
    msg += `شكراً لتعاونكم!`
    return msg
  }

  let msg = `Hello ${customer}! 🛵\n`
  msg += `I am your courier on the way with your delivery *#${order.code}* from *${shopName}*.\n\n`
  if (colUSD > 0) {
    msg += `💵 *Cash to Prepare (COD):*\n`
    msg += `*${formatUSD(colUSD)}* (~ ${formatLBP(colLBP)})\n\n`
  } else {
    msg += `📦 *Prepaid Delivery ($0.00)*\n\n`
  }
  if (order.recipient_address) {
    msg += `📍 *Destination:* ${order.recipient_address}\n\n`
  }
  msg += `📲 Please reply with your live location pin or delivery instructions:\n${trackingLink}\n\n`
  msg += `Thank you!`
  return msg
}

/**
 * Generates courier assignment / dispatch notification message
 */
export function buildDriverDispatchMessage(order: {
  code: string
  tracking_token?: string
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

  let msg = `*NEW DISPATCH — ORDER ${order.code}*\n`
  msg += `─────────────────────────\n`
  msg += `*Store:* ${shopName}${order.shop?.phone ? ' (' + order.shop.phone + ')' : ''}\n`
  msg += `*Customer:* ${order.recipient_name || 'N/A'}\n`
  if (order.recipient_phone) {
    msg += `*Phone:* ${order.recipient_phone}\n`
  }
  if (order.area?.name) {
    msg += `*Zone:* ${order.area.name}\n`
  }
  if (order.recipient_address) {
    msg += `*Address:* ${order.recipient_address}\n`
  }
  msg += `*Cash to Collect:* ${formatUSD(colUSD)} (${formatLBP(colLBP)})\n`
  if (driverPay > 0) {
    msg += `*Your Commission:* ${formatUSD(driverPay)}\n`
  }
  msg += `─────────────────────────\n`
  msg += `Please confirm pickup when ready.`
  return msg
}
