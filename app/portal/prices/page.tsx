import { allRows } from '@/lib/pagination'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { PortalHeader } from '@/components/portal-header'
import { getShopForUser } from '@/lib/shop-auth'
import { formatUSD, formatLBP, usdToLbp } from '@/lib/utils'
import Link from 'next/link'

export const metadata = {
  title: 'My Zone Delivery Tariffs — Cedar Delivery Portal',
  description: 'View your merchant delivery fees and zone pricing across Lebanon.',
}

export default async function MerchantPricesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/portal/login')
  }

  const serviceClient = createServiceClient()
  const shop = await getShopForUser(serviceClient, user)

  if (!shop) {
    redirect('/portal/signup')
  }

  const shopPrefix = shop.prefix || user.user_metadata?.prefix || 'CD'
  const effectiveShop = { ...shop, prefix: shopPrefix }

  // Parallel fetches for areas, shop special prices, and workspace info
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

  const areas = (areasRes.data as any[]) || []
  const specialPrices = (pricesRes.data as any[]) || []
  const rate = Number(wsRes.data?.usd_to_lbp) || 89500

  const specialPriceMap = new Map<string, number>()
  for (const sp of specialPrices) {
    specialPriceMap.set(sp.area_id, Number(sp.fee_usd))
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
      <PortalHeader
        shopName={effectiveShop.name}
        shopPrefix={effectiveShop.prefix || 'CD'}
        userEmail={user.email || ''}
      />

      <main style={{ flex: 1, padding: '24px 20px', maxWidth: 1000, width: '100%', margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: 'var(--text)' }}>
              My Delivery Prices & Zone Tariffs
            </h1>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--muted)' }}>
              Official delivery rates charged for orders from <strong>{effectiveShop.name}</strong> across Lebanon.
            </p>
          </div>

          <Link href="/portal" className="btn btn-secondary btn-sm" style={{ display: 'inline-flex', gap: 6, textDecoration: 'none' }}>
            <span>← Back to Orders</span>
          </Link>
        </div>

        <div className="panel" style={{ overflow: 'hidden' }}>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Delivery Area / Zone</th>
                  <th>Standard Fee</th>
                  <th>Your Merchant Fee</th>
                  <th>L.L. Equivalent (Door Rate)</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {areas.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', padding: '32px', color: 'var(--muted)' }}>
                      No delivery zones are configured yet for your workspace.
                    </td>
                  </tr>
                ) : (
                  areas.map(area => {
                    const hasSpecial = specialPriceMap.has(area.id)
                    const effectiveFee = hasSpecial ? specialPriceMap.get(area.id)! : Number(area.fee_usd)
                    const standardFee = Number(area.fee_usd)
                    const discount = standardFee - effectiveFee
                    const feeLbp = usdToLbp(effectiveFee, rate)

                    return (
                      <tr key={area.id}>
                        <td>
                          <strong style={{ fontSize: 13.5, color: 'var(--text)' }}>{area.name}</strong>
                        </td>
                        <td>
                          <span style={{ color: 'var(--muted)', fontSize: 13 }}>
                            {formatUSD(standardFee)}
                          </span>
                        </td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <strong style={{ fontSize: 15, color: hasSpecial ? 'var(--brand)' : 'var(--text)' }}>
                              {formatUSD(effectiveFee)}
                            </strong>
                            {hasSpecial && discount > 0 && (
                              <span
                                style={{
                                  background: '#ecfdf5',
                                  color: '#065f46',
                                  border: '1px solid #a7f3d0',
                                  padding: '1px 6px',
                                  borderRadius: 99,
                                  fontSize: 10.5,
                                  fontWeight: 700,
                                }}
                              >
                                Save {formatUSD(discount)}
                              </span>
                            )}
                          </div>
                        </td>
                        <td>
                          <span style={{ fontSize: 12.5, color: 'var(--muted)', fontFamily: 'monospace' }}>
                            {formatLBP(feeLbp)}
                          </span>
                        </td>
                        <td>
                          {hasSpecial ? (
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                padding: '2px 8px',
                                borderRadius: 99,
                                fontSize: 11,
                                fontWeight: 700,
                                background: 'var(--brand-light)',
                                color: 'var(--brand)',
                                border: '1px solid var(--line)',
                              }}
                            >
                              Negotiated Special
                            </span>
                          ) : (
                            <span style={{ color: 'var(--muted)', fontSize: 11.5 }}>
                              Standard Zone Tariff
                            </span>
                          )}
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div
          style={{
            marginTop: 20,
            padding: '16px 20px',
            borderRadius: 10,
            background: 'var(--surface)',
            border: '1px solid var(--line)',
            fontSize: 12.5,
            color: 'var(--muted)',
            lineHeight: 1.5,
          }}
        >
          <strong style={{ color: 'var(--text)', display: 'block', marginBottom: 4 }}>
            About Delivery Fee Application:
          </strong>
          When placing orders, you can choose whether the delivery fee is added on top of your merchandise price for the customer to pay (Fee Added), or whether your store absorbs the fee as a promotion (Free Delivery). Your net merchandise payout is always guaranteed.
        </div>
      </main>
    </div>
  )
}
