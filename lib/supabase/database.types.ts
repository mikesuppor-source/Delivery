export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      shop_integrations: {
        Row: {
          shop_id: string
          api_key: string
          access_token: string | null
          updated_at: string
        }
        Insert: {
          shop_id?: string
          api_key?: string
          access_token?: string | null
          updated_at?: string
        }
        Update: {
          shop_id?: string
          api_key?: string
          access_token?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      oauth_states: {
        Row: {
          nonce: string
          user_id: string
          shop_id: string
          domain: string
          expires_at: string
        }
        Insert: {
          nonce?: string
          user_id?: string
          shop_id?: string
          domain?: string
          expires_at?: string
        }
        Update: {
          nonce?: string
          user_id?: string
          shop_id?: string
          domain?: string
          expires_at?: string
        }
        Relationships: []
      }
      order_events: {
        Row: {
          id: string
          workspace_id: string
          order_id: string
          old_status: string | null
          new_status: string
          created_at: string
        }
        Insert: {
          id?: string
          workspace_id?: string
          order_id?: string
          old_status?: string | null
          new_status?: string
          created_at?: string
        }
        Update: {
          id?: string
          workspace_id?: string
          order_id?: string
          old_status?: string | null
          new_status?: string
          created_at?: string
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          action: string
          actor_email: string | null
          actor_id: string | null
          created_at: string
          diff: Json | null
          entity_id: string | null
          entity_type: string | null
          id: string
          workspace_id: string
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_id?: string | null
          created_at?: string
          diff?: Json | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          workspace_id: string
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_id?: string | null
          created_at?: string
          diff?: Json | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_areas: {
        Row: {
          active: boolean
          created_at: string
          default_driver_id: string | null
          fee_usd: number
          id: string
          name: string
          workspace_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          default_driver_id?: string | null
          fee_usd?: number
          id?: string
          name: string
          workspace_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          default_driver_id?: string | null
          fee_usd?: number
          id?: string
          name?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_areas_default_driver_id_fkey"
            columns: ["default_driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_areas_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      drivers: {
        Row: {
          cash_held_lbp: number
          active: boolean
          cash_held_usd: number
          created_at: string
          id: string
          name: string
          pay_owed_usd: number
          phone: string | null
          user_id: string | null
          workspace_id: string
        }
        Insert: {
          cash_held_lbp?: number
          active?: boolean
          cash_held_usd?: number
          created_at?: string
          id?: string
          name: string
          pay_owed_usd?: number
          phone?: string | null
          user_id?: string | null
          workspace_id: string
        }
        Update: {
          cash_held_lbp?: number
          active?: boolean
          cash_held_usd?: number
          created_at?: string
          id?: string
          name?: string
          pay_owed_usd?: number
          phone?: string | null
          user_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "drivers_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      invitations: {
        Row: {
          accepted_at: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string
          role: Database["public"]["Enums"]["user_role"]
          token: string
          workspace_id: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by: string
          role?: Database["public"]["Enums"]["user_role"]
          token?: string
          workspace_id: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string
          role?: Database["public"]["Enums"]["user_role"]
          token?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invitations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          tracking_token: string
          pod_collected_usd: number | null
          cash_discrepancy_usd: number | null
          location_lat: number | null
          location_lng: number | null
          area_id: string | null
          code: string
          collection_usd: number
          created_at: string
          created_by: string | null
          delivered_at: string | null
          delivery_fee_usd: number
          driver_id: string | null
          driver_pay_usd: number
          id: string
          notes: string | null
          pod_collected_lbp: number | null
          pod_photo: string | null
          pod_signature: string | null
          recipient_address: string | null
          recipient_name: string | null
          recipient_phone: string | null
          shop_balance_usd: number
          shop_id: string | null
          shopify_order_id: string | null
          shopify_order_number: string | null
          status: Database["public"]["Enums"]["order_status"]
          updated_at: string
          usd_to_lbp_rate: number
          workspace_id: string
        }
        Insert: {
          tracking_token?: string
          pod_collected_usd?: number | null
          cash_discrepancy_usd?: number | null
          location_lat?: number | null
          location_lng?: number | null
          area_id?: string | null
          code?: string
          collection_usd?: number
          created_at?: string
          created_by?: string | null
          delivered_at?: string | null
          delivery_fee_usd?: number
          driver_id?: string | null
          driver_pay_usd?: number
          id?: string
          notes?: string | null
          pod_collected_lbp?: number | null
          pod_photo?: string | null
          pod_signature?: string | null
          recipient_address?: string | null
          recipient_name?: string | null
          recipient_phone?: string | null
          shop_balance_usd?: number
          shop_id?: string | null
          shopify_order_id?: string | null
          shopify_order_number?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          updated_at?: string
          usd_to_lbp_rate: number
          workspace_id: string
        }
        Update: {
          tracking_token?: string
          pod_collected_usd?: number | null
          cash_discrepancy_usd?: number | null
          location_lat?: number | null
          location_lng?: number | null
          area_id?: string | null
          code?: string
          collection_usd?: number
          created_at?: string
          created_by?: string | null
          delivered_at?: string | null
          delivery_fee_usd?: number
          driver_id?: string | null
          driver_pay_usd?: number
          id?: string
          notes?: string | null
          pod_collected_lbp?: number | null
          pod_photo?: string | null
          pod_signature?: string | null
          recipient_address?: string | null
          recipient_name?: string | null
          recipient_phone?: string | null
          shop_balance_usd?: number
          shop_id?: string | null
          shopify_order_id?: string | null
          shopify_order_number?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          updated_at?: string
          usd_to_lbp_rate?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "delivery_areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      settlements: {
        Row: {
          idempotency_key: string | null
          amount_lbp: number
          amount_usd: number
          created_at: string
          created_by: string | null
          driver_id: string | null
          id: string
          note: string | null
          order_id: string | null
          shop_id: string | null
          type: Database["public"]["Enums"]["settlement_type"]
          usd_to_lbp: number
          workspace_id: string
        }
        Insert: {
          idempotency_key?: string | null
          amount_lbp?: number
          amount_usd: number
          created_at?: string
          created_by?: string | null
          driver_id?: string | null
          id?: string
          note?: string | null
          order_id?: string | null
          shop_id?: string | null
          type: Database["public"]["Enums"]["settlement_type"]
          usd_to_lbp: number
          workspace_id: string
        }
        Update: {
          idempotency_key?: string | null
          amount_lbp?: number
          amount_usd?: number
          created_at?: string
          created_by?: string | null
          driver_id?: string | null
          id?: string
          note?: string | null
          order_id?: string | null
          shop_id?: string | null
          type?: Database["public"]["Enums"]["settlement_type"]
          usd_to_lbp?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "settlements_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settlements_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settlements_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settlements_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      shops: {
        Row: {
          active: boolean
          address: string | null
          balance_usd: number
          created_at: string
          id: string
          name: string
          phone: string | null
          prefix: string | null
          shopify_domain: string | null
          user_id: string | null
          workspace_id: string
        }
        Insert: {
          active?: boolean
          address?: string | null
          balance_usd?: number
          created_at?: string
          id?: string
          name: string
          phone?: string | null
          prefix?: string | null
          shopify_domain?: string | null
          user_id?: string | null
          workspace_id: string
        }
        Update: {
          active?: boolean
          address?: string | null
          balance_usd?: number
          created_at?: string
          id?: string
          name?: string
          phone?: string | null
          prefix?: string | null
          shopify_domain?: string | null
          user_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shops_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_members: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
          invited_by: string | null
          joined_at: string | null
          role: Database["public"]["Enums"]["user_role"]
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id?: string
          invited_by?: string | null
          joined_at?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
          invited_by?: string | null
          joined_at?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_members_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspaces: {
        Row: {
          created_at: string
          currency: string
          id: string
          name: string
          slug: string
          usd_to_lbp: number
        }
        Insert: {
          created_at?: string
          currency?: string
          id?: string
          name: string
          slug: string
          usd_to_lbp?: number
        }
        Update: {
          created_at?: string
          currency?: string
          id?: string
          name?: string
          slug?: string
          usd_to_lbp?: number
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_staff_invite: { Args: { p_token: string; p_user: string; p_email: string; p_name: string }; Returns: boolean }
      consume_limit: { Args: { p_key: string; p_max: number }; Returns: boolean }
      is_member: { Args: { ws_id: string }; Returns: boolean }
      my_role: {
        Args: { ws_id: string }
        Returns: Database["public"]["Enums"]["user_role"]
      }
    }
    Enums: {
      order_status:
        | "pending"
        | "assigned"
        | "picked_up"
        | "delivered"
        | "failed"
        | "returned" | "cancelled"
      settlement_type: "shop_payment" | "driver_cash_remittance" | "driver_pay"
      user_role: "owner" | "manager" | "driver" | "readonly"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      order_status: [
        "pending",
        "assigned",
        "picked_up",
        "delivered",
        "failed",
        "returned",
        "cancelled",
      ],
      settlement_type: ["shop_payment", "driver_cash_remittance", "driver_pay"],
      user_role: ["owner", "manager", "driver", "readonly"],
    },
  },
} as const
