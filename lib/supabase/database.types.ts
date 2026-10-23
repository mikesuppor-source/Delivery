export type Json = string | number | boolean | null | { [key: string]: Json } | Json[]

export type Database = {
  public: {
    Tables: {
      workspaces: {
        Row: {
          id: string
          name: string
          slug: string
          currency: string
          usd_to_lbp: number
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          slug: string
          currency?: string
          usd_to_lbp?: number
          created_at?: string
        }
        Update: {
          name?: string
          slug?: string
          currency?: string
          usd_to_lbp?: number
        }
      }
      workspace_members: {
        Row: {
          id: string
          workspace_id: string
          user_id: string
          role: UserRole
          display_name: string | null
          invited_by: string | null
          joined_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          workspace_id: string
          user_id: string
          role?: UserRole
          display_name?: string | null
          invited_by?: string | null
          joined_at?: string | null
        }
        Update: {
          role?: UserRole
          display_name?: string | null
          joined_at?: string | null
        }
      }
      invitations: {
        Row: {
          id: string
          workspace_id: string
          email: string
          role: UserRole
          token: string
          invited_by: string
          accepted_at: string | null
          expires_at: string
          created_at: string
        }
        Insert: {
          id?: string
          workspace_id: string
          email: string
          role?: UserRole
          token?: string
          invited_by: string
          accepted_at?: string | null
          expires_at?: string
        }
        Update: {
          accepted_at?: string | null
          role?: UserRole
        }
      }
      delivery_areas: {
        Row: {
          id: string
          workspace_id: string
          name: string
          fee_usd: number
          active: boolean
          created_at: string
        }
        Insert: {
          id?: string
          workspace_id: string
          name: string
          fee_usd?: number
          active?: boolean
        }
        Update: {
          name?: string
          fee_usd?: number
          active?: boolean
        }
      }
      shops: {
        Row: {
          id: string
          workspace_id: string
          name: string
          phone: string | null
          address: string | null
          active: boolean
          balance_usd: number
          created_at: string
        }
        Insert: {
          id?: string
          workspace_id: string
          name: string
          phone?: string | null
          address?: string | null
          active?: boolean
          balance_usd?: number
        }
        Update: {
          name?: string
          phone?: string | null
          address?: string | null
          active?: boolean
          balance_usd?: number
        }
      }
      drivers: {
        Row: {
          id: string
          workspace_id: string
          user_id: string | null
          name: string
          phone: string | null
          active: boolean
          cash_held_usd: number
          pay_owed_usd: number
          created_at: string
        }
        Insert: {
          id?: string
          workspace_id: string
          user_id?: string | null
          name: string
          phone?: string | null
          active?: boolean
          cash_held_usd?: number
          pay_owed_usd?: number
        }
        Update: {
          user_id?: string | null
          name?: string
          phone?: string | null
          active?: boolean
          cash_held_usd?: number
          pay_owed_usd?: number
        }
      }
      orders: {
        Row: {
          id: string
          workspace_id: string
          code: string
          shop_id: string | null
          driver_id: string | null
          area_id: string | null
          status: OrderStatus
          usd_to_lbp_rate: number
          collection_usd: number
          delivery_fee_usd: number
          driver_pay_usd: number
          shop_balance_usd: number
          notes: string | null
          recipient_name: string | null
          recipient_phone: string | null
          recipient_address: string | null
          created_by: string | null
          created_at: string
          updated_at: string
          delivered_at: string | null
        }
        Insert: {
          id?: string
          workspace_id: string
          code?: string
          shop_id?: string | null
          driver_id?: string | null
          area_id?: string | null
          status?: OrderStatus
          usd_to_lbp_rate: number
          collection_usd?: number
          delivery_fee_usd?: number
          driver_pay_usd?: number
          shop_balance_usd?: number
          notes?: string | null
          recipient_name?: string | null
          recipient_phone?: string | null
          recipient_address?: string | null
          created_by?: string | null
        }
        Update: {
          shop_id?: string | null
          driver_id?: string | null
          area_id?: string | null
          status?: OrderStatus
          notes?: string | null
          recipient_name?: string | null
          recipient_phone?: string | null
          recipient_address?: string | null
          delivered_at?: string | null
        }
      }
      settlements: {
        Row: {
          id: string
          workspace_id: string
          type: SettlementType
          amount_usd: number
          usd_to_lbp: number
          shop_id: string | null
          driver_id: string | null
          order_id: string | null
          note: string | null
          created_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          workspace_id: string
          type: SettlementType
          amount_usd: number
          usd_to_lbp: number
          shop_id?: string | null
          driver_id?: string | null
          order_id?: string | null
          note?: string | null
          created_by?: string | null
        }
        Update: never
      }
      audit_log: {
        Row: {
          id: string
          workspace_id: string
          actor_id: string | null
          actor_email: string | null
          action: string
          entity_type: string | null
          entity_id: string | null
          diff: Json | null
          created_at: string
        }
        Insert: {
          id?: string
          workspace_id: string
          actor_id?: string | null
          actor_email?: string | null
          action: string
          entity_type?: string | null
          entity_id?: string | null
          diff?: Json | null
        }
        Update: never
      }
    }
    Enums: {
      user_role: UserRole
      order_status: OrderStatus
      settlement_type: SettlementType
    }
  }
}

export type UserRole = 'owner' | 'manager' | 'driver' | 'readonly'
export type OrderStatus = 'pending' | 'assigned' | 'picked_up' | 'delivered' | 'failed' | 'returned'
export type SettlementType = 'shop_payment' | 'driver_cash_remittance' | 'driver_pay'

// Shorthand row types
export type Workspace = Database['public']['Tables']['workspaces']['Row']
export type WorkspaceMember = Database['public']['Tables']['workspace_members']['Row']
export type Invitation = Database['public']['Tables']['invitations']['Row']
export type DeliveryArea = Database['public']['Tables']['delivery_areas']['Row']
export type Shop = Database['public']['Tables']['shops']['Row']
export type Driver = Database['public']['Tables']['drivers']['Row']
export type Order = Database['public']['Tables']['orders']['Row']
export type Settlement = Database['public']['Tables']['settlements']['Row']
export type AuditLog = Database['public']['Tables']['audit_log']['Row']
