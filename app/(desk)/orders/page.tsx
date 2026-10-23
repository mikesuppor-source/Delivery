import { createClient } from '@/lib/supabase/server'
import { OrderListClient } from './order-list-client'
import type { UserRole } from '@/lib/auth'

export default async function OrdersPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: membership } = await supabase
    .from('workspace_members')
    .select('workspace_id, role, workspace:workspace_id(id, usd_to_lbp)')
    .eq('user_id', user?.id ?? '')
    .single()

  if (!membership) return null
  const workspace = membership.workspace as { id: string; usd_to_lbp: number }

  // Parallel fetches for orders, shops, drivers, and delivery areas
  const [ordersRes, shopsRes, driversRes, areasRes] = await Promise.all([
    supabase
      .from('orders')
      .select(`
        id, code, status, collection_usd, delivery_fee_usd, driver_pay_usd,
        shop_balance_usd, usd_to_lbp_rate, created_at, recipient_name,
        recipient_phone, recipient_address,
        shop:shop_id(id, name),
        driver:driver_id(id, name),
        area:area_id(id, name)
      `)
      .eq('workspace_id', workspace.id)
      .order('created_at', { ascending: false }),

    supabase
      .from('shops')
      .select('id, name')
      .eq('workspace_id', workspace.id)
      .eq('active', true)
      .order('name'),

    supabase
      .from('drivers')
      .select('id, name')
      .eq('workspace_id', workspace.id)
      .eq('active', true)
      .order('name'),

    supabase
      .from('delivery_areas')
      .select('id, name, fee_usd')
      .eq('workspace_id', workspace.id)
      .eq('active', true)
      .order('name'),
  ])

  return (
    <div className="content">
      <OrderListClient
        orders={(ordersRes.data as any) || []}
        shops={shopsRes.data || []}
        drivers={driversRes.data || []}
        areas={(areasRes.data as any) || []}
        workspaceId={workspace.id}
        userRole={membership.role as UserRole}
        rate={Number(workspace.usd_to_lbp)}
      />
    </div>
  )
}
