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

  // Parallel fetches for shop, shop's orders, shop payouts, zones, and shop special prices
  const [shopRes, ordersRes, settlementsRes, areasRes, pricesRes] = await Promise.all([
    supabase
      .from('shops')
      .select('*')
      .eq('id', id)
      .eq('workspace_id', workspace.id)
      .single(),

    allRows(supabase
      .from('orders')
      .select(`
        *,
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

    allRows(supabase
      .from('delivery_areas')
      .select('id, name, fee_usd')
      .eq('workspace_id', workspace.id)
      .eq('active', true)
      .order('name')),

    supabase
      .from('shop_area_prices')
      .select('area_id, fee_usd')
      .eq('workspace_id', workspace.id)
      .eq('shop_id', id),
  ])

  if (!shopRes.data) {
    notFound()
  }

  const shop = shopRes.data
  const orders = (ordersRes.data as any[]) || []
  const settlements = (settlementsRes.data as any[]) || []
  const areas = (areasRes.data as any[]) || []
  const specialPrices = (pricesRes.data as any[]) || []

  return (
    <div className="content">
      <ShopProfileClient
        shop={shop}
        initialOrders={orders}
        initialSettlements={settlements}
        areas={areas}
        initialSpecialPrices={specialPrices}
        workspace={workspace}
        userRole={member.role as UserRole}
      />
    </div>
  )
}
