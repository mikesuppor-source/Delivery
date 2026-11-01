import { createHmac, timingSafeEqual } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'

/** A phone number as digits only, with the country code: "+961 71 123 456" and "71123456" both become "96171123456". */
export function phoneKey(raw: string): string {
  const digits = String(raw ?? '').replace(/\D/g, '').replace(/^00/, '')
  if (digits.startsWith('961')) return digits
  if (digits.startsWith('0') && digits.length >= 8 && digits.length <= 9) return '961' + digits.slice(1)
  if (digits.length === 8 && /^(3|70|71|76|78|79|81|1|4|5|6|7|8|9)/.test(digits)) return '961' + digits
  if (digits.length === 7 && /^[1-9]/.test(digits)) return '961' + digits
  return digits
}

/** Meta signs every webhook with the app secret: header `X-Hub-Signature-256: sha256=<hex of HMAC-SHA256(body)>`. */
export function verifyMetaSignature(raw: string, header: string | null, appSecret: string): boolean {
  const match = /^sha256=([0-9a-f]{64})$/i.exec(header ?? '')
  if (!match || !appSecret) return false
  const expected = createHmac('sha256', appSecret).update(raw).digest()
  const supplied = Buffer.from(match[1], 'hex')
  return expected.length === supplied.length && timingSafeEqual(expected, supplied)
}

/** The check Meta makes when the webhook is saved: it sends hub.mode, hub.verify_token and hub.challenge. */
export function verifyChallenge(params: URLSearchParams, verifyToken: string): string | null {
  if (!verifyToken || params.get('hub.mode') !== 'subscribe') return null
  const supplied = Buffer.from(params.get('hub.verify_token') ?? '')
  const expected = Buffer.from(verifyToken)
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return null
  return params.get('hub.challenge')
}

export interface StatusEvent { providerId: string; status: 'sent' | 'delivered' | 'read' | 'failed'; phoneNumberId: string; error?: string; at: Date }
export interface InboundEvent { from: string; providerId: string; text: string; phoneNumberId: string; at: Date }

interface MetaChange {
  value?: {
    metadata?: { phone_number_id?: string }
    statuses?: Array<{ id?: string; status?: string; timestamp?: string; errors?: Array<{ title?: string; message?: string; code?: number }> }>
    messages?: Array<{ id?: string; from?: string; timestamp?: string; type?: string; text?: { body?: string }; button?: { text?: string } }>
  }
}

const seconds = (t?: string) => new Date(Number(t) > 0 ? Number(t) * 1000 : Date.now())

/** Picks the delivery receipts and customer replies out of a Meta webhook body. Anything else is ignored. */
export function parseWebhook(body: unknown): { statuses: StatusEvent[]; inbound: InboundEvent[] } {
  const statuses: StatusEvent[] = []
  const inbound: InboundEvent[] = []
  const entries = (body as { object?: string; entry?: Array<{ changes?: MetaChange[] }> } | null)
  if (entries?.object !== 'whatsapp_business_account') return { statuses, inbound }
  for (const entry of entries.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value
      const phoneNumberId = value?.metadata?.phone_number_id ?? ''
      for (const s of value?.statuses ?? []) {
        if (!s.id || !['sent', 'delivered', 'read', 'failed'].includes(s.status ?? '')) continue
        const first = s.errors?.[0]
        statuses.push({
          providerId: s.id, status: s.status as StatusEvent['status'], phoneNumberId, at: seconds(s.timestamp),
          error: first ? [first.title, first.message].filter(Boolean).join(': ').slice(0, 300) || 'Delivery failed' : undefined,
        })
      }
      for (const m of value?.messages ?? []) {
        if (!m.id || !m.from) continue
        inbound.push({ from: m.from, providerId: m.id, phoneNumberId, at: seconds(m.timestamp), text: (m.text?.body ?? m.button?.text ?? '').slice(0, 1000) })
      }
    }
  }
  return { statuses, inbound }
}

