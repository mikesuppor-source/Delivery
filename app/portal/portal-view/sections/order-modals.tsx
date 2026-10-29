'use client'

import React from 'react'
import Link from 'next/link'
import { Modal } from '@/components/modal'
import { usePortal } from '../context'
import { formatUSD, formatLBP, usdToLbp, formatDate, ORDER_STATUS_LABELS } from '@/lib/utils'
import { PrinterIcon, TrashIcon } from '@/components/icons'
import { WhatsAppIcon } from '@/components/whatsapp-icon'
import { GoogleMapsIcon } from '@/components/google-maps-icon'
import { getGoogleMapsDirectionsUrl, getWazeDirectionsUrl } from '@/lib/maps'

export function OrderModals() {
  const {
    shop,
    rate,
    confirmedOrder,
    setConfirmedOrder,
    setIsModalOpen,
    inspectingOrder,
    setInspectingOrder,
    cancelError,
    setCancelError,
    isCancelling,
    handleCancelOrder,
    isDeleting,
    handleDeleteOrders,
  } = usePortal()

  const origin = typeof window !== 'undefined' ? window.location.origin : (process.env.NEXT_PUBLIC_SITE_URL || '')

  return (
    <>
      {/* Order Created Confirmation & Waybill Slip Modal */}
      {confirmedOrder && (
        <Modal
          isOpen={!!confirmedOrder}
          onClose={() => setConfirmedOrder(null)}
          title="Order Registered Successfully"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18, textAlign: 'center' }}>
            <div
              style={{
                background: 'var(--bg)',
                border: '2px solid var(--brand)',
                borderRadius: 12,
                padding: '20px',
              }}
            >
              <span style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', color: 'var(--muted)' }}>
                Unique Waybill Tracking Code
              </span>
              <div style={{ fontSize: 26, fontWeight: 900, fontFamily: 'monospace', color: 'var(--brand)', marginTop: 2 }}>
                #{confirmedOrder.code}
              </div>
              <small style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginTop: 4 }}>
                This barcode ID is verified and guaranteed unique across Cedar Delivery.
              </small>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 14, textAlign: 'left', fontSize: 12.5 }}>
                <div style={{ background: 'var(--surface)', padding: '10px', borderRadius: 6, border: '1px solid var(--line)' }}>
                  <span style={{ color: 'var(--muted)', display: 'block', fontSize: 11 }}>Recipient:</span>
                  <strong>{confirmedOrder.recipient_name}</strong>
                  <span style={{ display: 'block', color: 'var(--muted)', fontSize: 11 }}>Phone: {confirmedOrder.recipient_phone}</span>
                </div>
                <div style={{ background: 'var(--surface)', padding: '10px', borderRadius: 6, border: '1px solid var(--line)' }}>
                  <span style={{ color: 'var(--muted)', display: 'block', fontSize: 11 }}>Destination:</span>
                  <strong>{confirmedOrder.area?.name}</strong>
                  <span style={{ display: 'block', color: 'var(--muted)', fontSize: 11 }}>{confirmedOrder.recipient_address}</span>
                </div>
              </div>

              <div style={{ marginTop: 12, padding: '10px', background: '#ecfdf5', borderRadius: 6, border: '1px solid #86efac', textAlign: 'left', fontSize: 12.5 }}>
                <span style={{ color: '#065f46', fontWeight: 700, display: 'block' }}>
                  Amount to Collect: {formatUSD(Number(confirmedOrder.collection_usd))} ({formatLBP(usdToLbp(Number(confirmedOrder.collection_usd), confirmedOrder.usd_to_lbp_rate || rate))})
                </span>
                <small style={{ color: '#065f46' }}>
                  Net payout to your store: {formatUSD(Number(confirmedOrder.shop_balance_usd))}
                </small>
              </div>
            </div>

            {/* Actions for store: Print Waybill Slip and WhatsApp customer */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <Link
                href={`/print/order/${confirmedOrder.code}?print=true`}
                target="_blank"
                className="btn btn-primary"
                style={{
                  padding: '12px 18px',
                  fontSize: 14,
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  textDecoration: 'none',
                }}
              >
                <PrinterIcon size={16} />
                <span>Print Scannable Barcode & QR Slip</span>
              </Link>

              {confirmedOrder.recipient_phone && (
                <a
                  href={`https://wa.me/${confirmedOrder.recipient_phone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(
                    `Hello ${confirmedOrder.recipient_name}! Your delivery from ${shop.name} has been booked. Tracking code: #${confirmedOrder.code}. Track your package live: ${origin}/track/${confirmedOrder.tracking_token || confirmedOrder.code}. Total Cash on Delivery: $${Number(confirmedOrder.collection_usd).toFixed(2)} (${usdToLbp(Number(confirmedOrder.collection_usd), confirmedOrder.usd_to_lbp_rate || rate).toLocaleString()} L.L.). Thank you!`,
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-secondary"
                  style={{
                    padding: '11px 18px',
                    fontSize: 13,
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    color: '#047857',
                  }}
                >
                  <WhatsAppIcon size={16} color="#047857" />
                  <span>Send WhatsApp Confirmation to Customer</span>
                </a>
              )}

              <button
                type="button"
                onClick={() => {
                  setConfirmedOrder(null)
                  setIsModalOpen(true)
                }}
                className="btn btn-ghost"
                style={{ fontSize: 13 }}
              >
                ＋ Make Another Order
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ─── Order Status & Details Modal ─── */}
      {inspectingOrder && (
        <Modal
          isOpen={!!inspectingOrder}
          onClose={() => {
            setInspectingOrder(null)
            setCancelError('')
          }}
          title={`Order Details & Live Status — #${inspectingOrder.code}`}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Header Status Bar */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 10,
                padding: '12px 16px',
                background: 'var(--bg)',
                borderRadius: 10,
                border: '1.5px solid var(--line)',
              }}
            >
              <div>
                <span style={{ fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', color: 'var(--muted)', letterSpacing: '0.5px' }}>
                  Waybill Barcode ID
                </span>
                <div style={{ fontSize: 20, fontWeight: 900, fontFamily: 'monospace', color: 'var(--brand)' }}>
                  #{inspectingOrder.code}
                </div>
                <small style={{ fontSize: 11, color: 'var(--muted)' }}>
                  Registered on {formatDate(inspectingOrder.created_at)}
                </small>
              </div>

              <div style={{ textAlign: 'right' }}>
                <span style={{ fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', color: 'var(--muted)', letterSpacing: '0.5px', display: 'block', marginBottom: 2 }}>
                  Current Status
                </span>
                <span
                  className={`badge badge-${inspectingOrder.status}`}
                  style={{ fontSize: 12.5, padding: '4px 12px', fontWeight: 800 }}
                >
                  {ORDER_STATUS_LABELS[inspectingOrder.status] || inspectingOrder.status}
                </span>
              </div>
            </div>

            {cancelError && (
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', padding: '8px 12px', borderRadius: 6, fontSize: 12 }}>
                {cancelError}
              </div>
            )}

            {/* Visual 4-Step Stepper Timeline */}
            <div
              style={{
                background: 'var(--surface)',
                border: '1.5px solid var(--line)',
                borderRadius: 10,
                padding: '16px',
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', color: 'var(--muted)', letterSpacing: '0.5px', marginBottom: 12 }}>
                Live Delivery Milestones
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {/* Step 1: Placed */}
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  <div
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: '50%',
                      background: '#10b981',
                      color: '#ffffff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 12,
                      fontWeight: 800,
                      flexShrink: 0,
                    }}
                  >
                    ✓
                  </div>
                  <div>
                    <strong style={{ fontSize: 13, color: 'var(--text)' }}>
                      1. Order Registered at Store
                    </strong>
                    <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>
                      Waybill created on {formatDate(inspectingOrder.created_at)}
                    </div>
                  </div>
                </div>

                {/* Step 2: Courier Assigned */}
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  <div
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: '50%',
                      background: inspectingOrder.status !== 'pending' ? '#10b981' : '#e5e7eb',
                      color: inspectingOrder.status !== 'pending' ? '#ffffff' : '#9ca3af',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 12,
                      fontWeight: 800,
                      flexShrink: 0,
                    }}
                  >
                    {inspectingOrder.status !== 'pending' ? '✓' : '2'}
                  </div>
                  <div>
                    <strong style={{ fontSize: 13, color: inspectingOrder.status !== 'pending' ? 'var(--text)' : 'var(--muted)' }}>
                      2. Courier Assigned
                    </strong>
                    <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>
                      {inspectingOrder.driver
                        ? `Assigned to ${inspectingOrder.driver.name}${inspectingOrder.driver.phone ? ` (${inspectingOrder.driver.phone})` : ''}`
                        : 'Waiting for dispatch manager to assign courier'}
                    </div>
                  </div>
                </div>

                {/* Step 3: Out for Delivery */}
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  <div
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: '50%',
                      background: inspectingOrder.status === 'picked_up' || inspectingOrder.status === 'delivered' ? '#10b981' : '#e5e7eb',
                      color: inspectingOrder.status === 'picked_up' || inspectingOrder.status === 'delivered' ? '#ffffff' : '#9ca3af',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 12,
                      fontWeight: 800,
                      flexShrink: 0,
                    }}
                  >
                    {inspectingOrder.status === 'picked_up' || inspectingOrder.status === 'delivered' ? '✓' : '3'}
                  </div>
                  <div>
                    <strong style={{ fontSize: 13, color: inspectingOrder.status === 'picked_up' || inspectingOrder.status === 'delivered' ? 'var(--text)' : 'var(--muted)' }}>
                      3. Picked Up & Out for Delivery
                    </strong>
                    <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>
                      {inspectingOrder.status === 'picked_up' || inspectingOrder.status === 'delivered'
                        ? 'Package in transit with courier to customer address'
                        : 'Package awaiting courier pickup from store'}
                    </div>
                  </div>
                </div>

                {/* Step 4: Delivered or Returned */}
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  <div
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: '50%',
                      background: inspectingOrder.status === 'delivered' ? '#10b981' : inspectingOrder.status === 'returned' ? '#ef4444' : '#e5e7eb',
                      color: inspectingOrder.status === 'delivered' || inspectingOrder.status === 'returned' ? '#ffffff' : '#9ca3af',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 12,
                      fontWeight: 800,
                      flexShrink: 0,
                    }}
                  >
                    {inspectingOrder.status === 'delivered' ? '✓' : inspectingOrder.status === 'returned' ? '✕' : '4'}
                  </div>
                  <div>
                    <strong style={{ fontSize: 13, color: inspectingOrder.status === 'delivered' ? '#047857' : inspectingOrder.status === 'returned' ? '#b91c1c' : 'var(--muted)' }}>
                      {inspectingOrder.status === 'returned' ? 'Cancelled / Returned to Store' : '4. Delivered (COD Cleared)'}
                    </strong>
                    <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>
                      {inspectingOrder.status === 'delivered'
                        ? `Successfully delivered${inspectingOrder.delivered_at ? ` on ${formatDate(inspectingOrder.delivered_at)}` : ''} and cash collected.`
                        : inspectingOrder.status === 'returned'
                        ? 'Order was cancelled or returned to store.'
                        : 'Customer payment collection upon physical handover'}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Recipient & Location Info Card */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 12,
                fontSize: 12.5,
              }}
            >
              <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 8, padding: '12px' }}>
                <span style={{ fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', color: 'var(--muted)', display: 'block' }}>
                  Customer Details
                </span>
                <strong style={{ fontSize: 13, color: 'var(--text)', display: 'block', marginTop: 2 }}>
                  {inspectingOrder.recipient_name || 'Customer'}
                </strong>
                {inspectingOrder.recipient_phone && (
                  <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ color: 'var(--muted)' }}>{inspectingOrder.recipient_phone}</span>
                    <a
                      href={`https://wa.me/${inspectingOrder.recipient_phone.replace(/[^0-9]/g, '')}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: '#059669', display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11, fontWeight: 700 }}
                    >
                      <WhatsAppIcon size={12} color="#059669" />
                      <span>Chat</span>
                    </a>
                  </div>
                )}
              </div>

              <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 8, padding: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', color: 'var(--muted)', display: 'block' }}>
                    Delivery Destination
                  </span>
                  {inspectingOrder.recipient_address && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <a
                        href={getGoogleMapsDirectionsUrl(inspectingOrder.recipient_address)}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11, color: 'var(--brand)', fontWeight: 600, textDecoration: 'none' }}
                        title="Open Google Maps Directions"
                      >
                        <GoogleMapsIcon size={11} />
                        <span>Maps</span>
                      </a>
                      <a
                        href={getWazeDirectionsUrl(inspectingOrder.recipient_address)}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11, color: '#0284c7', fontWeight: 600, textDecoration: 'none' }}
                        title="Open in Waze Navigation"
                      >
                        <span>Waze</span>
                      </a>
                    </div>
                  )}
                </div>
                <strong style={{ fontSize: 13, color: 'var(--text)', display: 'block', marginTop: 2 }}>
                  {inspectingOrder.area?.name || 'Standard Area'}
                </strong>
                <span style={{ fontSize: 11.5, color: 'var(--muted)', display: 'block', marginTop: 2 }}>
                  {inspectingOrder.recipient_address || 'Address on file'}
                </span>
              </div>
            </div>

            {/* Financial Settlement Breakdown */}
            <div
              style={{
                background: 'var(--brand-light)',
                border: '1.5px solid var(--brand)',
                borderRadius: 8,
                padding: '12px 16px',
                fontSize: 12.5,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ color: 'var(--muted)' }}>Cash to Collect from Customer (COD):</span>
                <strong>
                  {formatUSD(Number(inspectingOrder.collection_usd))} ({formatLBP(usdToLbp(Number(inspectingOrder.collection_usd), inspectingOrder.usd_to_lbp_rate || rate))})
                </strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ color: 'var(--muted)' }}>Delivery Service Fee:</span>
                <span style={{ color: '#dc2626', fontWeight: 600 }}>
                  -{formatUSD(Number(inspectingOrder.delivery_fee_usd))} ({formatLBP(usdToLbp(Number(inspectingOrder.delivery_fee_usd), inspectingOrder.usd_to_lbp_rate || rate))})
                </span>
              </div>
              <div style={{ borderTop: '1px solid var(--line)', paddingTop: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <strong style={{ color: 'var(--text)' }}>Net Store Payout:</strong>
                <strong style={{ fontSize: 15, color: '#047857' }}>
                  {formatUSD(Number(inspectingOrder.shop_balance_usd))}
                  <small style={{ display: 'block', fontSize: 11, fontWeight: 500, color: 'var(--muted)', textAlign: 'right' }}>
                    ({formatLBP(usdToLbp(Number(inspectingOrder.shop_balance_usd), inspectingOrder.usd_to_lbp_rate || rate))})
                  </small>
                </strong>
              </div>
            </div>

            {/* Special Instructions */}
            {inspectingOrder.notes && (
              <div style={{ background: '#fef3c7', border: '1px solid #fde68a', color: '#92400e', padding: '10px 14px', borderRadius: 8, fontSize: 12 }}>
                <strong>Handling Notes:</strong> {inspectingOrder.notes}
              </div>
            )}

            {/* Modal Actions */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginTop: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {inspectingOrder.status === 'pending' && (
                  <button
                    type="button"
                    disabled={isCancelling}
                    onClick={() => handleCancelOrder(inspectingOrder.id)}
                    className="btn btn-ghost btn-sm"
                    style={{ color: '#d97706', border: '1px solid #fde68a', fontSize: 12 }}
                  >
                    {isCancelling ? 'Cancelling…' : 'Cancel Pickup'}
                  </button>
                )}

                {inspectingOrder.status === 'pending' && (
                  <button
                    type="button"
                    disabled={isDeleting}
                    onClick={() => handleDeleteOrders([inspectingOrder.id], `#${inspectingOrder.code}`)}
                    className="btn btn-ghost btn-sm"
                    style={{ color: '#dc2626', border: '1px solid #fecaca', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 5 }}
                    title="Cancel this pending order and void fees"
                  >
                    <TrashIcon size={13} color="#dc2626" />
                    <span>{isDeleting ? 'Cancelling…' : 'Cancel Order'}</span>
                  </button>
                )}
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <Link
                  href={`/print/order/${inspectingOrder.code}?print=true`}
                  target="_blank"
                  className="btn btn-secondary btn-sm"
                  style={{ fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }}
                >
                  <PrinterIcon size={13} />
                  <span>Print Slip</span>
                </Link>

                <Link
                  href={`/track/${inspectingOrder.tracking_token || inspectingOrder.code}`}
                  target="_blank"
                  className="btn btn-primary btn-sm"
                  style={{ fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 5 }}
                >
                  <span>Track ↗</span>
                </Link>
              </div>
            </div>
          </div>
        </Modal>
      )}
    </>
  )
}
