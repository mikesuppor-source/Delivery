import { createServiceClient } from './supabase/server'
import { cleanPhone, formatLebanesePhone } from './phone'

export type MessageChannel = 'whatsapp' | 'sms' | 'system'
export type MessageTemplate = 'order_created' | 'out_for_delivery' | 'delivered' | 'failed_attempt' | 'held'
export type MessageLang = 'en' | 'ar'

export interface MessagePayload {
  workspaceId: string
  orderId?: string
  toPhone: string
  template: MessageTemplate
  lang?: MessageLang
  params: Record<string, string | number>
}

export interface MessagingProvider {
  name: string
  send(payload: MessagePayload, bodyText: string): Promise<{ success: boolean; id?: string; error?: string }>
}

export const MESSAGE_TEMPLATES: Record<MessageTemplate, { en: string; ar: string }> = {
  order_created: {
    en: 'Your order #{code} from {shop} is confirmed! Track your package here: {track_url}',
    ar: 'تم تأكيد طلبك #{code} من متجر {shop}! يمكنك تتبع شحنتك هنا: {track_url}',
  },
  out_for_delivery: {
    en: 'Your order #{code} is out for delivery with our courier {courier}! Live tracking: {track_url}',
    ar: 'طلبك #{code} في طريقه إليك الآن مع السائق {courier}! التتبع المباشر: {track_url}',
  },
  delivered: {
    en: 'Your order #{code} has been delivered! Please rate your delivery service: {track_url}',
    ar: 'تم تسليم طلبك #{code} بنجاح! نرجو تقييم مستوى الخدمة: {track_url}',
  },
  failed_attempt: {
    en: 'Delivery attempt for order #{code} was unsuccessful ({reason}). We will reschedule soon: {track_url}',
    ar: 'تعذر تسليم طلبك #{code} بسبب ({reason}). سنقوم بإعادة الجدولة قريباً: {track_url}',
  },
  held: {
    en: 'Your package #{code} is held safely in our warehouse until {date}. Track here: {track_url}',
    ar: 'شحنتك #{code} محفوظة بأمان في مستودعنا حتى موعد {date}. للتتبع: {track_url}',
  },
}

/** Pure string interpolation of template keys. */
export function renderTemplate(
  template: MessageTemplate,
  lang: MessageLang = 'en',
  params: Record<string, string | number>
): string {
  const dictionary = MESSAGE_TEMPLATES[template] || MESSAGE_TEMPLATES.order_created
  let text = dictionary[lang] || dictionary.en

  for (const [key, value] of Object.entries(params)) {
    text = text.replaceAll(`{${key}}`, String(value ?? ''))
  }

  return text
}

/** Mock / Simulated provider when external WhatsApp API credentials are not configured. */
export class SimulatedMessagingProvider implements MessagingProvider {
  name = 'simulated'
  async send(_payload: MessagePayload, _bodyText: string) {
    return { success: true, id: 'sim-' + crypto.randomUUID() }
  }
}

/** WhatsApp Cloud API provider using Meta Graph API. */
export class WhatsAppCloudProvider implements MessagingProvider {
  name = 'whatsapp_cloud'

  constructor(
    private token: string,
    private phoneNumberId: string
  ) {}

  async send(payload: MessagePayload, bodyText: string) {
    const cleaned = cleanPhone(payload.toPhone).replace(/^\+/, '')
    const recipient = cleaned.startsWith('961') ? cleaned : `961${cleaned.replace(/^0/, '')}`

    try {
      const res = await fetch(`https://graph.facebook.com/v21.0/${this.phoneNumberId}/messages`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: recipient,
          type: 'text',
          text: { preview_url: true, body: bodyText },
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        return { success: false, error: data?.error?.message || 'WhatsApp Cloud API error' }
      }

      const msgId = data?.messages?.[0]?.id
      return { success: true, id: msgId }
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : 'Network error' }
    }
  }
}

/** Resolves appropriate provider and logs message asynchronously. */
export async function dispatchCustomerNotification(payload: MessagePayload): Promise<{
  success: boolean
  logId?: string
  error?: string
}> {
  const db = createServiceClient()
  const lang: MessageLang = payload.lang || (payload.toPhone.startsWith('+961') ? 'ar' : 'en')
  const bodyText = renderTemplate(payload.template, lang, payload.params)

  // Fetch workspace notification settings
  const { data: ws } = await db
    .from('workspaces')
    .select(
      'notify_order_created, notify_out_for_delivery, notify_delivered, notify_failed_attempt, notify_held, whatsapp_cloud_token, whatsapp_phone_number_id'
    )
    .eq('id', payload.workspaceId)
    .single()

  // Check if this event notification is enabled
  const flagKey: Record<MessageTemplate, string> = {
    order_created: 'notify_order_created',
    out_for_delivery: 'notify_out_for_delivery',
    delivered: 'notify_delivered',
    failed_attempt: 'notify_failed_attempt',
    held: 'notify_held',
  }

  const isEnabled = ws ? (ws as any)[flagKey[payload.template]] ?? true : true
  if (!isEnabled) {
    return { success: true }
  }

  const token = ws?.whatsapp_cloud_token || process.env.WHATSAPP_API_TOKEN
  const phoneId = ws?.whatsapp_phone_number_id || process.env.WHATSAPP_PHONE_NUMBER_ID

  const provider: MessagingProvider =
    token && phoneId
      ? new WhatsAppCloudProvider(token, phoneId)
      : new SimulatedMessagingProvider()

  const result = await provider.send(payload, bodyText)

  // Record to message_log table
  try {
    const { data: logId } = await db.rpc('log_customer_message', {
      p_workspace_id: payload.workspaceId,
      p_order_id: (payload.orderId || undefined) as any,
      p_channel: 'whatsapp',
      p_template: payload.template,
      p_to_phone: formatLebanesePhone(payload.toPhone) || payload.toPhone,
      p_body: bodyText,
      p_status: result.success ? 'sent' : 'failed',
      p_error: result.error || undefined,
    })

    return { success: result.success, logId: logId || undefined, error: result.error }
  } catch (err: unknown) {
    console.warn('Could not log customer message:', err)
    return { success: result.success, error: result.error }
  }
}
