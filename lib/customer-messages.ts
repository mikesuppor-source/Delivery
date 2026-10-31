import { after } from 'next/server'
import { createServiceClient } from './supabase/server'
import { dispatchCustomerNotification, type MessageLang, type MessageTemplate } from './messaging'
import { formatLebanesePhone } from './phone'
import { siteUrl } from './shopify-security'

type QueuedTemplate = Exclude<MessageTemplate, 'order_created'>

/** Why a delivery attempt failed, in words a customer understands. */
const ATTEMPT_REASON: Record<string, { en: string; ar: string }> = {
  no_answer: { en: 'no answer', ar: 'لم يتم الرد' },
  refused: { en: 'the parcel was refused', ar: 'تم رفض الشحنة' },
  wrong_address: { en: 'we could not find the address', ar: 'تعذر الوصول إلى العنوان' },
  rescheduled: { en: 'rescheduled at your request', ar: 'تمت إعادة الجدولة بناءً على طلبك' },
  closed: { en: 'the address was closed', ar: 'العنوان مغلق' },
  other: { en: 'a delivery problem', ar: 'مشكلة في التسليم' },
}

export interface MessageOrder {
  code: string
  status: string
  is_held: boolean
  recipient_phone: string | null
  tracking_token: string | null
  shop?: { name: string | null } | null
  driver?: { name: string | null } | null
}

/** A queued message is only worth sending while the order is still in the state it announces. */
export function stillRelevant(template: QueuedTemplate, order: Pick<MessageOrder, 'status' | 'is_held'>): boolean {
  switch (template) {
    case 'out_for_delivery': return order.status === 'picked_up'
    case 'delivered': return order.status === 'delivered'
    case 'failed_attempt': return !['delivered', 'cancelled', 'returned'].includes(order.status)
    case 'held': return order.is_held
  }
}

export function messageLanguage(phone: string): MessageLang {
  return (formatLebanesePhone(phone) || phone).startsWith('+961') ? 'ar' : 'en'
}

/** The values that fill a message's numbered variables. */
export function messageParams(input: { order: MessageOrder; lang: MessageLang; baseUrl: string; attemptResult?: string | null; deliverAfter?: string | null }): Record<string, string> {
  const { order, lang, baseUrl, attemptResult, deliverAfter } = input
  const reason = ATTEMPT_REASON[attemptResult ?? ''] ?? ATTEMPT_REASON.other
  const date = deliverAfter
    ? new Date(deliverAfter + 'T00:00:00Z').toLocaleDateString(lang === 'ar' ? 'ar-LB' : 'en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
    : lang === 'ar' ? 'إشعار آخر' : 'further notice'
  return {
    code: order.code,
    shop: order.shop?.name || 'Cedar',
    courier: order.driver?.name || 'Cedar',
    track_url: `${baseUrl}/track/${order.tracking_token || order.code}`,
    reason: reason[lang],
    date,
  }
}

const orderBase = (fallbackOrigin?: string) => {
  try { return siteUrl() } catch { return fallbackOrigin ?? '' }
}

/**
 * Sends the customer messages that are due (the database queues them when an order changes status).
 * Safe to run often and in parallel: each message is handed out once, and a failure is retried later.
 */
export async function processCustomerMessages(limit = 20, fallbackOrigin?: string) {
  const db = createServiceClient()
  const { data: due, error } = await db.rpc('claim_customer_messages', { p_limit: limit })
  if (error) throw new Error('Could not read the customer message queue')
  const totals = { claimed: due?.length ?? 0, sent: 0, skipped: 0, failed: 0 }
  const baseUrl = orderBase(fallbackOrigin)

  for (const job of due ?? []) {
    const template = job.template as QueuedTemplate
    let outcome: 'sent' | 'skipped' | 'failed' = 'failed'
    let problem: string | null = null
    try {
      const { data: order } = await db.from('orders')
        .select('code, status, is_held, recipient_phone, tracking_token, shop:shop_id(name), driver:driver_id(name)')
        .eq('id', job.order_id).maybeSingle()
      if (!order || !order.recipient_phone || !stillRelevant(template, order)) {
        outcome = 'skipped'
      } else {
        const lang = messageLanguage(order.recipient_phone)
        const [attempt, hold] = await Promise.all([
          template === 'failed_attempt'
            ? db.from('delivery_attempts').select('result').eq('order_id', job.order_id).order('attempt_no', { ascending: false }).limit(1).maybeSingle()
            : Promise.resolve({ data: null }),
          template === 'held'
            ? db.from('order_holds').select('deliver_after').eq('order_id', job.order_id).is('released_at', null).maybeSingle()
            : Promise.resolve({ data: null }),
        ])
        const result = await dispatchCustomerNotification({
          workspaceId: job.workspace_id,
          orderId: job.order_id,
          toPhone: order.recipient_phone,
          template,
          lang,
          params: messageParams({ order, lang, baseUrl, attemptResult: attempt.data?.result, deliverAfter: hold.data?.deliver_after }),
        })
        if (result.skipped) outcome = 'skipped'
        else if (result.success) outcome = 'sent'
        else problem = result.error ?? 'The message could not be sent'
      }
    } catch (error) {
      problem = error instanceof Error ? error.message : 'Unexpected error'
    }
    await db.rpc('complete_customer_message', { p_id: job.id, p_outcome: outcome, p_error: problem })
    totals[outcome]++
  }
  return totals
}

/** Sends what is queued right after the current request finishes, so customers hear about a change within seconds. */
export function nudgeCustomerMessages(req: Request) {
  after(async () => {
    try { await processCustomerMessages(10, new URL(req.url).origin) } catch (error) { console.error('Customer messages could not be sent', error) }
  })
}
