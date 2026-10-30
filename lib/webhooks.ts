import http from 'node:http'
import https from 'node:https'
import dns from 'node:dns'
import { isIP } from 'node:net'
import { createServiceClient } from './supabase/server'
import { signWebhook } from './webhook-signature'
import { isPrivateAddress, validateWebhookUrl } from './webhook-url'

// Sends the queued webhook messages (see migration 033). The database hands out the messages that are due and
// schedules each retry; this file only makes the request and reports what happened.

export interface WebhookJob {
  id: string
  event: string
  payload: unknown
  created_at: string
  url: string
  secret: string
}

type Lookup = (hostname: string, options: dns.LookupOptions, callback: (err: NodeJS.ErrnoException | null, address: string | dns.LookupAddress[], family?: number) => void) => void

export const WEBHOOK_TIMEOUT_MS = 10_000

/** The exact text that is sent, and signed. */
export function webhookBody(job: Pick<WebhookJob, 'id' | 'event' | 'payload' | 'created_at'>) {
  return JSON.stringify({ id: job.id, event: job.event, createdAt: job.created_at, data: job.payload })
}

/**
 * One POST. The address is checked again at the moment of connecting (on the address the name really resolves to),
 * so a name that points somewhere private, or changes after it was checked, cannot reach our internal network.
 * Redirects are never followed.
 */
export function postWebhook(
  url: string,
  body: string,
  headers: Record<string, string>,
  { allowLocal = false, timeoutMs = WEBHOOK_TIMEOUT_MS, lookup = dns.lookup as unknown as Lookup }: { allowLocal?: boolean; timeoutMs?: number; lookup?: Lookup } = {},
) {
  return new Promise<{ status: number }>((resolve, reject) => {
    const target = new URL(url)
    const safeLookup: Lookup = (hostname, options, callback) => {
      lookup(hostname, { ...options, all: true }, (err, addresses) => {
        if (err) return callback(err, '')
        const list = Array.isArray(addresses) ? addresses : [{ address: String(addresses), family: isIP(String(addresses)) }]
        const loopback = (a: string) => a === '::1' || a.startsWith('127.')
        const blocked = list.find(a => isPrivateAddress(a.address) && !(allowLocal && loopback(a.address)))
        if (blocked || !list.length) return callback(new Error('The webhook address points to a private network'), '')
        if (options && (options as { all?: boolean }).all) return callback(null, list)
        return callback(null, list[0].address, list[0].family)
      })
    }
    const request = (target.protocol === 'https:' ? https : http).request(target, {
      method: 'POST',
      headers: { ...headers, 'Content-Length': String(Buffer.byteLength(body)) },
      lookup: safeLookup as never,
      timeout: timeoutMs,
    }, res => {
      res.resume() // the reply body is not needed
      res.on('end', () => resolve({ status: res.statusCode ?? 0 }))
      res.on('error', reject)
    })
    request.on('timeout', () => request.destroy(new Error('Timed out after ' + timeoutMs / 1000 + ' seconds')))
    request.on('error', reject)
    request.end(body)
  })
}

/** Sends one message. Never throws: the answer says whether it counts as delivered (any 2xx). */
export async function sendWebhook(job: WebhookJob, options: { allowLocal?: boolean; timeoutMs?: number; lookup?: Lookup; nowSeconds?: number } = {}) {
  try {
    const url = validateWebhookUrl(job.url, { allowLocal: options.allowLocal })
    const body = webhookBody(job)
    const { status } = await postWebhook(url, body, {
      'Content-Type': 'application/json',
      'User-Agent': 'Cedar-Webhooks/1.0',
      'X-Cedar-Event': job.event,
      'X-Cedar-Delivery': job.id,
      'X-Cedar-Signature': signWebhook(job.secret, body, options.nowSeconds ?? Math.floor(Date.now() / 1000)),
    }, options)
    return status >= 200 && status < 300 ? { ok: true as const, status, error: null } : { ok: false as const, status, error: `The receiver answered ${status}` }
  } catch (error) {
    return { ok: false as const, status: null, error: (error as Error).message.slice(0, 300) }
  }
}

/** Claims the messages that are due, sends them, and reports each result to the database. */
export async function processWebhookQueue(limit = 25) {
  const db = createServiceClient()
  const { data, error } = await db.rpc('claim_webhook_deliveries', { p_limit: limit })
  if (error) throw new Error('Could not read the webhook queue')
  const allowLocal = process.env.WEBHOOK_ALLOW_LOCAL === '1' && process.env.NODE_ENV !== 'production'
  let delivered = 0, failed = 0
  await Promise.all((data ?? []).map(async job => {
    const result = await sendWebhook(job as WebhookJob, { allowLocal })
    await db.rpc('complete_webhook_delivery', { p_id: job.id, p_ok: result.ok, p_status: result.status as number, p_error: result.error as string })
    if (result.ok) delivered++; else failed++
  }))
  return { claimed: data?.length ?? 0, delivered, failed }
}
