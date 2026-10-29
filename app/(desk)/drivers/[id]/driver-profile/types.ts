import type { UserRole } from '@/lib/roles'

export interface Driver {
  id: string
  workspace_id: string
  name: string
  phone: string | null
  active: boolean
  cash_held_usd: number
  cash_held_lbp?: number
  pay_owed_usd: number
  user_id: string | null
  created_at?: string
  /** 'fixed' keeps the zone rate on each order; 'percent' pays a share of the fee (Phase 6). */
  pay_mode?: string
  pay_percent?: number | null
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
  shop?: { id: string; name: string; phone: string | null } | null
  area?: { id: string; name: string } | null
}

export interface SettlementItem {
  id: string
  type: 'driver_cash_remittance' | 'driver_pay' | 'shop_payment'
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

export interface DriverProfileClientProps {
  driver: Driver
  initialOrders: OrderItem[]
  initialSettlements: SettlementItem[]
  workspace: Workspace
  userRole: UserRole
}
