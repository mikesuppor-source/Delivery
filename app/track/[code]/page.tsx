import { createServiceClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { formatUSD, formatLBP, usdToLbp } from '@/lib/utils'
import { WhatsAppIcon } from '@/components/whatsapp-icon'
import { CourierTrackActions } from '@/components/courier-track-actions'
import type { Metadata } from 'next'

interface TrackPageProps {
  params: Promise<{ code: string }>
}

export async function generateMetadata({ params }: TrackPageProps): Promise<Metadata> {
  const { code } = await params
  return {
    title: `Track Order ${code.toUpperCase()} — Cedar Delivery`,
    description: `Real-time delivery tracking for package ${code.toUpperCase()}.`,
  }
}

export default async function TrackOrderPage({ params }: TrackPageProps) {
  const { code } = await params
  const supabase = createServiceClient()

  const { data: rawOrder } = await supabase
    .from('orders')
    .select(`
      id, code, status, collection_usd, usd_to_lbp_rate, created_at, delivered_at,
      recipient_name, recipient_phone, recipient_address,
      driver_id,
      shop:shop_id(name),
      area:area_id(name),
      driver:driver_id(id, name, phone)
    `)
    .ilike('code', code.trim())
    .maybeSingle()

  const { data: drivers } = await supabase
    .from('drivers')
    .select('id, name, phone')
    .eq('active', true)
    .order('name')

  const order = rawOrder as {
    id: string
    code: string
    status: 'pending' | 'assigned' | 'picked_up' | 'delivered' | 'failed' | 'returned'
    collection_usd: number
    usd_to_lbp_rate: number
    created_at: string
    delivered_at: string | null
    recipient_name: string | null
    recipient_phone: string | null
    recipient_address: string | null
    driver_id: string | null
    shop: { name: string } | null
    area: { name: string } | null
    driver: { id: string; name: string; phone?: string | null } | null
  } | null

  if (!order) {
    return (
      <div className="track-container">
        <header className="track-header">
          <Link href="/track" className="track-logo-link">
            <img src="/logo.png" alt="Cedar Delivery Desk" className="track-logo" />
            <div>
              <b>cedar</b>
              <small>DELIVERY DESK</small>
            </div>
          </Link>
        </header>

        <div className="track-card text-center not-found-card">
          <div className="not-found-icon">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="11" cy="11" r="8"/>
              <line x1="21" y1="21" x2="16.65" y2="16.65"/>
              <line x1="11" y1="8" x2="11" y2="12"/>
              <line x1="11" y1="14" x2="11.01" y2="14"/>
            </svg>
          </div>
          <h1>Tracking Code Not Found</h1>
          <p>
            We couldn&apos;t find any order matching <strong>{code}</strong>.
            Please double-check the code from your message or invoice.
          </p>

          <form action="/track" method="GET" className="track-search-box">
            <input
              type="text"
              name="code"
              placeholder="e.g. CED-1234"
              defaultValue={code}
              required
            />
            <button type="submit" className="btn btn-primary">
              Track
            </button>
          </form>

          <div className="track-support-bar">
            <span>Need help with your delivery?</span>
            <a
              href="https://wa.me/96170000000?text=Hello%20Cedar%20Delivery,%20I%20need%20help%20tracking%20my%20order"
              target="_blank"
              rel="noopener noreferrer"
              className="whatsapp-btn"
            >
              <WhatsAppIcon size={14} color="#fff" />
              <span>Contact Dispatch</span>
            </a>
          </div>
        </div>
      </div>
    )
  }

  const rate = Number(order.usd_to_lbp_rate) || 89500
  const colUSD = Number(order.collection_usd) || 0
  const colLBP = usdToLbp(colUSD, rate)

  // Status mapping
  const statusSteps = [
    { key: 'pending', label: 'Order Registered', desc: 'Received from merchant' },
    { key: 'assigned', label: 'Courier Assigned', desc: 'Driver preparing pickup' },
    { key: 'picked_up', label: 'Out for Delivery', desc: 'On the way to your door' },
    { key: 'delivered', label: 'Delivered', desc: 'Handed over successfully' },
  ]

  const statusIndexMap: Record<string, number> = {
    pending: 0,
    assigned: 1,
    picked_up: 2,
    delivered: 3,
    failed: 2,
    returned: 2,
  }

  const currentStep = statusIndexMap[order.status] ?? 0
  const isFailed = order.status === 'failed' || order.status === 'returned'

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
          <Link href="/track" className="btn btn-ghost btn-sm">
            Track another
          </Link>
        </div>
      </header>

      {/* Main Tracking Card */}
      <div className="track-card">
        {/* Top Info Banner */}
        <div className="track-topbar">
          <div>
            <span className="track-code-label">Tracking Number</span>
            <h1 className="track-code-value">{order.code}</h1>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Link
              href={`/print/order/${order.code}`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-secondary btn-sm"
              style={{ fontSize: 11, padding: '4px 10px', display: 'inline-flex', alignItems: 'center', gap: 6 }}
              title="View & Print Official Waybill Receipt Slip with Barcode & QR Code"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="6 9 6 2 18 2 18 9" />
                <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                <rect x="6" y="14" width="12" height="8" />
              </svg>
              <span>Receipt Slip</span>
            </Link>
            <span className={`badge badge-${order.status} track-status-badge`}>
              {order.status === 'picked_up'
                ? 'Out for Delivery'
                : order.status.replace('_', ' ')}
            </span>
          </div>
        </div>

        {/* Status Callout */}
        <div className={`track-callout track-callout-${order.status}`}>
          {order.status === 'pending' && (
            <>
              <div className="callout-dot pulse" />
              <div>
                <strong>Order Received by Dispatch</strong>
                <p>Your order from <strong>{order.shop?.name || 'our partner merchant'}</strong> is being processed and prepared for driver pickup.</p>
              </div>
            </>
          )}
          {order.status === 'assigned' && (
            <>
              <div className="callout-dot pulse" />
              <div>
                <strong>Courier Assigned</strong>
                <p>A Cedar courier has been dispatched to pick up your package.</p>
              </div>
            </>
          )}
          {order.status === 'picked_up' && (
            <>
              <div className="callout-dot pulse active" />
              <div>
                <strong>Out for Delivery!</strong>
                <p>Your courier is currently in transit to your delivery address. Please keep your phone available.</p>
              </div>
            </>
          )}
          {order.status === 'delivered' && (
            <>
              <div className="callout-dot completed" />
              <div>
                <strong>Package Delivered</strong>
                <p>
                  Delivered on{' '}
                  {order.delivered_at
                    ? new Date(order.delivered_at).toLocaleString('en-GB')
                    : new Date(order.created_at).toLocaleDateString('en-GB')}
                  . Thank you for choosing Cedar!
                </p>
              </div>
            </>
          )}
          {isFailed && (
            <>
              <div className="callout-dot failed" />
              <div>
                <strong>Delivery Notice</strong>
                <p>Our courier attempted delivery or package was returned. Please contact our dispatch desk to reschedule.</p>
              </div>
            </>
          )}
        </div>

        {/* Stepper Timeline */}
        <div className="track-stepper">
          {statusSteps.map((step, idx) => {
            const isCompleted = idx < currentStep || (idx === 3 && order.status === 'delivered')
            const isCurrent = idx === currentStep && order.status !== 'delivered' && !isFailed
            return (
              <div
                key={step.key}
                className={`stepper-item ${isCompleted ? 'completed' : ''} ${isCurrent ? 'current' : ''}`}
              >
                <div className="stepper-circle">
                  {isCompleted ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                  ) : (
                    <span>{idx + 1}</span>
                  )}
                </div>
                <div className="stepper-content">
                  <b>{step.label}</b>
                  <small>{step.desc}</small>
                </div>
              </div>
            )
          })}
        </div>

        {/* Details Summary Grid */}
        <div className="track-grid">
          <div className="track-grid-item">
            <span className="grid-label">Merchant / Shop</span>
            <strong className="grid-value">{order.shop?.name || 'Partner Store'}</strong>
          </div>

          <div className="track-grid-item">
            <span className="grid-label">Destination Area</span>
            <strong className="grid-value">{order.area?.name || 'Standard Area'}</strong>
          </div>

          <div className="track-grid-item">
            <span className="grid-label">Recipient</span>
            <strong className="grid-value">{order.recipient_name || 'Customer'}</strong>
          </div>

          <div className="track-grid-item accent-item">
            <span className="grid-label">Cash on Delivery (COD)</span>
            <strong className="grid-value cod-value">
              {colUSD > 0 ? (
                <>
                  {formatUSD(colUSD)}
                  <small>{formatLBP(colLBP)}</small>
                </>
              ) : (
                <span style={{ color: 'var(--brand)', fontSize: 15 }}>Prepaid ($0.00)</span>
              )}
            </strong>
          </div>
        </div>

        {/* Recipient Delivery Assistance Actions */}
        <div
          style={{
            marginTop: 20,
            background: 'var(--bg)',
            border: '1.5px solid var(--line)',
            borderRadius: 12,
            padding: '16px 18px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              📍 Delivery Assistance & Pin Location
            </span>
            {order.recipient_phone && (
              <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>
                Tel: {order.recipient_phone}
              </span>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
            {/* Share Pin Location via WhatsApp */}
            <a
              href={`https://wa.me/${(order.driver?.phone ? order.driver.phone.replace(/\D/g, '') : '96170000000')}?text=${encodeURIComponent(
                `Hello, I am tracking my delivery for order ${order.code} (Recipient: ${order.recipient_name || 'Customer'}). My delivery address is: ${order.recipient_address || ''}. Here is my live pin location:`
              )}`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-secondary btn-sm"
              style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 12, padding: '8px 12px' }}
            >
              <WhatsAppIcon size={14} color="#25D366" />
              <span>Send Pin Location on WhatsApp</span>
            </a>

            {/* Call or WhatsApp Courier Driver */}
            {order.driver?.phone ? (
              <a
                href={`tel:${order.driver.phone}`}
                className="btn btn-secondary btn-sm"
                style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 12, padding: '8px 12px' }}
              >
                <span>📞 Call Courier ({order.driver.name})</span>
              </a>
            ) : (
              <a
                href="https://wa.me/96170000000?text=Hello%20Cedar%20Delivery,%20I%20need%20assistance%20with%20my%20delivery."
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-secondary btn-sm"
                style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 12, padding: '8px 12px' }}
              >
                <span>💬 Contact Dispatch Office</span>
              </a>
            )}
          </div>
        </div>

        {/* Courier Dispatch & Check-In Action Hub */}
        <CourierTrackActions
          orderId={order.id}
          orderCode={order.code}
          currentStatus={order.status}
          currentDriverName={order.driver?.name}
          currentDriverId={order.driver_id}
          drivers={drivers || []}
        />

        {/* WhatsApp Help Button */}
        <div className="track-footer">
          <div>
            <small>Questions about your shipment?</small>
            <p>Our dispatch team is available via WhatsApp.</p>
          </div>
          <a
            href={`https://wa.me/96170000000?text=${encodeURIComponent(
              `Hello Cedar Delivery, I am tracking order ${order.code} and have a question regarding my delivery.`
            )}`}
            target="_blank"
            rel="noopener noreferrer"
            className="whatsapp-btn"
          >
            <WhatsAppIcon size={15} color="#fff" />
            <span>Chat with Dispatch</span>
          </a>
        </div>
      </div>
    </div>
  )
}
