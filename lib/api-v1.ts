import { NextRequest, NextResponse } from 'next/server'
import { ApiError } from './api'
import { bearerKey, hashApiKey } from './api-keys'
import { createServiceClient } from './supabase/server'
import { rateLimit } from './rate-limit'
import { siteUrl } from './shopify-security'

// The shop API (/api/v1). A shop sends "Authorization: Bearer <key>"; the key identifies exactly one shop, and every
// route below can only see and change that shop's own orders. Errors always look like
// { error: { code, message }, requestId } so a client can switch on the code.

export const V1_REQUESTS_PER_MINUTE = 120

const CODES: Record<number, string> = {
  400: 'invalid_request', 401: 'unauthorized', 403: 'forbidden', 404: 'not_found', 409: 'conflict', 413: 'too_large', 429: 'rate_limited',
}

export class V1Error extends ApiError {
  constructor(status: number, public code: string, message: string, public extra: Record<string, unknown> = {}) { super(status, message) }
}

export interface V1Context {
  db: ReturnType<typeof createServiceClient>
  keyId: string
  workspaceId: string
  shop: { id: string; name: string }
}

async function authenticate(req: NextRequest): Promise<V1Context> {
  const key = bearerKey(req.headers.get('authorization'))
  if (!key) throw new V1Error(401, 'unauthorized', 'Send your API key as "Authorization: Bearer <key>".')
  const db = createServiceClient()
  const { data: row } = await db.from('shop_api_keys').select('id, shop_id, workspace_id, revoked_at, last_used_at').eq('key_hash', hashApiKey(key)).maybeSingle()
  if (!row || row.revoked_at) throw new V1Error(401, 'unauthorized', 'This API key is not valid. It may have been revoked.')
  await rateLimit('v1:' + row.id, V1_REQUESTS_PER_MINUTE)
  const { data: shop } = await db.from('shops').select('id, name, active').eq('id', row.shop_id).maybeSingle()
  if (!shop || !shop.active) throw new V1Error(403, 'forbidden', 'This shop is not active.')
  // Show "last used" in the portal without a write on every call
  const staleBefore = new Date(Date.now() - 60_000).toISOString()
  if (!row.last_used_at || row.last_used_at < staleBefore) {
    await db.from('shop_api_keys').update({ last_used_at: new Date().toISOString() }).eq('id', row.id)
  }
  return { db, keyId: row.id, workspaceId: row.workspace_id, shop: { id: shop.id, name: shop.name } }
}

export function apiV1<A extends unknown[]>(handler: (ctx: V1Context, req: NextRequest, ...args: A) => Promise<Response>) {
  return async (req: NextRequest, ...args: A) => {
    const requestId = crypto.randomUUID()
    try {
      if (Number(req.headers.get('content-length') || 0) > 200_000) throw new V1Error(413, 'too_large', 'The request body is too large.')
      const response = await handler(await authenticate(req), req, ...args)
      response.headers.set('Cache-Control', 'no-store')
      response.headers.set('X-Request-Id', requestId)
      return response
    } catch (error) {
      const status = error instanceof ApiError ? error.status : error instanceof SyntaxError ? 400 : 500
      if (status === 500) console.error('API v1 request failed', { requestId, error })
      const code = error instanceof V1Error ? error.code : CODES[status] ?? 'internal_error'
      const message = status === 500 ? 'Request failed. Contact support with the request ID.' : error instanceof SyntaxError ? 'The request body is not valid JSON.' : (error as Error).message
      const headers: Record<string, string> = { 'Cache-Control': 'no-store', 'X-Request-Id': requestId }
      if (status === 429) headers['Retry-After'] = '60'
      return NextResponse.json({ error: { code, message, ...(error instanceof V1Error ? error.extra : {}) }, requestId }, { status, headers })
    }
  }
}

/** Columns the API reads for an order. */
export const V1_ORDER_SELECT =
  'id, code, external_ref, status, area_id, collection_usd, delivery_fee_usd, recipient_name, recipient_phone, recipient_address, service_type, weight_kg, is_breakable, notes, time_slot, tracking_token, created_at, updated_at, delivered_at'

type OrderRow = {
  code: string; external_ref: string | null; status: string; area_id: string | null; collection_usd: number; delivery_fee_usd: number
  recipient_name: string | null; recipient_phone: string | null; recipient_address: string | null; service_type: string; weight_kg: number
  is_breakable: boolean; notes: string | null; time_slot: string | null; tracking_token: string; created_at: string; updated_at: string; delivered_at: string | null
}

/** What the API shows of an order. Courier pay, internal accounting and other shops' data never appear here. */
export function orderView(order: OrderRow) {
  let base: string | null = null
  try { base = siteUrl() } catch { /* tracking link is left out when the site address is not configured */ }
  return {
    code: order.code,
    reference: order.external_ref,
    status: order.status,
    trackingUrl: base ? `${base}/track/${order.tracking_token}` : null,
    zoneId: order.area_id,
    recipient: { name: order.recipient_name, phone: order.recipient_phone, address: order.recipient_address },
    codUsd: Number(order.collection_usd),
    deliveryFeeUsd: Number(order.delivery_fee_usd),
    serviceType: order.service_type,
    weightKg: Number(order.weight_kg),
    isBreakable: order.is_breakable,
    timeSlot: order.time_slot,
    notes: order.notes,
    createdAt: order.created_at,
    updatedAt: order.updated_at,
    deliveredAt: order.delivered_at,
  }
}
