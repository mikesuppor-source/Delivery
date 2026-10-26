'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import JsBarcode from 'jsbarcode'
import QRCode from 'qrcode'
import { formatUSD, formatLBP, usdToLbp, formatDate, ORDER_STATUS_LABELS } from '@/lib/utils'
import { WhatsAppIcon } from '@/components/whatsapp-icon'
import { getCustomerOrderWhatsAppUrl } from '@/lib/whatsapp'
import { GoogleMapsIcon } from '@/components/google-maps-icon'
import { getGoogleMapsDirectionsUrl, formatDisplayAddress, parseLocation } from '@/lib/maps'

export interface ReceiptOrder {
  id: string
  code: string
  service_type?: 'delivery' | 'replacement' | 'pickup'
  weight_kg?: number
  is_breakable?: boolean
  carrier_name?: string | null
  carrier_tracking_code?: string | null
  destination_governorate?: string | null
  destination_caza?: string | null
  destination_town?: string | null
  tracking_token?: string
  status: string
  collection_usd: number
  delivery_fee_usd: number
  driver_pay_usd: number
  shop_balance_usd: number
  usd_to_lbp_rate?: number
  created_at: string
  recipient_name: string | null
  recipient_phone: string | null
  recipient_address: string | null
  notes?: string | null
  shop?: { id?: string; name: string; phone?: string | null } | null
  driver?: { id?: string; name: string; phone?: string | null } | null
  area?: { id?: string; name: string } | null
}

interface OrderReceiptSlipProps {
  order: ReceiptOrder
  workspaceRate?: number
  workspaceName?: string
  autoPrint?: boolean
}

