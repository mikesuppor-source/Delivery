import { allRows } from '@/lib/pagination'
import { createClient } from '@/lib/supabase/server'
import { formatUSD, formatLBP, usdToLbp, formatDateOnly } from '@/lib/utils'
import Link from 'next/link'
import { WhatsAppIcon } from '@/components/whatsapp-icon'
import { getWhatsAppUrl, buildCustomerOrderMessage } from '@/lib/whatsapp'
import { GoogleMapsIcon } from '@/components/google-maps-icon'
import { getGoogleMapsDirectionsUrl } from '@/lib/maps'

export default async function OverviewPage() {
  const supabase = await createClient()

  // Get workspace member
  const { data: memberData } = await supabase
    .from('workspace_members')
    .select('*')
    .eq('user_id', (await supabase.auth.getUser()).data.user?.id ?? '')
    .order('created_at').limit(1).single()

  const member = memberData as { workspace_id: string; role: any } | null
  if (!member) return null

  const { data: wsData } = await supabase
    .from('workspaces')
    .select('*')
    .eq('id', member.workspace_id)
    .single()

  const workspace = wsData as { id: string; name: string; usd_to_lbp: number } | null
  if (!workspace) return null

  const canManage = member.role === 'owner' || member.role === 'manager'

  // Parallel data fetching for analytics
  const [ordersRes, recentOrdersRes, shopsRes, driversRes] = await Promise.all([
    allRows(supabase
      .from('orders')
      .select('status, collection_usd, delivery_fee_usd, driver_pay_usd, shop_id, driver_id, created_at')
      .eq('workspace_id', workspace.id)),

    supabase
      .from('orders')
      .select(`
        *,
        shop:shop_id(name),
        driver:driver_id(name)
      `)
      .eq('workspace_id', workspace.id)
      .order('created_at', { ascending: false })
      .limit(8),

    allRows(supabase
      .from('shops')
      .select('id, name, balance_usd, shopify_domain')
      .eq('workspace_id', workspace.id)
      .eq('active', true)),

    allRows(supabase
      .from('drivers')
      .select('id, name, cash_held_usd, cash_held_lbp, pay_owed_usd')
      .eq('workspace_id', workspace.id)
      .eq('active', true)),
  ])

  const orders = (ordersRes.data as any[]) || []
  const delivered = orders.filter(o => o.status === 'delivered')
  const pending = orders.filter(o => ['pending', 'assigned', 'picked_up'].includes(o.status))
  const returned = orders.filter(o => ['failed', 'returned'].includes(o.status))

  // Financial aggregates
  const totalCollected = delivered.reduce((s, o) => s + Number(o.collection_usd), 0)
  const totalDeliveries = delivered.reduce((s, o) => s + Number(o.delivery_fee_usd), 0)
  const totalDriverPay = delivered.reduce((s, o) => s + Number(o.driver_pay_usd), 0)
  const netCompanyProfit = totalDeliveries - totalDriverPay
  const profitMargin = totalDeliveries > 0 ? (netCompanyProfit / totalDeliveries) * 100 : 0

  const totalOutstandingCashHeld = (driversRes.data || []).reduce((s, d) => s + Math.max(0, Number(d.cash_held_usd || 0)), 0)
  const totalOutstandingCashHeldLbp = (driversRes.data || []).reduce((s, d) => s + Math.max(0, Number((d as any).cash_held_lbp || 0)), 0)
  const totalOutstandingPayOwed = (driversRes.data || []).reduce((s, d) => s + Math.max(0, Number(d.pay_owed_usd || 0)), 0)

  // Top shops by volume & fees
  const shopPerformance = ((shopsRes.data || []) as any[]).map(shop => {
    const shopOrders = orders.filter(o => o.shop_id === shop.id)
    const shopDelivered = shopOrders.filter(o => o.status === 'delivered')
    const fees = shopDelivered.reduce((s, o) => s + Number(o.delivery_fee_usd || 0), 0)
    return {
      id: shop.id,
      name: shop.name,
      shopifyDomain: shop.shopify_domain,
      totalOrders: shopOrders.length,
      deliveredOrders: shopDelivered.length,
      fees,
      balance: Number(shop.balance_usd || 0),
    }
  }).sort((a, b) => b.fees - a.fees).slice(0, 5)

  // Top drivers by deliveries completed
  const driverPerformance = ((driversRes.data || []) as any[]).map(driver => {
    const driverOrders = orders.filter(o => o.driver_id === driver.id)
    const driverDelivered = driverOrders.filter(o => o.status === 'delivered')
    const earnings = driverDelivered.reduce((s, o) => s + Number(o.driver_pay_usd || 0), 0)
    return {
      name: driver.name,
      completed: driverDelivered.length,
      active: driverOrders.filter(o => ['assigned', 'picked_up'].includes(o.status)).length,
      earnings,
      cashHeld: Number(driver.cash_held_usd || 0),
    }
  }).sort((a, b) => b.completed - a.completed).slice(0, 5)

  const recentOrders = (recentOrdersRes.data as any[]) || []

  return (
    <div className="content">
      {/* Heading */}
      <div className="page-heading">
        <div>
          <div className="date-badge">{formatDateOnly(new Date().toISOString())} / EXECUTIVE OVERVIEW</div>
          <h1>{workspace.name}</h1>
          <p>Real-time delivery operations & financial analytics.</p>
        </div>
        {canManage && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Link href="/orders" className="btn btn-secondary">
              Orders Desk & Scanner
            </Link>
            <Link href="/orders?new=1" className="btn btn-primary">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              New order
            </Link>
          </div>
        )}
      </div>

      {/* ─── Executive Financial & Operational KPIs ─── */}
      <div className="stats" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))' }}>
        {/* Metric 1: Total Orders */}
        <article>
          <span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
            </svg>
            Total Orders
          </span>
          <strong>{orders.length}</strong>
          <small>{delivered.length} delivered · {pending.length} active · {returned.length} returned</small>
        </article>

        {canManage && (
          <>
            {/* Metric 2: Collected COD */}
            <article>
              <span>Cash Collected (COD)</span>
              <strong>{formatUSD(totalCollected)}</strong>
              <small>{formatLBP(usdToLbp(totalCollected, workspace.usd_to_lbp))}</small>
            </article>

            {/* Metric 3: Gross Delivery Revenue */}
            <article>
              <span>Delivery Revenue</span>
              <strong>{formatUSD(totalDeliveries)}</strong>
              <small>{formatLBP(usdToLbp(totalDeliveries, workspace.usd_to_lbp))}</small>
            </article>

            {/* Metric 4: Company Net Profit */}
            <article
              style={{
                background: 'linear-gradient(135deg, rgba(21, 128, 61, 0.08) 0%, rgba(21, 128, 61, 0.16) 100%)',
                border: '1.5px solid var(--brand)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--brand)', fontWeight: 700 }}>Company Net Profit</span>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 800,
                    padding: '2px 8px',
                    borderRadius: 99,
                    background: 'var(--brand)',
                    color: '#fff',
                  }}
                >
                  {profitMargin.toFixed(0)}% Margin
                </span>
              </div>
              <strong style={{ color: 'var(--brand)' }}>+{formatUSD(netCompanyProfit)}</strong>
              <small style={{ color: 'var(--text)' }}>
                {formatLBP(usdToLbp(netCompanyProfit, workspace.usd_to_lbp))}
              </small>
            </article>

            {/* Metric 5: Courier Cash in Hand */}
            <article className="accent">
              <span>Unremitted Driver Cash</span>
              <strong>{formatUSD(totalOutstandingCashHeld)}</strong>
              <small>
                {totalOutstandingCashHeldLbp > 0 ? `+ ${formatLBP(totalOutstandingCashHeldLbp)} · ` : ''}
                Pay owed: {formatUSD(totalOutstandingPayOwed)}
              </small>
            </article>
          </>
        )}
      </div>

      {/* ─── Financial Performance & Fleet Insights ─── */}
      {canManage && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 20, marginBottom: 24 }}>
          {/* Top Merchant Shops */}
          <div className="panel" style={{ margin: 0, padding: '18px 20px' }}>
            <div className="panel-title" style={{ marginBottom: 14 }}>
              <h2 style={{ fontSize: 15 }}>Top Partner Stores</h2>
              <Link href="/shops" className="btn btn-ghost btn-sm">View all →</Link>
            </div>
            {shopPerformance.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {shopPerformance.map((shop, i) => (
                  <div
                    key={shop.name}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      paddingBottom: 10,
                      borderBottom: i < shopPerformance.length - 1 ? '1px solid var(--line)' : 'none',
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Link href={`/shops/${shop.id}`} style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)', textDecoration: 'none' }}>
                          {shop.name}
                        </Link>
                        {shop.shopifyDomain && (
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 3,
                              fontSize: 10,
                              fontWeight: 700,
                              padding: '1px 6px',
                              borderRadius: 4,
                              background: '#ecfdf5',
                              color: '#059669',
                              border: '1px solid #a7f3d0',
                            }}
                            title={`Shopify Store: ${shop.shopifyDomain}`}
                          >
                            Shopify
                          </span>
                        )}
                      </div>
                      <small style={{ color: 'var(--muted)', fontSize: 11 }}>
                        {shop.deliveredOrders} / {shop.totalOrders} delivered
                      </small>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <strong style={{ fontSize: 13, color: 'var(--brand)', display: 'block' }}>
                        +{formatUSD(shop.fees)}
                      </strong>
                      <small style={{ fontSize: 11, color: shop.balance < 0 ? '#dc2626' : 'var(--muted)' }}>
                        Bal: {formatUSD(shop.balance)}
                      </small>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ color: 'var(--muted)', fontSize: 13 }}>No active shops yet.</p>
            )}
          </div>

          {/* Top Active Couriers */}
          <div className="panel" style={{ margin: 0, padding: '18px 20px' }}>
            <div className="panel-title" style={{ marginBottom: 14 }}>
              <h2 style={{ fontSize: 15 }}>Driver Fleet Performance</h2>
              <Link href="/drivers" className="btn btn-ghost btn-sm">View all →</Link>
            </div>
            {driverPerformance.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {driverPerformance.map((drv, i) => (
                  <div
                    key={drv.name}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      paddingBottom: 10,
                      borderBottom: i < driverPerformance.length - 1 ? '1px solid var(--line)' : 'none',
                    }}
                  >
                    <div>
                      <strong style={{ fontSize: 13, display: 'block' }}>{drv.name}</strong>
                      <small style={{ color: 'var(--muted)', fontSize: 11 }}>
                        {drv.completed} completed · {drv.active} on route
                      </small>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <strong style={{ fontSize: 13, color: '#047857', display: 'block' }}>
                        Earned {formatUSD(drv.earnings)}
                      </strong>
                      <small style={{ fontSize: 11, color: drv.cashHeld > 0 ? '#b45309' : 'var(--muted)' }}>
                        Cash held: {formatUSD(drv.cashHeld)}
                      </small>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ color: 'var(--muted)', fontSize: 13 }}>No active drivers assigned yet.</p>
            )}
          </div>
        </div>
      )}

      {/* ─── Recent Orders with 1-Tap Google Maps & WhatsApp ─── */}
      <div className="panel">
        <div className="panel-title">
          <h2>Recent Orders</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {canManage && (
              <Link href="/orders" className="btn btn-secondary btn-sm">
                Batch Actions & Waybills
              </Link>
            )}
            <Link href="/orders" className="btn btn-ghost btn-sm">View all →</Link>
          </div>
        </div>
        <div className="table-wrap">
          {recentOrders && recentOrders.length > 0 ? (
            <table>
              <thead>
                <tr>
                  <th>Order & Destination</th>
                  <th>Shop</th>
                  <th>Driver</th>
                  <th>Collected</th>
                  <th>Status</th>
                  <th>WhatsApp</th>
                </tr>
              </thead>
              <tbody>
                {recentOrders.map(order => {
                  const shop = order.shop as { name: string } | null
                  const driver = order.driver as { name: string } | null
                  return (
                    <tr key={order.id}>
                      <td>
                        <Link
                          href={`/track/${order.tracking_token || order.code}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ fontWeight: 700, color: 'var(--brand)', textDecoration: 'none' }}
                          title="Open live customer tracking page"
                        >
                          {order.code} ↗
                        </Link>
                        {order.recipient_name && (
                          <small style={{ display: 'block' }}>{order.recipient_name}</small>
                        )}
                        {order.recipient_address && (
                          <div style={{ marginTop: 2 }}>
                            <a
                              href={getGoogleMapsDirectionsUrl(order.recipient_address)}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                                color: '#2563eb',
                                textDecoration: 'none',
                                background: '#eff6ff',
                                padding: '1px 6px',
                                borderRadius: 4,
                                border: '1px solid #bfdbfe',
                                fontSize: 10.5,
                                fontWeight: 600,
                              }}
                              title="Open 1-Tap Google Maps Navigation"
                            >
                              <GoogleMapsIcon size={11} />
                              <span>{order.recipient_address}</span>
                            </a>
                          </div>
                        )}
                      </td>
                      <td>{shop?.name ?? '—'}</td>
                      <td>{driver?.name ?? <span style={{ color: 'var(--muted)' }}>Unassigned</span>}</td>
                      <td>
                        {formatUSD(Number(order.collection_usd))}
                        <small>{formatLBP(usdToLbp(Number(order.collection_usd), Number(order.usd_to_lbp_rate)))}</small>
                      </td>
                      <td>
                        <span className={`badge badge-${order.status}`}>
                          {order.status.replace('_', ' ')}
                        </span>
                      </td>
                      <td>
                        {order.recipient_phone ? (
                          <a
                            href={getWhatsAppUrl(order.recipient_phone, buildCustomerOrderMessage(order))}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="whatsapp-badge"
                            title="Chat with Customer on WhatsApp"
                          >
                            <WhatsAppIcon size={14} />
                            <span>{order.recipient_phone}</span>
                          </a>
                        ) : (
                          <span style={{ color: 'var(--muted)', fontSize: 11 }}>—</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          ) : (
            <div className="empty">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
              </svg>
              <h3>No orders yet</h3>
              <p>Create your first order to get started.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
