import { allRows } from '@/lib/pagination'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ShopProfileClient } from './shop-profile-client'
import type { UserRole } from '@/lib/roles'

interface ShopProfilePageProps {
  params: Promise<{ id: string }>
}

export default async function ShopProfilePage({ params }: ShopProfilePageProps) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: memberData } = await supabase
    .from('workspace_members')
    .select('*')
    .eq('user_id', user.id)
    .single()

  const member = memberData as { workspace_id: string; role: any } | null
  if (!member) redirect('/login')

  const { data: wsData } = await supabase
    .from('workspaces')
    .select('id, name, usd_to_lbp')
    .eq('id', member.workspace_id)
    .single()

  const workspace = wsData as { id: string; name: string; usd_to_lbp: number } | null
  if (!workspace) redirect('/login')

  // Parallel fetches for shop, shop's orders, and shop payouts
  const [shopRes, ordersRes, settlementsRes] = await Promise.all([
    supabase
      .from('shops')
      .select('*')
      .eq('id', id)
      .eq('workspace_id', workspace.id)
      .single(),

    allRows(supabase
      .from('orders')
      .select(`
        id, code, tracking_token, status, collection_usd, delivery_fee_usd, driver_pay_usd,
        shop_balance_usd, usd_to_lbp_rate, created_at, recipient_name,
        recipient_phone, recipient_address, notes,
        shopify_order_id, shopify_order_number,
        driver:driver_id(id, name, phone),
        area:area_id(id, name)
      `)
      .eq('workspace_id', workspace.id)
      .eq('shop_id', id)
      .order('created_at', { ascending: false })),

    allRows(supabase
      .from('settlements')
      .select('id, type, amount_usd, usd_to_lbp, note, created_at, created_by')
      .eq('workspace_id', workspace.id)
      .eq('shop_id', id)
      .order('created_at', { ascending: false })),
  ])

  if (!shopRes.data) {
    notFound()
  }

  const shop = shopRes.data
  const orders = (ordersRes.data as any[]) || []
  const settlements = (settlementsRes.data as any[]) || []

  return (
    <div className="content">
      <ShopProfileClient
        shop={shop}
        initialOrders={orders}
        initialSettlements={settlements}
        workspace={workspace}
        userRole={member.role as UserRole}
      />
    </div>
  )
}
