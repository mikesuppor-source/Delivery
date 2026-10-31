'use client'

import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

interface PortalHeaderProps {
  shopName: string
  shopPrefix: string
  userEmail: string
}

const TABS = [
  { href: '/portal', label: 'Orders' },
  { href: '/portal/prices', label: 'My Prices' },
  { href: '/portal/integrations', label: 'Connect Store' },
  { href: '/portal/api-docs', label: 'API Guide' },
]

export function PortalHeader({ shopName, shopPrefix, userEmail }: PortalHeaderProps) {
  const router = useRouter()
  const pathname = usePathname()

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/portal/login')
    router.refresh()
  }

  return (
    <header className="portal-header">
      <div className="portal-header-row">
        <div className="portal-brand-group">
          <Link href="/portal" className="portal-brand">
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: 10,
                background: '#ffffff',
                border: '1px solid var(--line)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
                boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
              }}
            >
              <img src="/logo.png" alt="Cedar" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            </div>
            <div>
              <b style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', display: 'block', lineHeight: 1.1 }}>cedar</b>
              <small style={{ fontSize: 9, fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--brand)' }}>
                DELIVERY PORTAL
              </small>
            </div>
          </Link>

          <span className="portal-divider" aria-hidden="true" />

          <div className="portal-shop">
            <span className="portal-prefix">{shopPrefix}</span>
            <span className="portal-shop-name" title={shopName}>{shopName}</span>
          </div>
        </div>

        <div className="portal-actions">
          <small className="portal-email">{userEmail}</small>
          <Link href="/" className="btn btn-secondary btn-sm portal-desk-link" title="Open Cedar Delivery Desk">
            Delivery Desk
          </Link>
          <button type="button" onClick={handleSignOut} className="btn btn-ghost btn-sm portal-signout">
            Sign out
          </button>
        </div>
      </div>

      <nav className="portal-tabs" aria-label="Shop menu">
        {TABS.map(tab => {
          const current = tab.href === '/portal' ? pathname === '/portal' : pathname === tab.href || pathname.startsWith(tab.href + '/')
          return (
            <Link key={tab.href} href={tab.href} aria-current={current ? 'page' : undefined}>
              {tab.label}
            </Link>
          )
        })}
      </nav>
    </header>
  )
}
