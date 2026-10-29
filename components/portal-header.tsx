'use client'

import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

interface PortalHeaderProps {
  shopName: string
  shopPrefix: string
  userEmail: string
}

export function PortalHeader({ shopName, shopPrefix, userEmail }: PortalHeaderProps) {
  const router = useRouter()

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/portal/login')
    router.refresh()
  }

  return (
    <header
      style={{
        background: 'var(--surface)',
        borderBottom: '1.5px solid var(--line)',
        height: 'var(--topbar-h)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 24px',
        position: 'sticky',
        top: 0,
        zIndex: 40,
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <Link href="/portal" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
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

        <span style={{ color: 'var(--line)', fontSize: 18 }}>|</span>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span
            style={{
              fontSize: 10,
              fontWeight: 800,
              fontFamily: 'monospace',
              padding: '2px 6px',
              borderRadius: 4,
              background: 'var(--brand-light)',
              color: 'var(--brand)',
              border: '1px solid var(--line)',
            }}
          >
            {shopPrefix}
          </span>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
            {shopName}
          </span>
        </div>

        <nav style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 16 }}>
          <Link
            href="/portal"
            className="btn btn-ghost btn-sm"
            style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', textDecoration: 'none' }}
          >
            Orders
          </Link>
          <Link
            href="/portal/prices"
            className="btn btn-ghost btn-sm"
            style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', textDecoration: 'none' }}
          >
            My Prices
          </Link>
        </nav>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <div style={{ textAlign: 'right' }}>
          <small style={{ fontSize: 11, color: 'var(--muted)', display: 'block' }}>{userEmail}</small>
        </div>

        <Link
          href="/"
          className="btn btn-secondary btn-sm"
          style={{ fontSize: 11, padding: '4px 10px', textDecoration: 'none' }}
          title="Open Cedar Delivery Desk"
        >
          Delivery Desk
        </Link>

        <button
          type="button"
          onClick={handleSignOut}
          className="btn btn-ghost btn-sm"
          style={{ fontSize: 12, color: 'var(--muted)', padding: '4px 8px' }}
        >
          Sign out
        </button>
      </div>
    </header>
  )
}
