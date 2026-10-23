import { createClient } from '@/lib/supabase/server'
import { formatUSD, formatLBP, usdToLbp, formatDate } from '@/lib/utils'
import Link from 'next/link'
import { PrintButton } from '@/components/print-button'

export default async function PrintPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: memberData } = await supabase
    .from('workspace_members')
    .select('*')
    .eq('user_id', user?.id ?? '')
    .single()

  const member = memberData as { workspace_id: string } | null
  if (!member) return null

  const { data: wsData } = await supabase
    .from('workspaces')
    .select('*')
    .eq('id', member.workspace_id)
    .single()

  const workspace = wsData as { id: string; name: string; usd_to_lbp: number } | null
  if (!workspace) return null

  const { data: orders } = await supabase
    .from('orders')
    .select(`
      id, code, collection_usd, delivery_fee_usd, driver_pay_usd,
      shop_balance_usd, usd_to_lbp_rate, created_at,
      shop:shop_id(name), driver:driver_id(name)
    `)
    .eq('workspace_id', workspace.id)
    .eq('status', 'delivered')
    .order('created_at', { ascending: false })

  const rate = Number(workspace.usd_to_lbp)
  const totalCollected   = orders?.reduce((s, o) => s + Number(o.collection_usd), 0) ?? 0
  const totalDriverCash  = orders?.reduce((s, o) => s + Number(o.driver_pay_usd), 0) ?? 0
  const totalShopBalance = orders?.reduce((s, o) => s + Number(o.shop_balance_usd), 0) ?? 0
  const totalDriverPay   = orders?.reduce((s, o) => s + Number(o.driver_pay_usd), 0) ?? 0

  return (
    <div className="print-page">
      {/* Controls — hidden on print */}
      <div className="print-controls">
        <Link href="/statements" className="btn btn-secondary">
          ← Back to delivery desk
        </Link>
        <span>Only this document will be printed.</span>
        <PrintButton />
      </div>

      <div className="print-document">
        {/* Heading */}
        <div className="print-heading">
          <small>{workspace.name.toUpperCase()}</small>
          <h1>Delivery statement</h1>
          <p>All dates to today · All shops · All drivers</p>
        </div>

        {/* Summary stats */}
        <div className="stats" style={{ gridTemplateColumns: 'repeat(4, 1fr)', marginBottom: 24 }}>
          <article>
            <span>Collected · actual currencies</span>
            <strong>{formatUSD(totalCollected)}</strong>
            <small>{formatLBP(usdToLbp(totalCollected, rate))}</small>
          </article>
          <article>
            <span>Unremitted driver cash</span>
            <strong>{formatUSD(totalDriverCash)}</strong>
            <small>{formatLBP(usdToLbp(totalDriverCash, rate))}</small>
          </article>
          <article>
            <span>Shop balances outstanding</span>
            <strong>{formatUSD(totalShopBalance)}</strong>
            <small>Negative means the shop owes you</small>
          </article>
          <article className="accent">
            <span>Driver pay outstanding</span>
            <strong>{formatUSD(totalDriverPay)}</strong>
            <small>Separate from gross cash remittance</small>
          </article>
        </div>

        {/* Statement table */}
        <div className="panel">
          <div className="panel-title">
            <h2>Delivery statement</h2>
            <small>{orders?.length ?? 0} delivered orders</small>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Collected</th>
                  <th>Delivery fee</th>
                  <th>Shop balance</th>
                  <th>Driver pay</th>
                </tr>
              </thead>
              <tbody>
                {orders?.map((order: any) => {
                  const shop = (Array.isArray(order.shop) ? order.shop[0] : order.shop) as { name: string } | null
                  const driver = (Array.isArray(order.driver) ? order.driver[0] : order.driver) as { name: string } | null
                  const r = Number(order.usd_to_lbp_rate)
                  return (
                    <tr key={order.id}>
                      <td>
                        <strong>{order.code}</strong>
                        <small>{shop?.name} · {new Date(order.created_at).toLocaleDateString('en-GB')}</small>
                      </td>
                      <td>
                        {formatUSD(Number(order.collection_usd))}
                        <small>{formatLBP(usdToLbp(Number(order.collection_usd), r))}</small>
                      </td>
                      <td>
                        {formatUSD(Number(order.delivery_fee_usd))}
                        <small>{formatLBP(usdToLbp(Number(order.delivery_fee_usd), r))}</small>
                      </td>
                      <td>
                        {formatUSD(Number(order.shop_balance_usd))}
                        <small>{formatLBP(usdToLbp(Number(order.shop_balance_usd), r))}</small>
                      </td>
                      <td>
                        {formatUSD(Number(order.driver_pay_usd))}
                        {driver?.name && <small>{driver.name}</small>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 20 }}>
          Each order keeps its original exchange rate. LBP equivalents use that saved rate.
          Failed and returned orders do not accrue delivery fees. Statements use Beirut time.
        </p>
      </div>
    </div>
  )
}
