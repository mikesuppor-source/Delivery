import type { OrderStatus } from '@/lib/roles'

export interface Shop {
  id: string
  name: string
  phone: string | null
  address: string | null
  balance_usd: number
  prefix: string | null
  api_key?: string | null
  shopify_domain?: string | null
  workspace_id?: string | null
}

export interface DeliveryArea {
  id: string
  name: string
  fee_usd: number
}

export interface PortalOrder {
  id: string
  code: string
  tracking_token?: string
  status: OrderStatus
  service_type?: 'delivery' | 'replacement' | 'pickup'
  weight_kg?: number
  is_breakable?: boolean
  carrier_tracking_code?: string | null
  collection_usd: number
  delivery_fee_usd: number
  shop_balance_usd: number
  usd_to_lbp_rate: number
  created_at: string
  delivered_at?: string | null
  notes?: string | null
  recipient_name: string | null
  recipient_phone: string | null
  recipient_address: string | null
  area: { id: string; name: string; fee_usd: number } | null
  driver: { id: string; name: string; phone?: string | null } | null
  shopify_order_id?: string | null
  shopify_order_number?: string | null
}

export interface PortalClientProps {
  shop: Shop
  initialOrders: PortalOrder[]
  areas: DeliveryArea[]
  specialPrices?: Array<{ area_id: string; fee_usd: number }>
  rate: number
  workspaceName: string
}
