import type { SupabaseClient } from '@supabase/supabase-js'
import { ApiError } from './api'
import { calculateDistanceKm, parseLocation } from './maps'

/** Why a courier could not get the customer's code. A photo is required with any of these. */
export const FALLBACK_REASONS = ['not_present', 'no_phone', 'refused_code', 'other'] as const
export type FallbackReason = (typeof FALLBACK_REASONS)[number]

/** A delivery marked further than this from the address pin is flagged for the owner (metres). */
export const FAR_FROM_ADDRESS_M = 300

export type CodeResult = { result: 'ok' | 'wrong' | 'locked' | 'none'; triesLeft: number }

export interface ProofInput {
  /** The order has a customer delivery code. Orders from before codes existed do not, and keep the old rules. */
  hasCode: boolean
  /** What the check said, when the courier typed or scanned a code. */
  codeResult: CodeResult | null
  fallback: { reason: FallbackReason; hasPhoto: boolean } | null
  /** The courier marked this while offline; the code could not be checked at the door. */
  queuedOffline: boolean
  /** Metres between the courier and the address pin, when both are known. */
  distanceM: number | null
  courierHadLocation: boolean
}

export type ProofDecision =
  | { allow: false; error: string }
  | { allow: true; method: 'code' | 'fallback' | 'legacy'; flags: string[] }

/** The rules for accepting a delivery. Pure, so every case is tested. */
export function decideProof(input: ProofInput): ProofDecision {
  const flags: string[] = []
  if (input.courierHadLocation && input.distanceM !== null && input.distanceM > FAR_FROM_ADDRESS_M) flags.push('far_from_address')
  if (!input.courierHadLocation && input.hasCode) flags.push('no_location')
  if (!input.hasCode) return { allow: true, method: 'legacy', flags }

  if (input.codeResult?.result === 'ok') return { allow: true, method: 'code', flags }

  if (input.queuedOffline && input.codeResult) return { allow: true, method: 'fallback', flags: ['unverified_code', ...flags] }

  if (input.fallback) {
    if (!input.fallback.hasPhoto) return { allow: false, error: 'Take a photo of the parcel at the door. It is required when the customer cannot give the code.' }
    return { allow: true, method: 'fallback', flags: [input.codeResult ? 'wrong_code' : 'no_code', ...flags] }
  }

  if (!input.codeResult) return { allow: false, error: 'Ask the customer for the delivery code on their tracking link, or choose "Customer cannot show the code".' }
  if (input.codeResult.result === 'locked') return { allow: false, error: 'Too many wrong codes. Choose "Customer cannot show the code" and take a photo.' }
  return { allow: false, error: `That code is wrong. ${input.codeResult.triesLeft} ${input.codeResult.triesLeft === 1 ? 'try' : 'tries'} left.` }
}

/** The address pin of an order: the location the customer shared, or coordinates written in the address. */
export function addressPin(order: { location_lat?: number | null; location_lng?: number | null; recipient_address?: string | null }): { lat: number; lng: number } | null {
  if (order.location_lat != null && order.location_lng != null) return { lat: Number(order.location_lat), lng: Number(order.location_lng) }
  const parsed = parseLocation(order.recipient_address ?? null)
  return parsed.isCoords && parsed.lat != null && parsed.lng != null ? { lat: parsed.lat, lng: parsed.lng } : null
}

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : null)

/**
 * Checks how a courier proves a delivery and returns the columns to store with it. Throws a plain-words error when the
 * delivery cannot be accepted yet (for example a wrong code). The code itself never leaves the database.
 */
export async function proveDelivery(
  db: SupabaseClient,
  order: { id: string; location_lat?: number | null; location_lng?: number | null; recipient_address?: string | null; pod_photo?: string | null },
  body: Record<string, unknown>,
) {
  const { data: row } = await db.from('order_delivery_codes').select('order_id').eq('order_id', order.id).maybeSingle()
  const hasCode = Boolean(row)

  let codeResult: CodeResult | null = null
  const typed = typeof body.deliveryCode === 'string' ? body.deliveryCode.trim() : ''
  if (hasCode && typed) {
    const { data, error } = await db.rpc('check_delivery_code', { p_order: order.id, p_code: typed.slice(0, 20) })
    if (error) throw new ApiError(500, 'Could not check the code')
    codeResult = data as CodeResult
  }

  const reason = FALLBACK_REASONS.find(r => r === body.proofFallbackReason)
  const fallback = reason ? { reason, hasPhoto: Boolean(body.podPhoto || order.pod_photo) } : null

  const lat = num(body.deliveryLat)
  const lng = num(body.deliveryLng)
  const courierHadLocation = lat !== null && lng !== null && Math.abs(lat) <= 90 && Math.abs(lng) <= 180
  const pin = addressPin(order)
  const distanceM = courierHadLocation && pin ? Math.round(calculateDistanceKm(lat!, lng!, pin.lat, pin.lng) * 1000) : null

  const decision = decideProof({ hasCode, codeResult, fallback, queuedOffline: num(body.queuedAt) !== null, distanceM, courierHadLocation })
  if (!decision.allow) throw new ApiError(400, decision.error)
  return {
    proof_method: decision.method,
    proof_flags: decision.flags,
    proof_reason: fallback?.reason ?? null,
    proof_lat: courierHadLocation ? lat : null,
    proof_lng: courierHadLocation ? lng : null,
    proof_distance_m: distanceM,
  }
}

/** Marks which open orders need the customer's delivery code. The code itself is never sent to the courier. */
export async function markCodeRequired<T extends { id: string; status: string }>(db: SupabaseClient, orders: T[]): Promise<Array<T & { code_required: boolean }>> {
  const open = orders.filter(o => !['delivered', 'returned', 'cancelled'].includes(o.status)).map(o => o.id)
  const withCode = new Set<string>()
  for (let i = 0; i < open.length; i += 100) {
    const { data } = await db.from('order_delivery_codes').select('order_id').in('order_id', open.slice(i, i + 100))
    for (const row of data ?? []) withCode.add(row.order_id)
  }
  return orders.map(o => ({ ...o, code_required: withCode.has(o.id) }))
}
