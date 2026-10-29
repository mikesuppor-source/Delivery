import type { UserRole, OrderStatus } from '@/lib/roles'

export interface Order {
  id: string
  code: string
  tracking_token?: string
  status: OrderStatus
  service_type?: 'delivery' | 'replacement' | 'pickup'
  weight_kg?: number
  is_breakable?: boolean
  carrier_name?: string | null
  carrier_tracking_code?: string | null
  destination_governorate?: string | null
  destination_caza?: string | null
  destination_town?: string | null
  collection_usd: number
  delivery_fee_usd: number
  driver_pay_usd: number
  shop_balance_usd: number
  usd_to_lbp_rate: number
  recipient_name: string | null
  recipient_phone: string | null
  recipient_address: string | null
  notes?: string | null
  shopify_order_id?: string | null
  shopify_order_number?: string | null
  is_held?: boolean
  hub_id?: string | null
  storage_fee_usd?: number
  received_at_hub?: string | null
  route_position?: number | null
  returns_handed_at?: string | null
  returns_signature_path?: string | null
  created_at: string
  shop: { id: string; name: string; phone?: string | null } | null
  driver: { id: string; name: string; phone?: string | null } | null
  area: { id: string; name: string } | null
}

export interface Shop {
  id: string
  name: string
}

export interface Driver {
  id: string
  name: string
  phone?: string | null
}

export interface DeliveryArea {
  id: string
  name: string
  fee_usd: number
}

export interface OrderListClientProps {
  orders: Order[]
  shops: Shop[]
  drivers: Driver[]
  areas: DeliveryArea[]
  workspaceId: string
  userRole: UserRole
  rate: number
}
