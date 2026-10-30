import { createClient, createServiceClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { PortalHeader } from '@/components/portal-header'
import { getShopForUser } from '@/lib/shop-auth'
import { IntegrationsClient } from './integrations-client'

export const metadata = {
  title: 'Connect Your Store — Cedar Delivery Portal',
  description: 'API keys and webhooks so your own store or system can send orders to Cedar and hear about every status change.',
}

export default async function MerchantIntegrationsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/portal/login')
  const shop = await getShopForUser(createServiceClient(), user)
  if (!shop) redirect('/portal/signup')

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
      <PortalHeader shopName={shop.name} shopPrefix={shop.prefix || user.user_metadata?.prefix || 'CD'} userEmail={user.email || ''} />
      <main style={{ flex: 1, padding: '24px 20px', maxWidth: 1000, width: '100%', margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 24 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: 'var(--text)' }}>Connect your store</h1>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--muted)' }}>
              Let your own website or system send orders to Cedar and hear about every status change, for <strong>{shop.name}</strong>.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Link href="/portal/api-docs" className="btn btn-secondary btn-sm" style={{ textDecoration: 'none' }}>API documentation</Link>
            <Link href="/portal" className="btn btn-secondary btn-sm" style={{ textDecoration: 'none' }}>← Back to Orders</Link>
          </div>
        </div>
        <IntegrationsClient shopId={shop.id} />
      </main>
    </div>
  )
}
