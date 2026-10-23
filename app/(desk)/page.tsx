import { createClient } from '@/lib/supabase/server'
import { getMember } from '@/lib/auth'
import { formatUSD, formatLBP, usdToLbp, formatDateOnly } from '@/lib/utils'
import Link from 'next/link'
import { WhatsAppIcon } from '@/components/whatsapp-icon'
import { getWhatsAppUrl, buildCustomerOrderMessage } from '@/lib/whatsapp'

export default async function OverviewPage() {
  const supabase = await createClient()

  // Get workspace member
  const { data: memberData } = await supabase
    .from('workspace_members')
    .select('*')
    .eq('user_id', (await supabase.auth.getUser()).data.user?.id ?? '')
    .single()

  const member = memberData as { workspace_id: string; role: any } | null
  if (!member) return null

  const { data: wsData } = await supabase
    .from('workspaces')
    .select('*')
    .eq('id', member.workspace_id)
    .single()

  const workspace = wsData as { id: string; name: string; usd_to_lbp: number } | null
  if (!workspace) return null

  // Stats
  const { data: rawOrders } = await supabase
    .from('orders')
    .select('status, collection_usd, delivery_fee_usd, driver_pay_usd')
    .eq('workspace_id', workspace.id)

  const orders = (rawOrders as any[]) || []
  const delivered = orders.filter(o => o.status === 'delivered')
  const pending   = orders.filter(o => ['pending', 'assigned', 'picked_up'].includes(o.status))

  const totalCollected  = delivered.reduce((s, o) => s + Number(o.collection_usd), 0)
  const totalDeliveries = delivered.reduce((s, o) => s + Number(o.delivery_fee_usd), 0)
  const totalDriverPay  = delivered.reduce((s, o) => s + Number(o.driver_pay_usd), 0)

  // Recent orders
  const { data: rawRecentOrders } = await supabase
    .from('orders')
    .select('id, code, status, collection_usd, usd_to_lbp_rate, created_at, recipient_name, recipient_phone, recipient_address, shop:shop_id(name), driver:driver_id(name)')
    .eq('workspace_id', workspace.id)
    .order('created_at', { ascending: false })
    .limit(8)

  const recentOrders = (rawRecentOrders as any[]) || []

  return (
    <div className="content">
      <div className="page-heading">
        <div>
          <div className="date-badge">{formatDateOnly(new Date().toISOString())} / DISPATCH</div>
          <h1>{workspace.name}</h1>
          <p>Your delivery operation, connected.</p>
        </div>
        {(member.role === 'owner' || member.role === 'manager') && (
          <Link href="/orders?new=1" className="btn btn-primary">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            New order
          </Link>
        )}
      </div>

      {/* Stats */}
      <div className="stats">
        <article>
          <span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
            </svg>
            Total orders
          </span>
          <strong>{orders?.length ?? 0}</strong>
          <small>{delivered.length} delivered · {pending.length} active</small>
        </article>

        {(member.role === 'owner' || member.role === 'manager') && (
          <>
            <article>
              <span>Collected</span>
              <strong>{formatUSD(totalCollected)}</strong>
              <small>{formatLBP(usdToLbp(totalCollected, workspace.usd_to_lbp))}</small>
            </article>
            <article>
              <span>Delivery revenue</span>
              <strong>{formatUSD(totalDeliveries)}</strong>
              <small>{formatLBP(usdToLbp(totalDeliveries, workspace.usd_to_lbp))}</small>
            </article>
            <article className="accent">
              <span>Driver pay owed</span>
              <strong>{formatUSD(totalDriverPay)}</strong>
              <small>Outstanding across all drivers</small>
            </article>
          </>
        )}
      </div>

      {/* Recent orders */}
      <div className="panel">
        <div className="panel-title">
          <h2>Recent orders</h2>
          <Link href="/orders" className="btn btn-ghost btn-sm">View all →</Link>
        </div>
        <div className="table-wrap">
          {recentOrders && recentOrders.length > 0 ? (
            <table>
              <thead>
                <tr>
                  <th>Order</th>
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
                        <strong>{order.code}</strong>
                        {order.recipient_name ? (
                          <small>{order.recipient_name}</small>
                        ) : (
                          <small>{new Date(order.created_at).toLocaleDateString('en-GB')}</small>
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
