import { createServiceClient } from './supabase/server'
import { cleanPhone, formatLebanesePhone } from './phone'
import { META_TEMPLATES, templateMessage } from './whatsapp-templates'

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

/** The message texts with named placeholders ({code}), taken from the approved WhatsApp templates so the two never differ. */
export const MESSAGE_TEMPLATES: Record<MessageTemplate, { en: string; ar: string }> = Object.fromEntries(
  (Object.keys(META_TEMPLATES) as MessageTemplate[]).map(key => {
    const { params, en, ar } = META_TEMPLATES[key]
    const named = (text: string) => text.replace(/\{\{(\d+)\}\}/g, (_, n) => `{${params[Number(n) - 1]}}`).replace(/ \./g, '.')
    return [key, { en: named(en), ar: named(ar) }]
  })
) as Record<MessageTemplate, { en: string; ar: string }>

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

/** WhatsApp Cloud API provider using Meta Graph API. Business-started messages must be approved templates. */
export class WhatsAppCloudProvider implements MessagingProvider {
  name = 'whatsapp_cloud'

  constructor(
    private token: string,
    private phoneNumberId: string,
    private fetcher: typeof fetch = fetch
  ) {}

  async send(payload: MessagePayload, _bodyText: string) {
    const cleaned = cleanPhone(payload.toPhone).replace(/^\+/, '')
    const recipient = cleaned.startsWith('961') ? cleaned : `961${cleaned.replace(/^0/, '')}`

    try {
      const res = await this.fetcher(`https://graph.facebook.com/v21.0/${this.phoneNumberId}/messages`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(templateMessage(recipient, payload.template, payload.lang ?? 'en', payload.params)),
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
  /** True when the message was not sent because this kind of message is switched off for the company. */
  skipped?: boolean
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
    return { success: true, skipped: true }
  }

  const token = ws?.whatsapp_cloud_token || process.env.WHATSAPP_API_TOKEN
  const phoneId = ws?.whatsapp_phone_number_id || process.env.WHATSAPP_PHONE_NUMBER_ID

  const provider: MessagingProvider =
    token && phoneId
      ? new WhatsAppCloudProvider(token, phoneId)
      : new SimulatedMessagingProvider()

  const result = await provider.send({ ...payload, lang }, bodyText)

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
