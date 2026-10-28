import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase/server'
import { formatUSD, formatLBP, usdToLbp } from '@/lib/utils'
import { headers } from 'next/headers'
import { formatLebanesePhone, isValidLebanesePhone } from '@/lib/phone'
import { formatOrderCode } from '@/lib/order-codes'
import { clientIp, rateLimit } from '@/lib/rate-limit'
import { WhatsAppIcon } from '@/components/whatsapp-icon'
import { PackageIcon } from '@/components/icons'
import { SUPPORT_WHATSAPP, supportWhatsAppUrl } from '@/lib/support'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Track Delivery & Client Orders ΓÇö Cedar Delivery Desk',
  description: 'Enter your tracking code or phone number to view live delivery status, courier information, and cash on delivery details.',
}

interface TrackPortalProps {
  searchParams: Promise<{ code?: string; phone?: string; q?: string }>
}

export default async function TrackPortalPage({ searchParams }: TrackPortalProps) {
  const params = await searchParams
  const rawCode = params.code?.trim()
  const rawPhone = params.phone?.trim()
  const rawQ = params.q?.trim()

  // 1. Direct code redirect if passed via query param
  if (rawCode) {
    redirect(`/track/${encodeURIComponent(rawCode.toUpperCase())}`)
  }

  // 2. Server Action for Search Bar Form
  async function handleSearch(formData: FormData) {
    'use server'
    const input = formData.get('query')?.toString()?.trim() || ''
    if (!input) return

    const supabase = createServiceClient()

    // Check if input directly matches an order code
    const { data: directOrder } = await supabase
      .from('orders')
      .select('code')
      .eq('code', formatOrderCode(input))
      .maybeSingle()

    if (directOrder) {
      redirect(`/track/${encodeURIComponent(directOrder.code)}`)
    }

    const digitsOnly = input.replace(/\D/g, '')
    const hasLetters = /[a-zA-Z]/.test(input)

    if (hasLetters || digitsOnly.length < 6) {
      redirect(`/track/${encodeURIComponent(input.toUpperCase())}`)
    } else {
      redirect(`/track?phone=${encodeURIComponent(digitsOnly)}`)
    }
  }

  // 3. Handle Phone Search
  let phoneOrders: any[] | null = null
  let searchedPhoneFormatted = ''

  let phoneNotice = ''

  if (rawPhone) {
    const digits = rawPhone.replace(/\D/g, '')
    searchedPhoneFormatted = formatLebanesePhone(digits) || digits
    phoneOrders = []

    // Exact number only, 10 searches a minute per network, and no addresses in the results
    if (isValidLebanesePhone(rawPhone)) {
      let allowed = true
      try {
        await rateLimit('track-phone:' + clientIp({ headers: await headers() }), 10)
      } catch {
        allowed = false
      }
      if (allowed) {
        const { data } = await createServiceClient().rpc('track_orders_by_phone', { p_phone: digits })
        phoneOrders = Array.isArray(data) ? data : []
      } else {
        phoneNotice = 'Too many searches from your network. Please try again in a minute.'
      }
    } else {
      phoneNotice = 'Enter your full mobile number to see your packages.'
    }
  }

  return (
    <div className="track-container" style={{ maxWidth: phoneOrders ? 800 : 640 }}>
      {/* Header */}
      <header className="track-header">
        <Link href="/track" className="track-logo-link">
          <img src="/logo.png" alt="Cedar Delivery Desk" className="track-logo" />
          <div>
            <b>cedar</b>
            <small>DELIVERY DESK</small>
          </div>
        </Link>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Link href="/portal/login" className="btn btn-secondary btn-sm" style={{ fontSize: 11, padding: '5px 12px' }}>
            Merchant & Client Portal
          </Link>
          <Link href="/login" className="btn btn-ghost btn-sm" style={{ fontSize: 11, padding: '5px 10px' }}>
            Desk Login
          </Link>
        </div>
      </header>

      {/* Hero / Search Section */}
      <div className="track-card track-hero-card" style={{ marginBottom: 24, textAlign: 'center' }}>
        <div className="brand-icon" style={{ margin: '0 auto 14px', width: 56, height: 56, borderRadius: 16 }}>
          <img src="/logo.png" alt="Cedar" />
        </div>

        <h1 style={{ fontSize: 26, fontWeight: 800, color: 'var(--text)', marginBottom: 6 }}>
          Track Your Delivery
        </h1>
        <p style={{ color: 'var(--muted)', fontSize: 13.5, maxWidth: 460, margin: '0 auto 16px' }}>
          Enter your <strong>Tracking Code</strong> (e.g. <code>CED-8721</code>) or your <strong>Phone Number</strong> to view all your incoming packages and courier details.
        </p>

        <form action={handleSearch} className="track-search-box" style={{ maxWidth: 500, margin: '0 auto' }}>
          <input
            type="text"
            name="query"
            defaultValue={rawPhone || rawQ || ''}
            placeholder="Tracking code (CED-...) or Phone (70 123 456)"
            required
            autoFocus={!rawPhone}
            style={{ textTransform: 'none' }}
          />
          <button type="submit" className="btn btn-primary" style={{ padding: '0 20px', whiteSpace: 'nowrap' }}>
            Track Now
          </button>
        </form>

        <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginTop: 14, fontSize: 11.5, color: 'var(--muted)' }}>
          <span>Γ£ô Guaranteed COD Price</span>
          <span>Γ£ô Assigned Driver Info</span>
          <span>Γ£ô Scannable Barcode Slip</span>
        </div>
      </div>

      {/* Results for Phone Number Search */}
      {phoneOrders !== null && (
        <div style={{ marginBottom: 32 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 16,
              background: 'var(--surface)',
              border: '1px solid var(--line)',
              borderRadius: 12,
              padding: '12px 18px',
            }}
          >
            <div>
              <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Client Phone Search
              </span>
              <h2 style={{ fontSize: 17, fontWeight: 800, color: 'var(--text)', margin: '2px 0 0' }}>
                Shipments for {searchedPhoneFormatted}
              </h2>
            </div>
            <span
              style={{
                background: phoneOrders.length > 0 ? 'var(--brand-light)' : '#fef2f2',
                color: phoneOrders.length > 0 ? 'var(--brand)' : '#991b1b',
                fontWeight: 700,
                fontSize: 12,
                padding: '4px 10px',
                borderRadius: 20,
              }}
            >
              {phoneOrders.length} {phoneOrders.length === 1 ? 'Package' : 'Packages'} Found
            </span>
          </div>

          {phoneOrders.length === 0 ? (
            <div
              className="track-card text-center"
              style={{ padding: '36px 20px', background: 'var(--surface)', borderRadius: 12 }}
            >
              <PackageIcon size={36} color="var(--muted)" style={{ margin: '0 auto 12px' }} />
              <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 6 }}>No Active Shipments Found</h3>
              <p style={{ color: 'var(--muted)', fontSize: 13, maxWidth: 420, margin: '0 auto 18px' }}>
                {phoneNotice || (
                  <>
                    We couldn&apos;t find any current packages registered for <strong>{searchedPhoneFormatted}</strong>.
                    If you have a tracking code, try entering it directly above.
                  </>
                )}
              </p>
              {SUPPORT_WHATSAPP && (
                <a
                  href={supportWhatsAppUrl(`Hello Cedar Delivery, I am checking my packages for phone number ${searchedPhoneFormatted}. Could you please assist me?`)!}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="whatsapp-btn"
                  style={{ display: 'inline-flex', margin: '0 auto' }}
                >
                  <WhatsAppIcon size={14} color="#fff" />
                  <span>Ask Cedar Dispatch on WhatsApp</span>
                </a>
              )}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {phoneOrders.map((ord: any) => {
                const rate = Number(ord.usd_to_lbp_rate) || 89500
                const colUSD = Number(ord.collection_usd) || 0
                const colLBP = usdToLbp(colUSD, rate)
                const isInTransit = ord.status === 'picked_up' || ord.status === 'assigned'
                const isDelivered = ord.status === 'delivered'

                return (
                  <div
                    key={ord.id}
                    className="track-card"
                    style={{
                      padding: '20px 22px',
                      borderRadius: 14,
                      border: isInTransit ? '1.5px solid var(--brand)' : '1px solid var(--line)',
                      position: 'relative',
                      boxShadow: isInTransit ? '0 4px 14px rgba(34, 197, 94, 0.12)' : 'var(--shadow)',
                    }}
                  >
                    {/* Top Row: Code and Status */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>
                            Tracking ID:
                          </span>
                          <Link
                            href={`/track/${ord.code}`}
                            style={{
                              fontSize: 18,
                              fontWeight: 800,
                              color: 'var(--brand)',
                              fontFamily: 'monospace',
                              letterSpacing: '0.5px',
                              textDecoration: 'none',
                            }}
                          >
                            {ord.code}
                          </Link>
                        </div>
                        <span style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginTop: 2 }}>
                          From: <strong style={{ color: 'var(--text)' }}>{ord.shop?.name || 'Partner Merchant'}</strong>
                        </span>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span className={`badge badge-${ord.status}`} style={{ fontSize: 12, padding: '4px 10px' }}>
                          {ord.status === 'picked_up'
                            ? 'Out for Delivery'
                            : ord.status === 'assigned'
                            ? 'Courier Assigned'
                            : ord.status === 'delivered'
                            ? 'Delivered'
                            : ord.status.replace('_', ' ')}
                        </span>
                      </div>
                    </div>

                    {/* Middle Info Grid */}
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                        gap: 12,
                        background: 'var(--bg)',
                        padding: '14px 16px',
                        borderRadius: 10,
                        border: '1px solid var(--line)',
                        marginBottom: 16,
                      }}
                    >
                      {/* COD Collection Amount */}
                      <div>
                        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', display: 'block', textTransform: 'uppercase' }}>
                          Cash To Pay (COD)
                        </span>
                        <div style={{ fontSize: 16, fontWeight: 800, color: colUSD > 0 ? 'var(--text)' : 'var(--brand)', marginTop: 2 }}>
                          {colUSD > 0 ? (
                            <>
                              {formatUSD(colUSD)}
                              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', marginLeft: 6 }}>
                                ({formatLBP(colLBP)})
                              </span>
                            </>
                          ) : (
                            'Prepaid ($0.00)'
                          )}
                        </div>
                      </div>

                      {/* Recipient / Destination */}
                      <div>
                        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', display: 'block', textTransform: 'uppercase' }}>
                          Destination Area
                        </span>
                        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', display: 'block', marginTop: 2 }}>
                          {ord.area?.name || 'Standard Area'}
                        </span>
                        {ord.recipient_address && (
                          <span style={{ fontSize: 11.5, color: 'var(--muted)', display: 'block', marginTop: 2 }}>
                            {ord.recipient_address}
                          </span>
                        )}
                      </div>

                      {/* Courier Information */}
                      <div>
                        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', display: 'block', textTransform: 'uppercase' }}>
                          Assigned Courier
                        </span>
                        <span style={{ fontSize: 13, fontWeight: 700, color: ord.driver?.name ? 'var(--text)' : 'var(--muted)', display: 'block', marginTop: 2 }}>
                          {ord.driver?.name || 'Pending assignment'}
                        </span>
                        {ord.driver?.phone && (
                          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                            <a
                              href={`https://wa.me/${ord.driver.phone.replace(/\D/g, '')}?text=${encodeURIComponent(
                                `Hello ${ord.driver.name}, I am tracking order ${ord.code}.`
                              )}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{ fontSize: 11, color: '#059669', fontWeight: 700, textDecoration: 'none' }}
                            >
                              ≡ƒÆ¼ WhatsApp Driver
                            </a>
                            <a
                              href={`tel:${ord.driver.phone}`}
                              style={{ fontSize: 11, color: 'var(--brand)', fontWeight: 700, textDecoration: 'none' }}
                            >
                              ≡ƒô₧ Call
                            </a>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Bottom Action Buttons */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                      <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                        Created on {new Date(ord.created_at).toLocaleDateString('en-GB')}
                      </span>

                      <div style={{ display: 'flex', gap: 8 }}>
                        <Link
                          href={`/track/${ord.code}`}
                          className="btn btn-primary btn-sm"
                          style={{ fontSize: 11, padding: '5px 12px' }}
                        >
                          View Live Tracking ΓåÆ
                        </Link>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Feature Highlights Grid */}
      <div className="track-faq-grid">
        <div className="track-faq-item">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          </svg>
          <strong>Live Courier Updates</strong>
          <small>Follow your delivery in real time from partner store to your doorstep.</small>
        </div>

        <div className="track-faq-item">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <strong>Guaranteed COD Price</strong>
          <small>Clear collection amounts shown in both USD and Lebanese Pounds at official desk rates.</small>
        </div>
      </div>

      {/* Help Bar */}
      {SUPPORT_WHATSAPP && (
        <div className="track-support-bar" style={{ marginTop: 24 }}>
          <span>Have questions or need to reschedule a delivery?</span>
          <a
            href={supportWhatsAppUrl('Hello Cedar Delivery, I have a question regarding my shipment.')!}
            target="_blank"
            rel="noopener noreferrer"
            className="whatsapp-btn"
          >
            <WhatsAppIcon size={14} color="#fff" />
            <span>Chat on WhatsApp</span>
          </a>
        </div>
      )}
    </div>
  )
}
