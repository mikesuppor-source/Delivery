import Link from 'next/link'
import { redirect } from 'next/navigation'
import { WhatsAppIcon } from '@/components/whatsapp-icon'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Track Package — Cedar Delivery Desk',
  description: 'Enter your tracking code to view live delivery status and cash on delivery details.',
}

interface TrackPortalProps {
  searchParams: Promise<{ code?: string }>
}

export default async function TrackPortalPage({ searchParams }: TrackPortalProps) {
  const { code } = await searchParams

  if (code && code.trim()) {
    redirect(`/track/${encodeURIComponent(code.trim().toUpperCase())}`)
  }

  async function handleSearch(formData: FormData) {
    'use server'
    const inputCode = formData.get('code')?.toString()
    if (inputCode && inputCode.trim()) {
      redirect(`/track/${encodeURIComponent(inputCode.trim().toUpperCase())}`)
    }
  }

  return (
    <div className="track-container">
      {/* Header */}
      <header className="track-header">
        <Link href="/track" className="track-logo-link">
          <img src="/logo.png" alt="Cedar Delivery Desk" className="track-logo" />
          <div>
            <b>cedar</b>
            <small>DELIVERY DESK</small>
          </div>
        </Link>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link href="/portal/login" className="btn btn-secondary btn-sm">
            Merchant Portal
          </Link>
          <Link href="/login" className="btn btn-ghost btn-sm">
            Desk Login
          </Link>
        </div>
      </header>

      {/* Hero Tracking Box */}
      <div className="track-card text-center track-hero-card">
        <div className="brand-icon" style={{ margin: '0 auto 16px', width: 64, height: 64, borderRadius: 18 }}>
          <img src="/logo.png" alt="Cedar" />
        </div>

        <h1>Track Your Delivery</h1>
        <p>Enter the tracking code from your receipt or WhatsApp notification.</p>

        <form action={handleSearch} className="track-search-box">
          <input
            type="text"
            name="code"
            placeholder="e.g. CED-8721"
            required
            autoFocus
          />
          <button type="submit" className="btn btn-primary">
            Track Package
          </button>
        </form>

        <div className="track-faq-grid">
          <div className="track-faq-item">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
            <strong>Live Courier Updates</strong>
            <small>Follow your delivery from merchant pickup to your doorstep.</small>
          </div>

          <div className="track-faq-item">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <strong>Transparent COD Rates</strong>
            <small>Clear collection amounts shown in both USD and Lebanese Pounds.</small>
          </div>
        </div>

        <div className="track-support-bar">
          <span>Need help with a package?</span>
          <a
            href="https://wa.me/96170000000?text=Hello%20Cedar%20Delivery,%20I%20have%20a%20question%20regarding%20my%20shipment."
            target="_blank"
            rel="noopener noreferrer"
            className="whatsapp-btn"
          >
            <WhatsAppIcon size={14} color="#fff" />
            <span>Chat on WhatsApp</span>
          </a>
        </div>
      </div>
    </div>
  )
}
