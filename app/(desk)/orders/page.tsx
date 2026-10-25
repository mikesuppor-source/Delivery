import { allRows } from '@/lib/pagination'
import { createClient } from '@/lib/supabase/server'
import { OrderListClient } from './order-list-client'
import type { UserRole } from '@/lib/auth'

export default async function OrdersPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: memberData } = await supabase
    .from('workspace_members')
    .select('*')
    .eq('user_id', user?.id ?? '')
    .order('created_at').limit(1).single()

  const member = memberData as { workspace_id: string; role: any } | null
  if (!member) return null

  const { data: wsData } = await supabase
    .from('workspaces')
    .select('*')
    .eq('id', member.workspace_id)
    .single()

  const workspace = wsData as { id: string; usd_to_lbp: number } | null
  if (!workspace) return null

  // Parallel fetches for orders, shops, drivers, and delivery areas
  const [ordersRes, shopsRes, driversRes, areasRes] = await Promise.all([
    allRows(
      supabase
        .from('orders')
        .select(`
          id, code, tracking_token, status, collection_usd, delivery_fee_usd, driver_pay_usd,
          shop_balance_usd, usd_to_lbp_rate, created_at, recipient_name,
          recipient_phone, recipient_address, notes,
          shopify_order_id, shopify_order_number,
          shop:shop_id(id, name, phone),
          driver:driver_id(id, name, phone),
          area:area_id(id, name)
        `)
        .eq('workspace_id', workspace.id)
        .order('created_at', { ascending: false })
    ),
    allRows(
      supabase
        .from('shops')
        .select('id, name, phone')
        .eq('workspace_id', workspace.id)
        .eq('active', true)
        .order('name')
    ),
    allRows(
      supabase
        .from('drivers')
        .select('id, name, phone')
        .eq('workspace_id', workspace.id)
        .eq('active', true)
        .order('name')
    ),
    allRows(
      supabase
        .from('delivery_areas')
        .select('id, name, fee_usd')
        .eq('workspace_id', workspace.id)
        .eq('active', true)
        .order('name')
    ),
  ])

  return (
    <div className="content">
      <OrderListClient
        orders={(ordersRes.data as any) || []}
        shops={(shopsRes.data as any) || []}
        drivers={(driversRes.data as any) || []}
        areas={(areasRes.data as any) || []}
        workspaceId={workspace.id}
        userRole={member.role as UserRole}
        rate={Number(workspace.usd_to_lbp)}
      />
    </div>
  )
}
