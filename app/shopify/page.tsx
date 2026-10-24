import { ShopifyOnboardingClient } from './shopify-onboarding-client'
import Link from 'next/link'

export const metadata = {
  title: 'Connect Shopify Store — Cedar Delivery Lebanon',
  description: 'Automate order fulfillment, courier dispatch, barcode waybill printing, and Cash on Delivery (COD) for your Shopify store in Lebanon.',
}

export default function ShopifyOnboardingPage() {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
      {/* Top Navbar */}
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
        }}
      >
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 9,
              background: '#ffffff',
              border: '1px solid var(--line)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
            }}
          >
            <img src="/logo.png" alt="Cedar" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          </div>
          <div>
            <b style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', display: 'block', lineHeight: 1.1 }}>cedar</b>
            <small style={{ fontSize: 9, fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--brand)' }}>
              DELIVERY SYSTEM
            </small>
          </div>
        </Link>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Link
            href="/portal/login"
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: 'var(--text-dim)',
              textDecoration: 'none',
              padding: '6px 12px',
              borderRadius: 6,
            }}
          >
            Merchant Sign In
          </Link>

          <Link
            href="/portal/signup"
            className="btn btn-secondary"
            style={{ fontSize: 12, padding: '6px 14px', fontWeight: 600 }}
          >
            Regular Sign Up
          </Link>
        </div>
      </header>

      {/* Main Content */}
      <main style={{ flex: 1 }}>
        <ShopifyOnboardingClient />
      </main>

      {/* Footer */}
      <footer
        style={{
          borderTop: '1px solid var(--line)',
          padding: '24px',
          textAlign: 'center',
          fontSize: 12,
          color: 'var(--text-dim)',
          background: 'var(--surface)',
        }}
      >
        Cedar Delivery Desk & Express Courier System · Lebanon · Built for Shopify & E-Commerce
      </footer>
    </div>
  )
}
