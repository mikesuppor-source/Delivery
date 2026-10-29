
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "driver_bonus_rules": {
                  Row: {
                    "active": boolean,"bonus_usd": number,"created_at": string,"id": string,"min_deliveries": number,"name": string,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"bonus_usd": number,"created_at"?: string,"id"?: string,"min_deliveries": number,"name": string,"workspace_id": string
                  }
                  Update: {
                    "active"?: boolean,"bonus_usd"?: number,"created_at"?: string,"id"?: string,"min_deliveries"?: number,"name"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "driver_bonus_rules_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"driver_bonuses": {
                  Row: {
                    "bonus_usd": number,"created_at": string,"deliveries_count": number,"driver_id": string,"id": string,"note": string | null,"rule_id": string | null,"week_start": string,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "bonus_usd": number,"created_at"?: string,"deliveries_count": number,"driver_id": string,"id"?: string,"note"?: string | null,"rule_id"?: string | null,"week_start": string,"workspace_id": string
                  }
                  Update: {
                    "bonus_usd"?: number,"created_at"?: string,"deliveries_count"?: number,"driver_id"?: string,"id"?: string,"note"?: string | null,"rule_id"?: string | null,"week_start"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "driver_bonus_driver_tenant"
      columns: ["driver_id"]
isOneToOne: false
      referencedRelation: "drivers"
      referencedColumns: ["id"]
    },
                    {
      foreignKeyName: "driver_bonuses_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"exchange_rates": {
                  Row: {
                    "id": string,"rate": number,"set_at": string,"set_by": string | null,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "id"?: string,"rate": number,"set_at"?: string,"set_by"?: string | null,"workspace_id": string
                  }
                  Update: {
                    "id"?: string,"rate"?: number,"set_at"?: string,"set_by"?: string | null,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "exchange_rates_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"expenses": {
                  Row: {
                    "amount_lbp": number,"amount_usd": number,"category": string,"created_at": string,"created_by": string | null,"date": string,"id": string,"note": string | null,"receipt_path": string | null,"usd_to_lbp": number,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_lbp"?: number,"amount_usd"?: number,"category": string,"created_at"?: string,"created_by"?: string | null,"date"?: string,"id"?: string,"note"?: string | null,"receipt_path"?: string | null,"usd_to_lbp"?: number,"workspace_id": string
                  }
                  Update: {
                    "amount_lbp"?: number,"amount_usd"?: number,"category"?: string,"created_at"?: string,"created_by"?: string | null,"date"?: string,"id"?: string,"note"?: string | null,"receipt_path"?: string | null,"usd_to_lbp"?: number,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "expenses_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"payout_runs": {
                  Row: {
                    "created_at": string,"created_by": string | null,"id": string,"idempotency_key": string,"item_count": number,"payload_hash": string,"total_amount_usd": number,"type": string,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: string,"idempotency_key": string,"item_count"?: number,"payload_hash": string,"total_amount_usd"?: number,"type": string,"workspace_id": string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: string,"idempotency_key"?: string,"item_count"?: number,"payload_hash"?: string,"total_amount_usd"?: number,"type"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "payout_runs_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },            "audit_log": {
                  Row: {
                    "action": string,"actor_email": string | null,"actor_id": string | null,"created_at": string,"diff": Json | null,"entity_id": string | null,"entity_type": string | null,"id": string,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"actor_email"?: string | null,"actor_id"?: string | null,"created_at"?: string,"diff"?: Json | null,"entity_id"?: string | null,"entity_type"?: string | null,"id"?: string,"workspace_id": string
                  }
                  Update: {
                    "action"?: string,"actor_email"?: string | null,"actor_id"?: string | null,"created_at"?: string,"diff"?: Json | null,"entity_id"?: string | null,"entity_type"?: string | null,"id"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "audit_log_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"cashout_requests": {
                  Row: {
                    "account_details": string,"amount_lbp": number,"amount_usd": number,"created_at": string,"id": string,"method": string,"notes": string | null,"processed_at": string | null,"processed_by": string | null,"shop_id": string,"status": Database["public"]['Enums']["cashout_status"],"updated_at": string,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "account_details": string,"amount_lbp"?: number,"amount_usd"?: number,"created_at"?: string,"id"?: string,"method"?: string,"notes"?: string | null,"processed_at"?: string | null,"processed_by"?: string | null,"shop_id": string,"status"?: Database["public"]['Enums']["cashout_status"],"updated_at"?: string,"workspace_id": string
                  }
                  Update: {
                    "account_details"?: string,"amount_lbp"?: number,"amount_usd"?: number,"created_at"?: string,"id"?: string,"method"?: string,"notes"?: string | null,"processed_at"?: string | null,"processed_by"?: string | null,"shop_id"?: string,"status"?: Database["public"]['Enums']["cashout_status"],"updated_at"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "cashout_requests_shop_id_fkey"
      columns: ["shop_id"]
isOneToOne: false
      referencedRelation: "shops"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "cashout_requests_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"customers": {
                  Row: {
                    "address": string | null,"caza": string | null,"created_at": string,"governorate": string | null,"id": string,"last_order_at": string | null,"name": string,"notes": string | null,"orders_count": number,"phone": string,"town": string | null,"updated_at": string,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "address"?: string | null,"caza"?: string | null,"created_at"?: string,"governorate"?: string | null,"id"?: string,"last_order_at"?: string | null,"name": string,"notes"?: string | null,"orders_count"?: number,"phone": string,"town"?: string | null,"updated_at"?: string,"workspace_id": string
                  }
                  Update: {
                    "address"?: string | null,"caza"?: string | null,"created_at"?: string,"governorate"?: string | null,"id"?: string,"last_order_at"?: string | null,"name"?: string,"notes"?: string | null,"orders_count"?: number,"phone"?: string,"town"?: string | null,"updated_at"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "customers_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"delivery_areas": {
                  Row: {
                    "active": boolean,"assigned_driver_ids": (string)[],"created_at": string,"default_driver_id": string | null,"driver_pay_usd": number | null,"fee_usd": number,"free_storage_days": number,"id": string,"name": string,"return_driver_pay_usd": number,"return_fee_usd": number,"storage_fee_per_day_usd": number,"time_slots": (string)[] | null,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"assigned_driver_ids"?: (string)[],"created_at"?: string,"default_driver_id"?: string | null,"driver_pay_usd"?: number | null,"fee_usd"?: number,"free_storage_days"?: number,"id"?: string,"name": string,"return_driver_pay_usd"?: number,"return_fee_usd"?: number,"storage_fee_per_day_usd"?: number,"time_slots"?: (string)[] | null,"workspace_id": string
                  }
                  Update: {
                    "active"?: boolean,"assigned_driver_ids"?: (string)[],"created_at"?: string,"default_driver_id"?: string | null,"driver_pay_usd"?: number | null,"fee_usd"?: number,"free_storage_days"?: number,"id"?: string,"name"?: string,"return_driver_pay_usd"?: number,"return_fee_usd"?: number,"storage_fee_per_day_usd"?: number,"time_slots"?: (string)[] | null,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "area_driver_tenant"
      columns: ["default_driver_id","workspace_id"]
isOneToOne: false
      referencedRelation: "drivers"
      referencedColumns: ["id","workspace_id"]
    },{
      foreignKeyName: "delivery_areas_default_driver_id_fkey"
      columns: ["default_driver_id"]
isOneToOne: false
      referencedRelation: "drivers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "delivery_areas_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"delivery_attempts": {
                  Row: {
                    "attempt_no": number,"created_at": string,"driver_id": string | null,"id": string,"lat": number | null,"lng": number | null,"note": string | null,"order_id": string,"photo_path": string | null,"rescheduled_for": string | null,"result": Database["public"]['Enums']["attempt_result"],"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "attempt_no": number,"created_at"?: string,"driver_id"?: string | null,"id"?: string,"lat"?: number | null,"lng"?: number | null,"note"?: string | null,"order_id": string,"photo_path"?: string | null,"rescheduled_for"?: string | null,"result": Database["public"]['Enums']["attempt_result"],"workspace_id": string
                  }
                  Update: {
                    "attempt_no"?: number,"created_at"?: string,"driver_id"?: string | null,"id"?: string,"lat"?: number | null,"lng"?: number | null,"note"?: string | null,"order_id"?: string,"photo_path"?: string | null,"rescheduled_for"?: string | null,"result"?: Database["public"]['Enums']["attempt_result"],"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "delivery_attempts_driver_id_fkey"
      columns: ["driver_id"]
isOneToOne: false
      referencedRelation: "drivers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "delivery_attempts_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "delivery_attempts_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"driver_credentials": {
                  Row: {
                    "driver_id": string,"pin_hash": string,"session_version": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "driver_id": string,"pin_hash": string,"session_version"?: number,"updated_at"?: string
                  }
                  Update: {
                    "driver_id"?: string,"pin_hash"?: string,"session_version"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "driver_credentials_driver_id_fkey"
      columns: ["driver_id"]
isOneToOne: true
      referencedRelation: "drivers"
      referencedColumns: ["id"]
    }
                  ]
                },"driver_push_subscriptions": {
                  Row: {
                    "auth": string,"created_at": string,"driver_id": string,"endpoint": string,"id": string,"last_used_at": string,"p256dh": string,"user_agent": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "auth": string,"created_at"?: string,"driver_id": string,"endpoint": string,"id"?: string,"last_used_at"?: string,"p256dh": string,"user_agent"?: string | null
                  }
                  Update: {
                    "auth"?: string,"created_at"?: string,"driver_id"?: string,"endpoint"?: string,"id"?: string,"last_used_at"?: string,"p256dh"?: string,"user_agent"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "driver_push_subscriptions_driver_id_fkey"
      columns: ["driver_id"]
isOneToOne: false
      referencedRelation: "drivers"
      referencedColumns: ["id"]
    }
                  ]
                },"drivers": {
                  Row: {
                    "active": boolean,"cash_held_lbp": number,"cash_held_usd": number,"created_at": string,"current_lat": number | null,"current_lng": number | null,"id": string,"last_location_at": string | null,"name": string,"pay_owed_usd": number,"phone": string | null,"user_id": string | null,"workspace_id": string,"pay_mode": string,"pay_percent": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"cash_held_lbp"?: number,"cash_held_usd"?: number,"created_at"?: string,"current_lat"?: number | null,"current_lng"?: number | null,"id"?: string,"last_location_at"?: string | null,"name": string,"pay_owed_usd"?: number,"phone"?: string | null,"user_id"?: string | null,"workspace_id": string,"pay_mode"?: string,"pay_percent"?: number | null
                  }
                  Update: {
                    "active"?: boolean,"cash_held_lbp"?: number,"cash_held_usd"?: number,"created_at"?: string,"current_lat"?: number | null,"current_lng"?: number | null,"id"?: string,"last_location_at"?: string | null,"name"?: string,"pay_owed_usd"?: number,"phone"?: string | null,"user_id"?: string | null,"workspace_id"?: string,"pay_mode"?: string,"pay_percent"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "drivers_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"hub_shelves": {
                  Row: {
                    "code": string,"created_at": string,"hub_id": string,"id": string,"workspace_id": string,"zone_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "code": string,"created_at"?: string,"hub_id": string,"id"?: string,"workspace_id": string,"zone_id"?: string | null
                  }
                  Update: {
                    "code"?: string,"created_at"?: string,"hub_id"?: string,"id"?: string,"workspace_id"?: string,"zone_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "hub_shelves_hub_id_workspace_id_fkey"
      columns: ["hub_id","workspace_id"]
isOneToOne: false
      referencedRelation: "hubs"
      referencedColumns: ["id","workspace_id"]
    },{
      foreignKeyName: "hub_shelves_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "hub_shelves_zone_id_fkey"
      columns: ["zone_id"]
isOneToOne: false
      referencedRelation: "delivery_areas"
      referencedColumns: ["id"]
    }
                  ]
                },"hubs": {
                  Row: {
                    "active": boolean,"address": string | null,"created_at": string,"id": string,"is_default": boolean,"lat": number | null,"lng": number | null,"name": string,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"address"?: string | null,"created_at"?: string,"id"?: string,"is_default"?: boolean,"lat"?: number | null,"lng"?: number | null,"name": string,"workspace_id": string
                  }
                  Update: {
                    "active"?: boolean,"address"?: string | null,"created_at"?: string,"id"?: string,"is_default"?: boolean,"lat"?: number | null,"lng"?: number | null,"name"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "hubs_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"invitations": {
                  Row: {
                    "accepted_at": string | null,"created_at": string,"email": string,"expires_at": string,"id": string,"invited_by": string,"role": Database["public"]['Enums']["user_role"],"token": string,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "accepted_at"?: string | null,"created_at"?: string,"email": string,"expires_at"?: string,"id"?: string,"invited_by": string,"role"?: Database["public"]['Enums']["user_role"],"token"?: string,"workspace_id": string
                  }
                  Update: {
                    "accepted_at"?: string | null,"created_at"?: string,"email"?: string,"expires_at"?: string,"id"?: string,"invited_by"?: string,"role"?: Database["public"]['Enums']["user_role"],"token"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "invitations_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"message_log": {
                  Row: {
                    "body": string | null,"channel": string,"created_at": string,"error": string | null,"id": string,"order_id": string | null,"sent_at": string | null,"status": string,"template": string,"to_phone": string,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "body"?: string | null,"channel": string,"created_at"?: string,"error"?: string | null,"id"?: string,"order_id"?: string | null,"sent_at"?: string | null,"status"?: string,"template": string,"to_phone": string,"workspace_id": string
                  }
                  Update: {
                    "body"?: string | null,"channel"?: string,"created_at"?: string,"error"?: string | null,"id"?: string,"order_id"?: string | null,"sent_at"?: string | null,"status"?: string,"template"?: string,"to_phone"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "message_log_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "message_log_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"money_ledger": {
                  Row: {
                    "cash_delta": number,"created_at": string,"driver_id": string | null,"id": string,"lbp_delta": number,"order_id": string | null,"pay_delta": number,"reason": string,"settlement_id": string | null,"shop_delta": number,"shop_id": string | null,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "cash_delta"?: number,"created_at"?: string,"driver_id"?: string | null,"id"?: string,"lbp_delta"?: number,"order_id"?: string | null,"pay_delta"?: number,"reason": string,"settlement_id"?: string | null,"shop_delta"?: number,"shop_id"?: string | null,"workspace_id": string
                  }
                  Update: {
                    "cash_delta"?: number,"created_at"?: string,"driver_id"?: string | null,"id"?: string,"lbp_delta"?: number,"order_id"?: string | null,"pay_delta"?: number,"reason"?: string,"settlement_id"?: string | null,"shop_delta"?: number,"shop_id"?: string | null,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "money_ledger_driver_id_fkey"
      columns: ["driver_id"]
isOneToOne: false
      referencedRelation: "drivers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "money_ledger_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "money_ledger_settlement_id_fkey"
      columns: ["settlement_id"]
isOneToOne: false
      referencedRelation: "settlements"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "money_ledger_shop_id_fkey"
      columns: ["shop_id"]
isOneToOne: false
      referencedRelation: "shops"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "money_ledger_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"oauth_states": {
                  Row: {
                    "domain": string,"expires_at": string,"nonce": string,"shop_id": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "domain": string,"expires_at"?: string,"nonce": string,"shop_id": string,"user_id": string
                  }
                  Update: {
                    "domain"?: string,"expires_at"?: string,"nonce"?: string,"shop_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "oauth_states_shop_id_fkey"
      columns: ["shop_id"]
isOneToOne: false
      referencedRelation: "shops"
      referencedColumns: ["id"]
    }
                  ]
                },"order_events": {
                  Row: {
                    "created_at": string,"id": string,"new_status": Database["public"]['Enums']["order_status"],"old_status": Database["public"]['Enums']["order_status"] | null,"order_id": string,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"new_status": Database["public"]['Enums']["order_status"],"old_status"?: Database["public"]['Enums']["order_status"] | null,"order_id": string,"workspace_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"new_status"?: Database["public"]['Enums']["order_status"],"old_status"?: Database["public"]['Enums']["order_status"] | null,"order_id"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "order_events_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "order_events_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"order_holds": {
                  Row: {
                    "deliver_after": string | null,"held_at": string,"held_by": string | null,"hub_id": string,"id": string,"note": string | null,"order_id": string,"reason": Database["public"]['Enums']["hold_reason"],"release_note": string | null,"released_at": string | null,"released_by": string | null,"shelf_code": string | null,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "deliver_after"?: string | null,"held_at"?: string,"held_by"?: string | null,"hub_id": string,"id"?: string,"note"?: string | null,"order_id": string,"reason": Database["public"]['Enums']["hold_reason"],"release_note"?: string | null,"released_at"?: string | null,"released_by"?: string | null,"shelf_code"?: string | null,"workspace_id": string
                  }
                  Update: {
                    "deliver_after"?: string | null,"held_at"?: string,"held_by"?: string | null,"hub_id"?: string,"id"?: string,"note"?: string | null,"order_id"?: string,"reason"?: Database["public"]['Enums']["hold_reason"],"release_note"?: string | null,"released_at"?: string | null,"released_by"?: string | null,"shelf_code"?: string | null,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "order_holds_hub_id_fkey"
      columns: ["hub_id"]
isOneToOne: false
      referencedRelation: "hubs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "order_holds_hub_id_workspace_id_fkey"
      columns: ["hub_id","workspace_id"]
isOneToOne: false
      referencedRelation: "hubs"
      referencedColumns: ["id","workspace_id"]
    },{
      foreignKeyName: "order_holds_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "order_holds_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"order_ratings": {
                  Row: {
                    "comment": string | null,"created_at": string,"driver_id": string | null,"id": string,"order_id": string,"rating": number,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "comment"?: string | null,"created_at"?: string,"driver_id"?: string | null,"id"?: string,"order_id": string,"rating": number,"workspace_id": string
                  }
                  Update: {
                    "comment"?: string | null,"created_at"?: string,"driver_id"?: string | null,"id"?: string,"order_id"?: string,"rating"?: number,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "order_ratings_driver_id_fkey"
      columns: ["driver_id"]
isOneToOne: false
      referencedRelation: "drivers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "order_ratings_order_id_fkey"
      columns: ["order_id"]
isOneToOne: true
      referencedRelation: "orders"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "order_ratings_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"orders": {
                  Row: {
                    "accounting_version": number,"area_id": string | null,"carrier_name": string | null,"carrier_tracking_code": string | null,"cash_discrepancy_usd": number | null,"code": string,"collection_usd": number,"created_at": string,"created_by": string | null,"declared_value_usd": number | null,"delivered_at": string | null,"delivery_fee_usd": number,"destination_caza": string | null,"destination_governorate": string | null,"destination_town": string | null,"driver_id": string | null,"driver_pay_usd": number,"hub_id": string | null,"id": string,"is_breakable": boolean,"is_held": boolean,"location_lat": number | null,"location_lng": number | null,"notes": string | null,"payment_method": string,"pod_collected_lbp": number | null,"pod_collected_usd": number | null,"pod_photo": string | null,"pod_signature": string | null,"received_at_hub": string | null,"recipient_address": string | null,"recipient_name": string | null,"recipient_phone": string | null,"returns_handed_at": string | null,"returns_signature_path": string | null,"route_position": number | null,"sender_address": string | null,"sender_name": string | null,"sender_phone": string | null,"service_type": Database["public"]['Enums']["order_service_type"],"shop_balance_usd": number,"shop_id": string | null,"shopify_order_id": string | null,"shopify_order_number": string | null,"status": Database["public"]['Enums']["order_status"],"storage_fee_usd": number,"time_slot": string | null,"tracking_token": string,"updated_at": string,"usd_to_lbp_rate": number,"weight_kg": number,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "accounting_version"?: number,"area_id"?: string | null,"carrier_name"?: string | null,"carrier_tracking_code"?: string | null,"cash_discrepancy_usd"?: number | null,"code"?: string,"collection_usd"?: number,"created_at"?: string,"created_by"?: string | null,"declared_value_usd"?: number | null,"delivered_at"?: string | null,"delivery_fee_usd"?: number,"destination_caza"?: string | null,"destination_governorate"?: string | null,"destination_town"?: string | null,"driver_id"?: string | null,"driver_pay_usd"?: number,"hub_id"?: string | null,"id"?: string,"is_breakable"?: boolean,"is_held"?: boolean,"location_lat"?: number | null,"location_lng"?: number | null,"notes"?: string | null,"payment_method"?: string,"pod_collected_lbp"?: number | null,"pod_collected_usd"?: number | null,"pod_photo"?: string | null,"pod_signature"?: string | null,"received_at_hub"?: string | null,"recipient_address"?: string | null,"recipient_name"?: string | null,"recipient_phone"?: string | null,"returns_handed_at"?: string | null,"returns_signature_path"?: string | null,"route_position"?: number | null,"sender_address"?: string | null,"sender_name"?: string | null,"sender_phone"?: string | null,"service_type"?: Database["public"]['Enums']["order_service_type"],"shop_balance_usd"?: number,"shop_id"?: string | null,"shopify_order_id"?: string | null,"shopify_order_number"?: string | null,"status"?: Database["public"]['Enums']["order_status"],"storage_fee_usd"?: number,"time_slot"?: string | null,"tracking_token"?: string,"updated_at"?: string,"usd_to_lbp_rate": number,"weight_kg"?: number,"workspace_id": string
                  }
                  Update: {
                    "accounting_version"?: number,"area_id"?: string | null,"carrier_name"?: string | null,"carrier_tracking_code"?: string | null,"cash_discrepancy_usd"?: number | null,"code"?: string,"collection_usd"?: number,"created_at"?: string,"created_by"?: string | null,"declared_value_usd"?: number | null,"delivered_at"?: string | null,"delivery_fee_usd"?: number,"destination_caza"?: string | null,"destination_governorate"?: string | null,"destination_town"?: string | null,"driver_id"?: string | null,"driver_pay_usd"?: number,"hub_id"?: string | null,"id"?: string,"is_breakable"?: boolean,"is_held"?: boolean,"location_lat"?: number | null,"location_lng"?: number | null,"notes"?: string | null,"payment_method"?: string,"pod_collected_lbp"?: number | null,"pod_collected_usd"?: number | null,"pod_photo"?: string | null,"pod_signature"?: string | null,"received_at_hub"?: string | null,"recipient_address"?: string | null,"recipient_name"?: string | null,"recipient_phone"?: string | null,"returns_handed_at"?: string | null,"returns_signature_path"?: string | null,"route_position"?: number | null,"sender_address"?: string | null,"sender_name"?: string | null,"sender_phone"?: string | null,"service_type"?: Database["public"]['Enums']["order_service_type"],"shop_balance_usd"?: number,"shop_id"?: string | null,"shopify_order_id"?: string | null,"shopify_order_number"?: string | null,"status"?: Database["public"]['Enums']["order_status"],"storage_fee_usd"?: number,"time_slot"?: string | null,"tracking_token"?: string,"updated_at"?: string,"usd_to_lbp_rate"?: number,"weight_kg"?: number,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "order_area_tenant"
      columns: ["area_id","workspace_id"]
isOneToOne: false
      referencedRelation: "delivery_areas"
      referencedColumns: ["id","workspace_id"]
    },{
      foreignKeyName: "order_driver_tenant"
      columns: ["driver_id","workspace_id"]
isOneToOne: false
      referencedRelation: "drivers"
      referencedColumns: ["id","workspace_id"]
    },{
      foreignKeyName: "order_shop_tenant"
      columns: ["shop_id","workspace_id"]
isOneToOne: false
      referencedRelation: "shops"
      referencedColumns: ["id","workspace_id"]
    },{
      foreignKeyName: "orders_area_id_fkey"
      columns: ["area_id"]
isOneToOne: false
      referencedRelation: "delivery_areas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "orders_driver_id_fkey"
      columns: ["driver_id"]
isOneToOne: false
      referencedRelation: "drivers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "orders_hub_id_fkey"
      columns: ["hub_id"]
isOneToOne: false
      referencedRelation: "hubs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "orders_shop_id_fkey"
      columns: ["shop_id"]
isOneToOne: false
      referencedRelation: "shops"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "orders_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"pickup_orders": {
                  Row: {
                    "created_at": string,"order_id": string,"pickup_id": string,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"order_id": string,"pickup_id": string,"workspace_id": string
                  }
                  Update: {
                    "created_at"?: string,"order_id"?: string,"pickup_id"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "pickup_orders_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pickup_orders_pickup_id_fkey"
      columns: ["pickup_id"]
isOneToOne: false
      referencedRelation: "pickups"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pickup_orders_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"pickups": {
                  Row: {
                    "collected_at": string | null,"created_at": string,"driver_id": string | null,"id": string,"note": string | null,"parcel_count": number,"proof_photo_path": string | null,"requested_at": string,"shop_id": string,"status": Database["public"]['Enums']["pickup_status"],"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "collected_at"?: string | null,"created_at"?: string,"driver_id"?: string | null,"id"?: string,"note"?: string | null,"parcel_count"?: number,"proof_photo_path"?: string | null,"requested_at"?: string,"shop_id": string,"status"?: Database["public"]['Enums']["pickup_status"],"workspace_id": string
                  }
                  Update: {
                    "collected_at"?: string | null,"created_at"?: string,"driver_id"?: string | null,"id"?: string,"note"?: string | null,"parcel_count"?: number,"proof_photo_path"?: string | null,"requested_at"?: string,"shop_id"?: string,"status"?: Database["public"]['Enums']["pickup_status"],"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "pickups_driver_id_fkey"
      columns: ["driver_id"]
isOneToOne: false
      referencedRelation: "drivers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pickups_shop_id_fkey"
      columns: ["shop_id"]
isOneToOne: false
      referencedRelation: "shops"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pickups_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"request_limits": {
                  Row: {
                    "bucket": string,"hits": number,"key": string
                  }
                  ComputedFields: never
                  Insert: {
                    "bucket": string,"hits": number,"key": string
                  }
                  Update: {
                    "bucket"?: string,"hits"?: number,"key"?: string
                  }
                  Relationships: [
                    
                  ]
                },"saved_views": {
                  Row: {
                    "created_at": string,"filters": NonNullable<Json>,"id": string,"name": string,"page": string,"updated_at": string,"user_id": string,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"filters"?: NonNullable<Json>,"id"?: string,"name": string,"page": string,"updated_at"?: string,"user_id": string,"workspace_id": string
                  }
                  Update: {
                    "created_at"?: string,"filters"?: NonNullable<Json>,"id"?: string,"name"?: string,"page"?: string,"updated_at"?: string,"user_id"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "saved_views_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"settlements": {
                  Row: {
                    "amount_lbp": number,"amount_usd": number,"created_at": string,"created_by": string | null,"driver_id": string | null,"id": string,"idempotency_key": string | null,"note": string | null,"order_id": string | null,"shop_id": string | null,"type": Database["public"]['Enums']["settlement_type"],"usd_to_lbp": number,"workspace_id": string,"payout_run_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_lbp"?: number,"amount_usd": number,"created_at"?: string,"created_by"?: string | null,"driver_id"?: string | null,"id"?: string,"idempotency_key"?: string | null,"note"?: string | null,"order_id"?: string | null,"shop_id"?: string | null,"type": Database["public"]['Enums']["settlement_type"],"usd_to_lbp": number,"workspace_id": string,"payout_run_id"?: string | null
                  }
                  Update: {
                    "amount_lbp"?: number,"amount_usd"?: number,"created_at"?: string,"created_by"?: string | null,"driver_id"?: string | null,"id"?: string,"idempotency_key"?: string | null,"note"?: string | null,"order_id"?: string | null,"shop_id"?: string | null,"type"?: Database["public"]['Enums']["settlement_type"],"usd_to_lbp"?: number,"workspace_id"?: string,"payout_run_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "settlement_driver_tenant"
      columns: ["driver_id","workspace_id"]
isOneToOne: false
      referencedRelation: "drivers"
      referencedColumns: ["id","workspace_id"]
    },{
      foreignKeyName: "settlement_shop_tenant"
      columns: ["shop_id","workspace_id"]
isOneToOne: false
      referencedRelation: "shops"
      referencedColumns: ["id","workspace_id"]
    },{
      foreignKeyName: "settlements_driver_id_fkey"
      columns: ["driver_id"]
isOneToOne: false
      referencedRelation: "drivers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "settlements_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "settlements_shop_id_fkey"
      columns: ["shop_id"]
isOneToOne: false
      referencedRelation: "shops"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "settlements_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"shop_area_prices": {
                  Row: {
                    "area_id": string,"fee_usd": number,"shop_id": string,"updated_at": string,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "area_id": string,"fee_usd": number,"shop_id": string,"updated_at"?: string,"workspace_id": string
                  }
                  Update: {
                    "area_id"?: string,"fee_usd"?: number,"shop_id"?: string,"updated_at"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "shop_area_prices_area_id_workspace_id_fkey"
      columns: ["area_id","workspace_id"]
isOneToOne: false
      referencedRelation: "delivery_areas"
      referencedColumns: ["id","workspace_id"]
    },{
      foreignKeyName: "shop_area_prices_shop_id_workspace_id_fkey"
      columns: ["shop_id","workspace_id"]
isOneToOne: false
      referencedRelation: "shops"
      referencedColumns: ["id","workspace_id"]
    },{
      foreignKeyName: "shop_area_prices_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"shop_integrations": {
                  Row: {
                    "access_token": string | null,"api_key": string,"shop_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "access_token"?: string | null,"api_key"?: string,"shop_id": string,"updated_at"?: string
                  }
                  Update: {
                    "access_token"?: string | null,"api_key"?: string,"shop_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "shop_integrations_shop_id_fkey"
      columns: ["shop_id"]
isOneToOne: true
      referencedRelation: "shops"
      referencedColumns: ["id"]
    }
                  ]
                },"shops": {
                  Row: {
                    "active": boolean,"address": string | null,"balance_usd": number,"created_at": string,"id": string,"is_walkin": boolean,"name": string,"phone": string | null,"prefix": string | null,"shopify_domain": string | null,"user_id": string | null,"workspace_id": string,"payout_account": string | null,"payout_method": string
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"address"?: string | null,"balance_usd"?: number,"created_at"?: string,"id"?: string,"is_walkin"?: boolean,"name": string,"phone"?: string | null,"prefix"?: string | null,"shopify_domain"?: string | null,"user_id"?: string | null,"workspace_id": string,"payout_account"?: string | null,"payout_method"?: string
                  }
                  Update: {
                    "active"?: boolean,"address"?: string | null,"balance_usd"?: number,"created_at"?: string,"id"?: string,"is_walkin"?: boolean,"name"?: string,"phone"?: string | null,"prefix"?: string | null,"shopify_domain"?: string | null,"user_id"?: string | null,"workspace_id"?: string,"payout_account"?: string | null,"payout_method"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "shops_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"workspace_members": {
                  Row: {
                    "created_at": string,"display_name": string | null,"id": string,"invited_by": string | null,"joined_at": string | null,"role": Database["public"]['Enums']["user_role"],"user_id": string,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"display_name"?: string | null,"id"?: string,"invited_by"?: string | null,"joined_at"?: string | null,"role"?: Database["public"]['Enums']["user_role"],"user_id": string,"workspace_id": string
                  }
                  Update: {
                    "created_at"?: string,"display_name"?: string | null,"id"?: string,"invited_by"?: string | null,"joined_at"?: string | null,"role"?: Database["public"]['Enums']["user_role"],"user_id"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "workspace_members_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"workspaces": {
                  Row: {
                    "created_at": string,"currency": string,"default_delivery_fee_usd": number | null,"default_driver_pay_usd": number | null,"id": string,"max_delivery_attempts": number,"max_driver_load": number,"name": string,"notify_delivered": boolean,"notify_failed_attempt": boolean,"notify_held": boolean,"notify_order_created": boolean,"notify_out_for_delivery": boolean,"slug": string,"usd_to_lbp": number,"whatsapp_business_account_id": string | null,"whatsapp_cloud_token": string | null,"whatsapp_phone_number_id": string | null,"logo_url": string | null,"payout_days": string[],"payout_min_usd": number
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"currency"?: string,"default_delivery_fee_usd"?: number | null,"default_driver_pay_usd"?: number | null,"id"?: string,"max_delivery_attempts"?: number,"max_driver_load"?: number,"name": string,"notify_delivered"?: boolean,"notify_failed_attempt"?: boolean,"notify_held"?: boolean,"notify_order_created"?: boolean,"notify_out_for_delivery"?: boolean,"slug": string,"usd_to_lbp"?: number,"whatsapp_business_account_id"?: string | null,"whatsapp_cloud_token"?: string | null,"whatsapp_phone_number_id"?: string | null,"logo_url"?: string | null,"payout_days"?: string[],"payout_min_usd"?: number
                  }
                  Update: {
                    "created_at"?: string,"currency"?: string,"default_delivery_fee_usd"?: number | null,"default_driver_pay_usd"?: number | null,"id"?: string,"max_delivery_attempts"?: number,"max_driver_load"?: number,"name"?: string,"notify_delivered"?: boolean,"notify_failed_attempt"?: boolean,"notify_held"?: boolean,"notify_order_created"?: boolean,"notify_out_for_delivery"?: boolean,"slug"?: string,"usd_to_lbp"?: number,"whatsapp_business_account_id"?: string | null,"whatsapp_cloud_token"?: string | null,"whatsapp_phone_number_id"?: string | null,"logo_url"?: string | null,"payout_days"?: string[],"payout_min_usd"?: number
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
"apply_weekly_driver_bonuses":
{ Args: { "p_week_start": string,"p_workspace": string }; Returns: Json
                           },
"pnl_report":
{ Args: { "p_from": string,"p_to": string,"p_workspace": string }; Returns: Json
                           },
"run_driver_payouts":
{ Args: { "p_key": string,"p_payouts": Json,"p_user"?: string,"p_workspace": string }; Returns: Json
                           },
"run_shop_payouts":
{ Args: { "p_key": string,"p_payouts": Json,"p_user"?: string,"p_workspace": string }; Returns: Json
                           },
"set_workspace_rate":
{ Args: { "p_rate": number,"p_user": string,"p_workspace": string }; Returns: undefined
                           },
"shop_statement":
{ Args: { "p_from": string,"p_shop": string,"p_to": string,"p_workspace": string }; Returns: Json
                           },
            "accept_staff_invite":
{ Args: { "p_email": string,"p_name": string,"p_token": string,"p_user": string }; Returns: boolean
                           },
"collect_pickup":
{ Args: { "p_driver_id": string,"p_order_ids"?: (string)[],"p_pickup_id": string,"p_proof_photo_path"?: string }; Returns: Json
                           },
"consume_limit":
{ Args: { "p_key": string,"p_max": number }; Returns: boolean
                           },
"get_driver_rating_summary":
{ Args: { "p_driver_id": string }; Returns: Json
                           },
"get_or_create_walkin_shop":
{ Args: { "p_workspace_id": string }; Returns: string
                           },
"handover_returns":
{ Args: { "p_order_ids": (string)[],"p_shop_id": string,"p_signature_path"?: string }; Returns: Json
                           },
"hold_order":
{ Args: { "p_deliver_after"?: string,"p_hub": string,"p_note"?: string,"p_order": string,"p_reason": Database["public"]['Enums']["hold_reason"],"p_shelf": string,"p_user"?: string }; Returns: Json
                           },
"is_member":
{ Args: { "ws_id": string }; Returns: boolean
                           },
"log_customer_message":
{ Args: { "p_body": string,"p_channel": string,"p_error"?: string,"p_order_id": string,"p_status"?: string,"p_template": string,"p_to_phone": string,"p_workspace_id": string }; Returns: string
                           },
"mark_cashout_paid":
{ Args: { "p_request": string,"p_user": string,"p_workspace": string }; Returns: string
                           },
"mark_received_at_hub":
{ Args: { "p_order_id": string }; Returns: Json
                           },
"my_role":
{ Args: { "ws_id": string }; Returns: Database["public"]['Enums']["user_role"]
                           },
"phone_core":
{ Args: { "p_phone": string }; Returns: string
                           },
"profit_report":
{ Args: { "p_from": string,"p_to": string,"p_workspace": string }; Returns: Json
                           },
"record_delivery_attempt":
{ Args: { "p_driver_id": string,"p_lat"?: number,"p_lng"?: number,"p_note"?: string,"p_order_id": string,"p_photo_path"?: string,"p_rescheduled_for"?: string,"p_result": Database["public"]['Enums']["attempt_result"] }; Returns: Json
                           },
"release_order":
{ Args: { "p_note"?: string,"p_order": string,"p_user"?: string }; Returns: Json
                           },
"request_shop_cashout":
{ Args: { "p_amount": number,"p_details": string,"p_method": string,"p_notes": string,"p_shop": string }; Returns: {
              "account_details": string,
"amount_lbp": number,
"amount_usd": number,
"created_at": string,
"id": string,
"method": string,
"notes": string | null,
"processed_at": string | null,
"processed_by": string | null,
"shop_id": string,
"status": Database["public"]['Enums']["cashout_status"],
"updated_at": string,
"workspace_id": string
            }
                          SetofOptions: {
        from: "*"
        to: "cashout_requests"
        isOneToOne: true
        isSetofReturn: false
      } },
"set_allow_owner_delete":
{ Args: { "p_allow": boolean }; Returns: boolean
                           },
"set_driver_pin":
{ Args: { "p_driver": string,"p_pin": string }; Returns: boolean
                           },
"set_route_positions":
{ Args: { "p_driver_id": string,"p_positions": Json }; Returns: Json
                           },
"submit_order_rating":
{ Args: { "p_comment"?: string,"p_rating": number,"p_tracking_token": string }; Returns: Json
                           },
"track_orders_by_phone":
{ Args: { "p_phone": string }; Returns: Json
                           },
"verify_driver_login":
{ Args: { "p_phone": string,"p_pin": string }; Returns: {
              "driver_id": string,"name": string,"session_version": number
            }[]
                           }
          }
          Enums: {
            "attempt_result": "delivered"|"no_answer"|"refused"|"wrong_address"|"rescheduled"|"closed"|"other","cashout_status": "pending"|"approved"|"rejected"|"paid","hold_reason": "weather"|"far_zone"|"customer_request"|"scheduled"|"address_problem"|"shop_request"|"other","order_service_type": "delivery"|"replacement"|"pickup","order_status": "pending"|"assigned"|"picked_up"|"delivered"|"failed"|"returned"|"cancelled","pickup_status": "requested"|"assigned"|"collected"|"cancelled","settlement_type": "shop_payment"|"driver_cash_remittance"|"driver_pay","user_role": "owner"|"manager"|"driver"|"readonly"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            "attempt_result": ["delivered", "no_answer", "refused", "wrong_address", "rescheduled", "closed", "other"],"cashout_status": ["pending", "approved", "rejected", "paid"],"hold_reason": ["weather", "far_zone", "customer_request", "scheduled", "address_problem", "shop_request", "other"],"order_service_type": ["delivery", "replacement", "pickup"],"order_status": ["pending", "assigned", "picked_up", "delivered", "failed", "returned", "cancelled"],"pickup_status": ["requested", "assigned", "collected", "cancelled"],"settlement_type": ["shop_payment", "driver_cash_remittance", "driver_pay"],"user_role": ["owner", "manager", "driver", "readonly"]
          }
        }
} as const