const STOP_WORDS = ['stop', 'unsubscribe', 'cancel', 'end', 'quit', 'optout', 'opt out', 'ايقاف', 'إيقاف', 'توقف', 'الغاء', 'إلغاء', 'الغاء الاشتراك', 'إلغاء الاشتراك']
const START_WORDS = ['start', 'subscribe', 'unstop', 'resume', 'استئناف', 'ابدأ', 'اشترك']
const normalize = (text: string) => text.trim().toLowerCase().replace(/[.!؟?،,]+$/g, '').trim()

/** A reply that is only a stop word asks us to stop messaging that number; only a start word asks us to start again. */
export function replyIntent(text: string): 'stop' | 'start' | null {
  const t = normalize(text)
  if (STOP_WORDS.includes(t)) return 'stop'
  if (START_WORDS.includes(t)) return 'start'
  return null
}

/** The status a receipt may move a message to: forward only (sent, delivered, read), but a failure always shows. */
const RANK: Record<string, number> = { pending: 0, sent: 1, delivered: 2, read: 3 }
export const canMoveTo = (current: string, next: StatusEvent['status']) => next === 'failed' ? current !== 'failed' : (RANK[next] ?? 0) > (RANK[current] ?? 99)

/** Finds the company a message belongs to: the one whose WhatsApp number it arrived on. */
export async function workspaceFor(db: SupabaseClient, phoneNumberId: string, envPhoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID): Promise<string | null> {
  if (!phoneNumberId) return null
  const { data } = await db.from('workspaces').select('id').eq('whatsapp_phone_number_id', phoneNumberId).limit(1).maybeSingle()
  if (data) return data.id
  if (envPhoneNumberId && envPhoneNumberId === phoneNumberId) {
    const { data: first } = await db.from('workspaces').select('id').order('created_at').limit(1).maybeSingle()
    return first?.id ?? null
  }
  return null
}

/** Applies what Meta reported: updates each message's delivery state, stores replies, and honours STOP and START. */
export async function applyWebhook(db: SupabaseClient, body: unknown) {
  const { statuses, inbound } = parseWebhook(body)
  const result = { statuses: 0, replies: 0, optedOut: 0, optedIn: 0 }

  for (const s of statuses) {
    const { data: row } = await db.from('message_log').select('id, status').eq('provider_message_id', s.providerId).maybeSingle()
    if (!row || !canMoveTo(row.status, s.status)) continue
    const patch: Record<string, unknown> = { status: s.status }
    if (s.status === 'delivered') patch.delivered_at = s.at.toISOString()
    if (s.status === 'read') { patch.read_at = s.at.toISOString(); patch.delivered_at = s.at.toISOString() }
    if (s.status === 'failed') patch.error = s.error ?? 'Delivery failed'
    await db.from('message_log').update(patch).eq('id', row.id)
    result.statuses++
  }

  for (const m of inbound) {
    const workspaceId = await workspaceFor(db, m.phoneNumberId)
    if (!workspaceId) continue
    const phone = phoneKey(m.from)
    // WhatsApp may deliver the same message twice: the log keeps it once
    const { data: known } = await db.from('message_log').select('id').eq('provider_message_id', m.providerId).maybeSingle()
    if (known) continue
    await db.from('message_log').insert({
      workspace_id: workspaceId, channel: 'whatsapp', template: 'customer_reply', to_phone: '+' + phone, body: m.text,
      status: 'received', direction: 'in', provider_message_id: m.providerId,
    })
    result.replies++
    const intent = replyIntent(m.text)
    if (intent === 'stop') {
      await db.from('customer_opt_outs').upsert({ workspace_id: workspaceId, phone }, { onConflict: 'workspace_id,phone', ignoreDuplicates: true })
      result.optedOut++
    } else if (intent === 'start') {
      await db.from('customer_opt_outs').delete().eq('workspace_id', workspaceId).eq('phone', phone)
      result.optedIn++
    }
  }
  return result
}
