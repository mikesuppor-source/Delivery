import { parseLocation, getLebanonAreaCoordinates } from '@/lib/maps'

export interface DriverRunSheetOrder {
  id: string
  code: string
  tracking_token?: string
  status: 'pending' | 'assigned' | 'picked_up' | 'delivered' | 'failed' | 'returned'
  service_type?: 'delivery' | 'replacement' | 'pickup'
  weight_kg?: number
  is_breakable?: boolean
  carrier_tracking_code?: string | null
  collection_usd: number
  delivery_fee_usd: number
  driver_pay_usd: number
  shop_balance_usd: number
  usd_to_lbp_rate: number
  created_at: string
  delivered_at?: string | null
  notes?: string | null
  recipient_name: string | null
  recipient_phone: string | null
  recipient_address: string | null
  location_lat?: number | null
  location_lng?: number | null
  route_position?: number | null
  received_at_hub?: string | null
  returns_handed_at?: string | null
  shop?: { id: string; name: string; phone?: string | null } | null
  area?: { id: string; name: string } | null
  pod_signature?: string | null
  pod_photo?: string | null
  pod_collected_lbp?: number | null
}

export interface DriverPickup {
  id: string
  workspace_id: string
  shop_id: string
  driver_id: string | null
  status: 'requested' | 'assigned' | 'collected' | 'cancelled'
  requested_at: string
  collected_at?: string | null
  parcel_count: number
  note?: string | null
  proof_photo_path?: string | null
  shop?: { id: string; name: string; phone?: string | null; address?: string | null } | null
}

export interface DriverInfo {
  id: string
  name: string
  phone?: string | null
  cash_held_usd?: number
  pay_owed_usd?: number
  active: boolean
}

export interface OfflineSyncItem {
  id: string
  orderId: string
  orderCode: string
  status: DriverRunSheetOrder['status']
  payload: {
    orderId: string
    driverId: string
    status: DriverRunSheetOrder['status']
    notes?: string
    podSignature?: string | null
    podPhoto?: string | null
    podCollectedUsd?: number | null
    podCollectedLbp?: number | null
    failureReason?: string
  }
  timestamp: number
}

export interface RunSheetProps {
  driver: DriverInfo
  initialOrders: DriverRunSheetOrder[]
  initialPickups?: DriverPickup[]
  rate: number
  workspaceName: string
}

export function resolveOrderCoordinates(order: DriverRunSheetOrder): { lat: number; lng: number } | null {
  if (order.location_lat != null && order.location_lng != null) {
    const lat = Number(order.location_lat)
    const lng = Number(order.location_lng)
    if (!isNaN(lat) && !isNaN(lng)) return { lat, lng }
  }
  const parsed = parseLocation(order.recipient_address)
  if (parsed.isCoords && parsed.lat && parsed.lng) {
    return { lat: parsed.lat, lng: parsed.lng }
  }
  const areaCoords = getLebanonAreaCoordinates(order.area?.name) || getLebanonAreaCoordinates(order.recipient_address)
  if (areaCoords) return areaCoords
  return null
}

export const LEBANON_QUICK_CITIES = [
  { name: 'Beirut (Central)', lat: 33.8938, lng: 35.5018 },
  { name: 'Metn / Sin El Fil', lat: 33.8860, lng: 35.5683 },
  { name: 'Baabda / Hadath', lat: 33.8333, lng: 35.5333 },
  { name: 'Jounieh / Keserwan', lat: 33.9808, lng: 35.6178 },
  { name: 'Jbeil / Byblos', lat: 34.1226, lng: 35.6517 },
  { name: 'Tripoli / North', lat: 34.4367, lng: 35.8497 },
  { name: 'Saida / Sidon', lat: 33.5631, lng: 35.3689 },
  { name: 'Sour / Tyre', lat: 33.2733, lng: 35.1939 },
  { name: 'Zahlé / Bekaa', lat: 33.8463, lng: 35.9020 },
  { name: 'Chouf / Aley', lat: 33.8058, lng: 35.6025 },
]

// Comes from the hosting settings only (see lib/push.ts); empty means background alerts are not set up
export const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || ''

export function urlB64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

// A phone that registered for alerts with an older signing key can no longer receive them; compare to know
export function sameServerKey(current: ArrayBufferLike | null | undefined, wanted: Uint8Array) {
  if (!current) return true // not reported by this browser: leave the registration alone
  const have = new Uint8Array(current)
  return have.length === wanted.length && have.every((byte, i) => byte === wanted[i])
}
