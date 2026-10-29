import type { UserRole } from '@/lib/roles'

export interface Shop {
  id: string
  workspace_id: string
  name: string
  phone: string | null
  address: string | null
  active: boolean
  balance_usd: number
  created_at?: string
  api_key?: string | null
  shopify_domain?: string | null
  /** How the shop is paid: cash, whish, omt or bank (Phase 6). */
  payout_method?: string
  payout_account?: string | null
}

export interface OrderItem {
  id: string
  code: string
  tracking_token?: string
  status: string
  collection_usd: number
  delivery_fee_usd: number
  driver_pay_usd: number
  shop_balance_usd: number
  usd_to_lbp_rate: number
  created_at: string
  recipient_name: string | null
  recipient_phone: string | null
  recipient_address: string | null
  notes: string | null
  driver?: { id: string; name: string; phone: string | null } | null
  area?: { id: string; name: string } | null
  shopify_order_id?: string | null
  shopify_order_number?: string | null
}

export interface SettlementItem {
  id: string
  type: string
  amount_usd: number
  usd_to_lbp: number
  note: string | null
  created_at: string
  created_by?: string | null
}

export interface Workspace {
  id: string
  name: string
  usd_to_lbp: number
}

export interface DeliveryAreaItem {
  id: string
  name: string
  fee_usd: number
}

export interface SpecialPriceItem {
  area_id: string
  fee_usd: number
}

export interface ShopProfileClientProps {
  shop: Shop
  initialOrders: OrderItem[]
  initialSettlements: SettlementItem[]
  areas?: DeliveryAreaItem[]
  initialSpecialPrices?: SpecialPriceItem[]
  workspace: Workspace
  userRole: UserRole
}