export function OrderReceiptSlip({
  order,
  workspaceRate = 89500,
  workspaceName = 'Cedar Delivery Desk',
  autoPrint = false,
}: OrderReceiptSlipProps) {
  const barcodeRef = useRef<SVGSVGElement | null>(null)
  const [qrDataUrl, setQrDataUrl] = useState<string>('')
  const [qrMode, setQrMode] = useState<'tracking_url' | 'full_text'>('tracking_url')
  const [copied, setCopied] = useState(false)

  const effectiveRate = order.usd_to_lbp_rate || workspaceRate
  const codUSD = Number(order.collection_usd) || 0
  const codLBP = usdToLbp(codUSD, effectiveRate)
  const isReturn = order.status === 'returned'

  // Get current site URL or fallback
  const origin = typeof window !== 'undefined' ? window.location.origin : (process.env.NEXT_PUBLIC_SITE_URL || '')
  const trackingUrl = `${origin}/track/${order.tracking_token || order.code}`

  // Full Text Receipt summary encoded into QR Code
  const fullTextReceipt = [
    `CEDAR DELIVERY RECEIPT - WAYBILL`,
    `Order Code: #${order.code}`,
    `Date: ${new Date(order.created_at).toLocaleString('en-GB')}`,
    `Merchant: ${order.shop?.name || 'Store'}`,
    `Customer: ${order.recipient_name || 'N/A'}`,
    `Phone: ${order.recipient_phone || 'N/A'}`,
    `Address: ${order.recipient_address || 'N/A'} (${order.area?.name || 'Standard Area'})`,
    `COD Cash to Collect: $${codUSD.toFixed(2)} USD (${codLBP.toLocaleString()} L.L.)`,
    `Delivery Fee: $${Number(order.delivery_fee_usd).toFixed(2)} USD`,
    `Courier: ${order.driver?.name || 'Unassigned'}`,
    order.notes ? `Instructions: ${order.notes}` : '',
    `Track Online: ${trackingUrl}`,
  ]
    .filter(Boolean)
    .join('\n')

  // Generate Barcode using Code 128
  useEffect(() => {
    if (barcodeRef.current && order.code) {
      try {
        JsBarcode(barcodeRef.current, order.code, {
          format: 'CODE128',
          width: 2.2,
          height: 48,
          displayValue: true,
          font: 'monospace',
          fontSize: 13,
          fontOptions: 'bold',
          textMargin: 4,
          margin: 6,
          background: '#ffffff',
          lineColor: '#111827',
        })
      } catch (err) {
        console.error('Failed to generate barcode', err)
      }
    }
  }, [order.code])

  // Generate QR Code
  useEffect(() => {
    const textToEncode = qrMode === 'tracking_url' ? trackingUrl : fullTextReceipt
    QRCode.toDataURL(textToEncode, {
      width: 170,
      margin: 1,
      color: {
        dark: '#111827',
        light: '#ffffff',
      },
      errorCorrectionLevel: 'M',
    })
      .then(url => setQrDataUrl(url))
      .catch(err => console.error('Failed to generate QR Code', err))
  }, [order.code, qrMode, trackingUrl, fullTextReceipt])

  // Auto-print if requested
  useEffect(() => {
    if (autoPrint) {
      const timer = setTimeout(() => {
        window.print()
      }, 500)
      return () => clearTimeout(timer)
    }
  }, [autoPrint])

  function handleCopyTrackingUrl() {
    navigator.clipboard.writeText(trackingUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="receipt-wrapper">
      {/* ─── Control Bar (Excluded from Printing) ─── */}
      <div
        className="no-print"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 12,
          padding: '12px 16px',
          background: 'var(--bg)',
          borderRadius: 'var(--radius-sm)',
          marginBottom: 16,
          border: '1px solid var(--line)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>QR Code Encodes:</span>
          <button
            type="button"
            onClick={() => setQrMode('tracking_url')}
            style={{
              padding: '4px 10px',
              borderRadius: 99,
              fontSize: 11,
              fontWeight: 600,
              cursor: 'pointer',
              border: '1px solid',
              background: qrMode === 'tracking_url' ? 'var(--brand)' : 'var(--surface)',
              color: qrMode === 'tracking_url' ? '#fff' : 'var(--muted)',
              borderColor: qrMode === 'tracking_url' ? 'var(--brand)' : 'var(--line)',
            }}
          >
            📱 Live Customer Tracking URL
          </button>
          <button
            type="button"
            onClick={() => setQrMode('full_text')}
            style={{
              padding: '4px 10px',
              borderRadius: 99,
              fontSize: 11,
              fontWeight: 600,
              cursor: 'pointer',
              border: '1px solid',
              background: qrMode === 'full_text' ? 'var(--brand)' : 'var(--surface)',
              color: qrMode === 'full_text' ? '#fff' : 'var(--muted)',
              borderColor: qrMode === 'full_text' ? 'var(--brand)' : 'var(--line)',
            }}
          >
            Full Text Receipt Details
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={handleCopyTrackingUrl}
            style={{ fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            {copied ? 'Copied Link' : 'Copy Tracking Link'}
          </button>

          {order.recipient_phone && (
            <a
              href={getCustomerOrderWhatsAppUrl({
                customerPhone: order.recipient_phone,
                customerName: order.recipient_name,
                orderCode: order.code,
      trackingToken: order.tracking_token,
                shopName: order.shop?.name,
                collectionUsd: codUSD,
                collectionLbp: codLBP,
                driverName: order.driver?.name,
                status: order.status,
              })}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-secondary btn-sm"
              style={{ fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <WhatsAppIcon size={14} />
              <span>WhatsApp Customer</span>
            </a>
          )}

          {order.recipient_address && (
            <a
              href={getGoogleMapsDirectionsUrl(order.recipient_address)}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-secondary btn-sm"
              style={{ fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }}
              title="Open turn-by-turn navigation in Google Maps"
            >
              <GoogleMapsIcon size={14} />
              <span>Navigate (Maps)</span>
            </a>
          )}

          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => window.print()}
            style={{ fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="6 9 6 2 18 2 18 9" />
              <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
              <rect x="6" y="14" width="12" height="8" />
            </svg>
            Print Receipt / Slip
          </button>
        </div>
      </div>

      {/* ─── Printable Waybill Receipt Slip ─── */}
      <div
        className="printable-receipt-area"
        style={{
          background: '#ffffff',
          color: '#111827',
          padding: '24px 26px',
          borderRadius: 8,
          border: '2px solid #111827',
          maxWidth: 620,
          margin: '0 auto',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          boxShadow: '0 4px 20px rgba(0,0,0,0.06)',
        }}
      >
        {/* Header Branding & Order Status */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '2px solid #111827', paddingBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Image src="/logo.png" alt="Cedar Logo" width={42} height={42} style={{ borderRadius: 8, border: '1px solid #e5e7eb' }} />
            <div>
              <div style={{ fontSize: 17, fontWeight: 900, letterSpacing: '-0.3px', textTransform: 'uppercase', color: '#15803d' }}>
                {workspaceName}
              </div>
              <small style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: '#4b5563', display: 'block' }}>
                Official Delivery Waybill & COD Clearance Slip
              </small>
            </div>
          </div>

          <div style={{ textAlign: 'right' }}>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                fontSize: 11,
                fontWeight: 900,
                textTransform: 'uppercase',
                padding: '4px 10px',
                borderRadius: 6,
                background: isReturn ? '#fef2f2' : order.status === 'delivered' ? '#ecfdf5' : order.status === 'picked_up' ? '#eef2ff' : '#fef3c7',
                color: isReturn ? '#991b1b' : order.status === 'delivered' ? '#065f46' : order.status === 'picked_up' ? '#3730a3' : '#92400e',
                border: `1.5px solid ${isReturn ? '#f87171' : order.status === 'delivered' ? '#86efac' : order.status === 'picked_up' ? '#c7d2fe' : '#fde68a'}`,
                letterSpacing: '0.4px',
              }}
            >
              <span>STATUS: {isReturn ? 'RETAIL REFUND ($2)' : ORDER_STATUS_LABELS[order.status] || order.status}</span>
            </div>
            <div style={{ fontSize: 11, color: '#4b5563', marginTop: 3 }}>
              {formatDate(order.created_at)}
            </div>
          </div>
        </div>

        {/* Visual Order Status Timeline Tracker */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: '#f9fafb',
            border: '1px solid #e5e7eb',
            borderRadius: 6,
            padding: '6px 14px',
            margin: '12px 0',
            fontSize: 10,
            fontWeight: 800,
            textTransform: 'uppercase',
            letterSpacing: '0.3px',
          }}
        >
          <span style={{ color: '#059669' }}>✓ 1. Registered</span>
          <span style={{ color: '#cbd5e1' }}>➔</span>
          <span style={{ color: order.status !== 'pending' ? '#059669' : '#9ca3af' }}>
            {order.status !== 'pending' ? '✓' : '○'} 2. Courier Assigned
          </span>
          <span style={{ color: '#cbd5e1' }}>➔</span>
          <span style={{ color: (order.status === 'picked_up' || order.status === 'delivered') ? '#059669' : '#9ca3af' }}>
            {(order.status === 'picked_up' || order.status === 'delivered') ? '✓' : '○'} 3. Out for Delivery
          </span>
          <span style={{ color: '#cbd5e1' }}>➔</span>
          <span style={{ color: order.status === 'delivered' ? '#059669' : '#9ca3af' }}>
            {order.status === 'delivered' ? '✓' : '○'} 4. Delivered
          </span>
        </div>

        {/* Barcode & QR Code Section */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 140px',
            alignItems: 'center',
            gap: 16,
            padding: '14px 10px',
            borderBottom: '1.5px dashed #d1d5db',
            background: '#fafafa',
          }}
        >
          {/* 1D Laser Barcode */}
          <div style={{ textAlign: 'center' }}>
            <small style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: '#6b7280', display: 'block', marginBottom: 2 }}>
              Scannable Code 128 Barcode
            </small>
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <svg ref={barcodeRef} style={{ maxWidth: '100%', height: 'auto' }} />
            </div>
          </div>

          {/* 2D QR Code */}
          <div style={{ textAlign: 'center', borderLeft: '1px dashed #d1d5db', paddingLeft: 12 }}>
            <small style={{ fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', color: '#6b7280', display: 'block', marginBottom: 4 }}>
              Scan for Receipt
            </small>
            {qrDataUrl ? (
              <img
                src={qrDataUrl}
                alt={`QR code for order ${order.code}`}
                width={120}
                height={120}
                style={{ borderRadius: 6, border: '1px solid #e5e7eb', margin: '0 auto', display: 'block' }}
              />
            ) : (
              <div style={{ width: 120, height: 120, background: '#eee', borderRadius: 6, margin: '0 auto' }} />
            )}
            <span style={{ fontSize: 9, color: '#6b7280', display: 'block', marginTop: 3 }}>
              {qrMode === 'tracking_url' ? 'Live Mobile Tracking' : 'Full Text Receipt'}
            </span>
          </div>
        </div>

        {/* ─── Special Service Type & Fragile Banners ─── */}
        {order.is_breakable && (
          <div
            style={{
              background: '#fee2e2',
              color: '#991b1b',
              border: '2px dashed #dc2626',
              borderRadius: 6,
              padding: '6px 12px',
              margin: '12px 0 6px 0',
              fontWeight: 900,
              fontSize: 12,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              textTransform: 'uppercase',
              letterSpacing: '0.8px',
            }}
          >
            <span>⚠️ FRAGILE / قابل للكسر — HANDLE WITH EXTREME CARE</span>
          </div>
        )}

        {order.service_type === 'replacement' && (
          <div
            style={{
              background: '#fef3c7',
              color: '#92400e',
              border: '2px solid #d97706',
              borderRadius: 6,
              padding: '6px 12px',
              margin: '6px 0',
              fontWeight: 900,
              fontSize: 12,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}
          >
            <span>🔄 REPLACEMENT / تبديل — (COLLECT OLD ITEM FIRST)</span>
          </div>
        )}

        {order.service_type === 'pickup' && (
          <div
            style={{
              background: '#ede9fe',
              color: '#5b21b6',
              border: '2px solid #7c3aed',
              borderRadius: 6,
              padding: '6px 12px',
              margin: '6px 0',
              fontWeight: 900,
              fontSize: 12,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}
          >
            <span>📦 RETURN PICKUP / استلام مرتجع — (COLLECT FROM RECIPIENT)</span>
          </div>
        )}

        {/* Sender & Recipient Box */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, margin: '16px 0', padding: 12, background: '#f9fafb', borderRadius: 6, border: '1px solid #e5e7eb' }}>
          {/* Sender */}
          <div>
            <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', color: '#6b7280', letterSpacing: '0.5px' }}>
              From (Sender / Store)
            </div>
            <div style={{ fontSize: 14, fontWeight: 800, color: '#111827', marginTop: 3 }}>
              {order.shop?.name || 'Partner Merchant'}
            </div>
            {order.shop?.phone && (
              <div style={{ fontSize: 11.5, color: '#374151', marginTop: 2 }}>
                📞 {order.shop.phone}
              </div>
            )}
          </div>

          {/* Recipient */}
          <div style={{ borderLeft: '1px solid #e5e7eb', paddingLeft: 14 }}>
            <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', color: '#6b7280', letterSpacing: '0.5px' }}>
              To (Customer / Consignee)
            </div>
            <div style={{ fontSize: 14, fontWeight: 800, color: '#111827', marginTop: 3 }}>
              {order.recipient_name || 'Customer'}
            </div>
            {order.recipient_phone && (
              <div style={{ fontSize: 12, fontWeight: 700, color: '#15803d', marginTop: 2 }}>
                {order.recipient_phone}
              </div>
            )}
            <div style={{ fontSize: 11.5, color: '#374151', marginTop: 3, lineHeight: 1.4, wordBreak: 'break-word' }}>
              {formatDisplayAddress(order.recipient_address)}
            </div>
            {order.recipient_address && parseLocation(order.recipient_address).isCoords && (
              <div style={{ fontSize: 9.5, fontWeight: 700, color: '#059669', marginTop: 2 }}>
                GPS Pin: {parseLocation(order.recipient_address).lat}, {parseLocation(order.recipient_address).lng}
              </div>
            )}
            {order.area && (
              <div style={{ fontSize: 11, fontWeight: 700, color: '#2563eb', marginTop: 3 }}>
                Area: {order.area.name}
              </div>
            )}
            {order.destination_town && (
              <div style={{ fontSize: 11, fontWeight: 700, color: '#4b5563', marginTop: 2 }}>
                Dest: {[order.destination_governorate, order.destination_caza, order.destination_town].filter(Boolean).join(' - ')}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', background: '#e5e7eb', borderRadius: 4, color: '#374151' }}>
                Weight: {order.weight_kg || 1} KG
              </span>
              {order.carrier_tracking_code && (
                <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', background: '#dbeafe', borderRadius: 4, color: '#1d4ed8' }}>
                  {order.carrier_name || 'Carrier'}: {order.carrier_tracking_code}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Prominent COD Cash Collection Box */}
        <div
          style={{
            margin: '16px 0',
            padding: '14px 18px',
            background: isReturn ? '#fff7ed' : '#ecfdf5',
            borderRadius: 8,
            border: isReturn ? '2px solid #fdba74' : '2px solid #86efac',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
            <div>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 800,
                  textTransform: 'uppercase',
                  color: isReturn ? '#c2410c' : '#166534',
                  letterSpacing: '0.5px',
                  display: 'block',
                }}
              >
                {isReturn ? 'Retail Return (No COD to Collect)' : 'Total Cash to Collect on Delivery (COD)'}
              </span>
              <div style={{ fontSize: 28, fontWeight: 900, color: isReturn ? '#c2410c' : '#15803d', letterSpacing: '-0.5px', marginTop: 2 }}>
                {formatUSD(codUSD)}
              </div>
              <div style={{ fontSize: 14, fontWeight: 800, color: '#374151', marginTop: 1 }}>
                ≈ {formatLBP(codLBP)}
              </div>
            </div>

            <div style={{ textAlign: 'right', fontSize: 11.5, color: '#4b5563' }}>
              <div>Delivery Service Fee: <strong>{formatUSD(Number(order.delivery_fee_usd))}</strong></div>
              <div style={{ marginTop: 2 }}>Assigned Courier: <strong>{order.driver?.name || 'Unassigned'}</strong></div>
              <div style={{ marginTop: 2, fontSize: 10.5, color: '#6b7280' }}>Rate: {effectiveRate.toLocaleString()} LBP/USD</div>
            </div>
          </div>
        </div>

        {/* Notes & Special Handling Instructions */}
        {order.notes && (
          <div style={{ margin: '12px 0', padding: '8px 12px', background: '#fef3c7', borderRadius: 6, border: '1px solid #fde68a', fontSize: 11.5, color: '#92400e' }}>
            <strong>Special Handling Instructions:</strong> {order.notes}
          </div>
        )}

        {/* Courier & Customer Signature Receipt Acknowledgement */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginTop: 24, paddingTop: 14, borderTop: '1px dashed #9ca3af' }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: '#4b5563' }}>
              Delivered By (Courier)
            </div>
            <div style={{ marginTop: 28, borderTop: '1px solid #111827', width: '85%' }} />
            <small style={{ fontSize: 9.5, color: '#6b7280' }}>
              Courier Name: {order.driver?.name || '_______________'}
            </small>
          </div>

          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: '#4b5563' }}>
              Received in Good Condition (Customer)
            </div>
            <div style={{ marginTop: 28, borderTop: '1px solid #111827', width: '85%', marginLeft: 'auto' }} />
            <small style={{ fontSize: 9.5, color: '#6b7280' }}>Customer Signature & Date</small>
          </div>
        </div>

        {/* Footnote */}
        <div style={{ textAlign: 'center', marginTop: 18, paddingTop: 8, borderTop: '1px solid #f3f4f6', fontSize: 9.5, color: '#9ca3af' }}>
          Cedar Delivery Desk · Customer Support & Dispatch Hotline · Track: {trackingUrl}
        </div>
      </div>
    </div>
  )
}
