import { allRows } from '@/lib/pagination'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
// Merchant self-service dashboard client
import { PortalClient } from './portal-client'
import { PortalHeader } from '@/components/portal-header'
import { getShopForUser } from '@/lib/shop-auth'

export const metadata = {
  title: 'Merchant & Client Order Portfolio — Cedar Delivery',
  description: 'Manage store deliveries, place customer orders, print barcode waybills, and track payouts.',
}

export default async function MerchantPortalPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/portal/login')
  }

  const serviceClient = createServiceClient()

  // Find shop connected to this user via multi-level fallback
  const shop = await getShopForUser(serviceClient, user)



  if (!shop) {
    redirect('/portal/signup')
  }

  const shopPrefix = shop.prefix || user.user_metadata?.prefix || 'CD'
  const effectiveShop = { ...shop, prefix: shopPrefix }

  // Fetch shop orders
  const { data: orders } = await allRows(serviceClient
    .from('orders')
    .select(`
      *,
      area:area_id(id, name, fee_usd),
      driver:driver_id(id, name, phone)
    `)
    .eq('shop_id', effectiveShop.id)
    .order('created_at', { ascending: false }))

  // Fetch delivery areas and shop special prices
  const [areasRes, pricesRes, wsRes] = await Promise.all([
    allRows(
      serviceClient
        .from('delivery_areas')
        .select('id, name, fee_usd')
        .eq('workspace_id', effectiveShop.workspace_id)
        .eq('active', true)
        .order('name')
    ),
    serviceClient
      .from('shop_area_prices')
      .select('area_id, fee_usd')
      .eq('workspace_id', effectiveShop.workspace_id)
      .eq('shop_id', effectiveShop.id),
    serviceClient
      .from('workspaces')
      .select('name, usd_to_lbp')
      .eq('id', effectiveShop.workspace_id)
      .single(),
  ])

  const areas = areasRes.data || []
  const specialPrices = (pricesRes.data as any[]) || []
  const ws = wsRes.data

  const mappedOrders = ((orders || []) as any[]).map(o => ({
    ...o,
    area: Array.isArray(o.area) ? o.area[0] || null : o.area,
    driver: Array.isArray(o.driver) ? o.driver[0] || null : o.driver,
  }))

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
      <PortalHeader
        shopName={effectiveShop.name}
        shopPrefix={effectiveShop.prefix || 'CD'}
        userEmail={user.email || ''}
      />
      <main style={{ flex: 1, padding: '24px 20px', maxWidth: 1200, width: '100%', margin: '0 auto' }}>
        <PortalClient
          shop={effectiveShop}
          initialOrders={mappedOrders}
          areas={areas || []}
          specialPrices={specialPrices}
          rate={Number(ws?.usd_to_lbp) || 89500}
          workspaceName={ws?.name || 'Cedar Delivery'}
        />
      </main>
    </div>
  )
}
