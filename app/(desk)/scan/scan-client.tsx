'use client'

import React, { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import {
  formatUSD,
  formatLBP,
  usdToLbp,
  formatDate,
  ORDER_STATUS_LABELS,
} from '@/lib/utils'
import { WhatsAppIcon } from '@/components/whatsapp-icon'
import { GoogleMapsIcon } from '@/components/google-maps-icon'
import { getGoogleMapsDirectionsUrl } from '@/lib/maps'
import { getCustomerOrderWhatsAppUrl } from '@/lib/whatsapp'
import {
  ScanIcon,
  PackageIcon,
  CheckIcon,
  TruckIcon,
  PrinterIcon,
  SearchIcon,
  RefreshIcon,
  PhoneIcon,
  AlertCircleIcon,
} from '@/components/icons'

interface Driver {
  id: string
  name: string
  phone: string | null
  active: boolean
}

interface ScannedOrder {
  id: string
  code: string
  tracking_token?: string
  status: string
  collection_usd: number
  delivery_fee_usd: number
  driver_pay_usd: number
  shop_balance_usd: number
  usd_to_lbp_rate: number
  created_at: string
  delivered_at: string | null
  recipient_name: string | null
  recipient_phone: string | null
  recipient_address: string | null
  notes: string | null
  driver_id: string | null
  shop?: { id: string; name: string; phone: string | null } | null
  area?: { id: string; name: string } | null
  driver?: { id: string; name: string; phone: string | null } | null
}

interface ScanClientProps {
  workspaceId: string
  drivers: Driver[]
  exchangeRate: number
}

// Audio synthesizer for scanner beep feedback
function playScannerBeep(success = true) {
  try {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!AudioContextClass) return
    const ctx = new AudioContextClass()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()

    osc.type = success ? 'sine' : 'sawtooth'
    osc.frequency.setValueAtTime(success ? 987.77 : 320, ctx.currentTime) // B5 for success, low buzz for fail
    if (success) {
      osc.frequency.exponentialRampToValueAtTime(1318.51, ctx.currentTime + 0.08) // E6 chirrup
    }

    gain.gain.setValueAtTime(0.2, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15)

    osc.connect(gain)
    gain.connect(ctx.destination)

    osc.start()
    osc.stop(ctx.currentTime + 0.16)
  } catch {
    // Audio context may be restricted by browser gesture policy
  }
}

// Haptic feedback
function triggerHaptic() {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    try {
      navigator.vibrate([40, 30, 60])
    } catch {
      // Ignore
    }
  }
}

export function ScanClient({ workspaceId, drivers, exchangeRate }: ScanClientProps) {
  const [isScanning, setIsScanning] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [manualCode, setManualCode] = useState('')
  const [scannedCode, setScannedCode] = useState<string | null>(null)
  const [order, setOrder] = useState<ScannedOrder | null>(null)
  const [loading, setLoading] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null)
  const [scanHistory, setScanHistory] = useState<Array<{ code: string; status: string; time: string }>>([])
  const [continuousMode, setContinuousMode] = useState(false)
  const [targetAction, setTargetAction] = useState<'view' | 'pickup' | 'deliver'>('view')
  const [targetDriverId, setTargetDriverId] = useState<string>('')

  const scannerRef = useRef<unknown>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const isProcessingRef = useRef(false)

  function showMessage(text: string, type: 'success' | 'error') {
    setStatusMessage({ text, type })
    setTimeout(() => setStatusMessage(null), 4000)
  }

  // Handle looking up an order from a scanned or typed raw string
  async function processCode(rawInput: string) {
    if (!rawInput || isProcessingRef.current) return
    isProcessingRef.current = true

    // 1. Extract clean order code: can be URL "https://.../track/CED-XXXX" or raw "CED-XXXX"
    let clean = rawInput.trim()
    const urlMatch = clean.match(/track\/([A-Za-z0-9_-]+)/i)
    if (urlMatch && urlMatch[1]) {
      clean = urlMatch[1]
    } else {
      // Remove any leading '#' or spaces
      clean = clean.replace(/^#/, '')
    }

    setScannedCode(clean)
    setLoading(true)

    try {
      // Fetch order by code
      const res = await fetch(`/api/orders?search=${encodeURIComponent(clean)}&exact=true`)
      const data = await res.json()

      let matchedOrder: ScannedOrder | null = null
      if (res.ok && data.orders && data.orders.length > 0) {
        // Find exact code match
        matchedOrder = data.orders.find((o: ScannedOrder) => o.code.toUpperCase() === clean.toUpperCase()) || data.orders[0]
      }

      if (!matchedOrder) {
        playScannerBeep(false)
        showMessage(`No order found matching "${clean}"`, 'error')
        setOrder(null)
      } else {
        playScannerBeep(true)
        triggerHaptic()
        setOrder(matchedOrder)

        // Add to scan history
        setScanHistory(prev => [
          { code: matchedOrder!.code, status: matchedOrder!.status, time: new Date().toLocaleTimeString() },
          ...prev.slice(0, 9),
        ])

        // Automatic action if continuous mode is on
        if (continuousMode) {
          if (targetAction === 'pickup' && matchedOrder.status !== 'picked_up') {
            await handleUpdateStatus(matchedOrder.id, 'picked_up', targetDriverId || undefined)
          } else if (targetAction === 'deliver' && matchedOrder.status !== 'delivered') {
            await handleUpdateStatus(matchedOrder.id, 'delivered')
          }
        }
      }
    } catch {
      playScannerBeep(false)
      showMessage('Error querying order details', 'error')
    } finally {
      setLoading(false)
      setTimeout(() => {
        isProcessingRef.current = false
      }, 1200)
    }
  }

  // Update order status or assigned driver
  async function handleUpdateStatus(orderId: string, newStatus: string, driverId?: string) {
    setActionLoading(true)
    try {
      const payload: Record<string, unknown> = {
        orderId,
        workspaceId,
        status: newStatus,
      }
      if (driverId) {
        payload.driverId = driverId
      }

      const res = await fetch('/api/orders', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to update order')

      showMessage(`Order ${order?.code || ''} updated to ${ORDER_STATUS_LABELS[newStatus as keyof typeof ORDER_STATUS_LABELS] || newStatus}!`, 'success')

      // Update local order view
      setOrder(prev => prev ? { ...prev, status: newStatus, driver_id: driverId || prev.driver_id } : null)
    } catch (err: unknown) {
      showMessage(err instanceof Error ? err.message : 'Update failed', 'error')
    } finally {
      setActionLoading(false)
    }
  }

  // Assign driver to order
  async function handleAssignDriver(driverId: string) {
    if (!order) return
    setActionLoading(true)
    try {
      const res = await fetch('/api/orders', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: order.id,
          workspaceId,
          driverId: driverId || null,
          status: driverId && order.status === 'pending' ? 'assigned' : order.status,
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to assign courier')

      const foundDriver = drivers.find(d => d.id === driverId)
      setOrder(prev => prev ? {
        ...prev,
        driver_id: driverId || null,
        driver: foundDriver || null,
        status: driverId && prev.status === 'pending' ? 'assigned' : prev.status,
      } : null)

      showMessage(`Assigned to ${foundDriver?.name || 'Unassigned'}`, 'success')
    } catch (err: unknown) {
      showMessage(err instanceof Error ? err.message : 'Failed to assign driver', 'error')
    } finally {
      setActionLoading(false)
    }
  }

  // Camera Scanner Lifecycle
  useEffect(() => {
    let html5QrCode: any = null

    if (isScanning) {
      // Dynamic import to prevent SSR issues
      import('html5-qrcode').then(({ Html5Qrcode }) => {
        const scannerElement = document.getElementById('qr-reader')
        if (!scannerElement) return

        html5QrCode = new Html5Qrcode('qr-reader')
        scannerRef.current = html5QrCode

        html5QrCode
          .start(
            { facingMode: 'environment' },
            {
              fps: 15,
              qrbox: { width: 280, height: 280 },
              aspectRatio: 1.0,
            },
            (decodedText: string) => {
              processCode(decodedText)
            },
            () => {
              // Ignore frame scan failures
            }
          )
          .catch((err: unknown) => {
            setCameraError(err instanceof Error ? err.message : 'Could not access device camera. Please check browser permissions.')
            setIsScanning(false)
          })
      })
    } else if (scannerRef.current) {
      try {
        const instance = scannerRef.current as { stop: () => Promise<void>; clear: () => void }
        instance.stop().catch(() => {}).finally(() => {
          instance.clear()
          scannerRef.current = null
        })
      } catch {
        // Ignore stop error
      }
    }

    return () => {
      if (scannerRef.current) {
        try {
          const instance = scannerRef.current as { stop: () => Promise<void>; clear: () => void }
          instance.stop().catch(() => {})
        } catch {
          // Ignore
        }
      }
    }
  }, [isScanning])

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', paddingBottom: 60 }}>
      {/* Page Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <ScanIcon size={24} color="var(--brand)" />
            <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>Parcel Barcode & QR Scanner</h1>
          </div>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--muted)' }}>
            Point your camera or use a USB barcode laser gun to scan package shipping labels instantly.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            type="button"
            className={isScanning ? 'btn btn-secondary' : 'btn btn-primary'}
            onClick={() => {
              setCameraError(null)
              setIsScanning(!isScanning)
            }}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
          >
            <ScanIcon size={16} />
            <span>{isScanning ? 'Stop Camera' : 'Start Camera Scanner'}</span>
          </button>
        </div>
      </div>

      {/* Notification Toast */}
      {statusMessage && (
        <div
          style={{
            padding: '12px 18px',
            borderRadius: 10,
            marginBottom: 20,
            fontSize: 14,
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            background: statusMessage.type === 'success' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
            border: `1px solid ${statusMessage.type === 'success' ? '#10b981' : '#ef4444'}`,
            color: statusMessage.type === 'success' ? '#34d399' : '#f87171',
          }}
        >
          {statusMessage.type === 'success' ? <CheckIcon size={18} /> : <AlertCircleIcon size={18} />}
          <span>{statusMessage.text}</span>
        </div>
      )}

      {/* Scanner & Manual Input Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20, marginBottom: 24 }}>
        {/* Left Column: Viewfinder / Manual input */}
        <div className="panel" style={{ padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <span style={{ fontSize: 14, fontWeight: 700 }}>Optical Camera Viewfinder</span>
            {isScanning && (
              <span style={{ fontSize: 11, fontWeight: 700, color: '#10b981', display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#10b981', display: 'inline-block' }} />
                LIVE
              </span>
            )}
          </div>

          {/* Camera Viewfinder Box */}
          <div
            id="qr-reader"
            style={{
              width: '100%',
              minHeight: 260,
              background: '#0a0f1d',
              borderRadius: 12,
              overflow: 'hidden',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: isScanning ? '2px solid var(--brand)' : '1px dashed var(--line)',
              position: 'relative',
            }}
          >
            {!isScanning && (
              <div style={{ textAlign: 'center', padding: 30, color: 'var(--muted)' }}>
                <ScanIcon size={40} style={{ margin: '0 auto 12px', opacity: 0.5 }} />
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>Camera is Off</div>
                <div style={{ fontSize: 12, marginTop: 4 }}>Click &quot;Start Camera Scanner&quot; above to scan with your device</div>
              </div>
            )}
          </div>

          {cameraError && (
            <div style={{ marginTop: 12, fontSize: 12, color: '#f87171', background: 'rgba(239, 68, 68, 0.1)', padding: '8px 12px', borderRadius: 8 }}>
              {cameraError}
            </div>
          )}

          {/* Laser Scanner / Keyboard Manual Input */}
          <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--line)' }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--muted)', marginBottom: 6 }}>
              OR SCAN VIA USB BARCODE GUN / TYPE CODE:
            </label>
            <form
              onSubmit={(e) => {
                e.preventDefault()
                processCode(manualCode)
                setManualCode('')
              }}
              style={{ display: 'flex', gap: 8 }}
            >
              <input
                ref={inputRef}
                type="text"
                placeholder="e.g. CED-000142"
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
                style={{
                  flex: 1,
                  padding: '10px 14px',
                  background: 'var(--surface)',
                  border: '1px solid var(--line)',
                  borderRadius: 8,
                  fontSize: 14,
                  fontWeight: 600,
                  color: 'var(--ink)',
                }}
              />
              <button type="submit" className="btn btn-secondary" style={{ padding: '10px 16px' }}>
                <SearchIcon size={15} />
              </button>
            </form>
          </div>
        </div>

        {/* Right Column: Workflow Automation Settings */}
        <div className="panel" style={{ padding: 20 }}>
          <span style={{ fontSize: 14, fontWeight: 700, display: 'block', marginBottom: 12 }}>
            Batch Workflow Automation
          </span>

          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', marginBottom: 16 }}>
            <input
              type="checkbox"
              checked={continuousMode}
              onChange={(e) => setContinuousMode(e.target.checked)}
              style={{ width: 18, height: 18, accentColor: 'var(--brand)' }}
            />
            <div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>Continuous Scan Mode</div>
              <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                Automatically apply designated action immediately upon detecting a package
              </div>
            </div>
          </label>

          {continuousMode && (
            <div style={{ padding: 14, background: 'rgba(20, 83, 45, 0.08)', borderRadius: 10, border: '1px solid var(--line)', marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8, color: 'var(--brand)' }}>
                When a package barcode is detected:
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="action"
                    checked={targetAction === 'view'}
                    onChange={() => setTargetAction('view')}
                  />
                  <span>Just show details & verification</span>
                </label>

                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="action"
                    checked={targetAction === 'pickup'}
                    onChange={() => setTargetAction('pickup')}
                  />
                  <span>Mark In-Transit / Picked Up & assign to:</span>
                </label>

                {targetAction === 'pickup' && (
                  <select
                    value={targetDriverId}
                    onChange={(e) => setTargetDriverId(e.target.value)}
                    style={{
                      padding: '8px 12px',
                      borderRadius: 8,
                      border: '1px solid var(--line)',
                      background: 'var(--surface)',
                      color: 'var(--ink)',
                      fontSize: 13,
                      marginLeft: 22,
                    }}
                  >
                    <option value="">Keep current driver</option>
                    {drivers.map(d => (
                      <option key={d.id} value={d.id}>{d.name} {d.phone ? `(${d.phone})` : ''}</option>
                    ))}
                  </select>
                )}

                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="action"
                    checked={targetAction === 'deliver'}
                    onChange={() => setTargetAction('deliver')}
                  />
                  <span>Mark Delivered & Record COD collection</span>
                </label>
              </div>
            </div>
          )}

          {/* Recent Scans Strip */}
          <div style={{ marginTop: 20 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', display: 'block', marginBottom: 8 }}>
              SESSION SCAN HISTORY
            </span>

            {scanHistory.length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--muted)', fontStyle: 'italic' }}>No packages scanned yet in this session.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {scanHistory.map((item, idx) => (
                  <div
                    key={idx}
                    onClick={() => processCode(item.code)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '6px 10px',
                      background: 'var(--surface)',
                      borderRadius: 6,
                      fontSize: 12,
                      cursor: 'pointer',
                    }}
                  >
                    <span style={{ fontWeight: 700, color: 'var(--brand)' }}>{item.code}</span>
                    <span style={{ color: 'var(--muted)' }}>{item.time}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Scanned Order Details Panel */}
      {loading && (
        <div className="panel" style={{ padding: 30, textAlign: 'center', color: 'var(--muted)' }}>
          <RefreshIcon size={24} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 8px' }} />
          <div>Looking up order #{scannedCode}…</div>
        </div>
      )}

      {order && !loading && (
        <div
          className="panel"
          style={{
            padding: 24,
            borderColor: 'var(--brand)',
            boxShadow: '0 8px 30px rgba(20, 83, 45, 0.15)',
            background: 'linear-gradient(135deg, var(--surface) 0%, rgba(20, 83, 45, 0.03) 100%)',
          }}
        >
          {/* Header row */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 14, marginBottom: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 12,
                  background: 'var(--brand)',
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <PackageIcon size={24} />
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <h2 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>
                    {order.code}
                  </h2>
                  <span className={`badge badge-${order.status}`}>
                    {ORDER_STATUS_LABELS[order.status as keyof typeof ORDER_STATUS_LABELS] || order.status}
                  </span>
                </div>
                <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2 }}>
                  Store: <strong>{order.shop?.name || 'Standard Store'}</strong>
                  {order.shop?.phone && ` (${order.shop.phone})`}
                </div>
              </div>
            </div>

            {/* Quick Link Buttons */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Link
                href={`/print/order/${order.code}`}
                target="_blank"
                className="btn btn-secondary"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                <PrinterIcon size={14} />
                Print Label
              </Link>

              <Link
                href={`/track/${order.tracking_token || order.code}`}
                target="_blank"
                className="btn btn-ghost"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                Public Tracking
              </Link>
            </div>
          </div>

          {/* Details Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginBottom: 20 }}>
            {/* Recipient */}
            <div style={{ padding: 14, background: 'var(--background)', borderRadius: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>
                Recipient
              </div>
              <div style={{ fontSize: 15, fontWeight: 700, marginTop: 4 }}>
                {order.recipient_name || 'Anonymous Recipient'}
              </div>
              {order.recipient_phone && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                  <a
                    href={`tel:${order.recipient_phone}`}
                    style={{ fontSize: 13, color: 'var(--ink)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}
                  >
                    <PhoneIcon size={12} />
                    {order.recipient_phone}
                  </a>

                  <a
                    href={getCustomerOrderWhatsAppUrl({
                      customerPhone: order.recipient_phone,
                      customerName: order.recipient_name,
                      orderCode: order.code,
      trackingToken: order.tracking_token,
                      shopName: order.shop?.name,
                      collectionUsd: Number(order.collection_usd) || 0,
                      driverName: order.driver?.name,
                      status: order.status,
                    })}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="whatsapp-badge"
                    style={{ padding: '2px 6px', fontSize: 11 }}
                  >
                    <WhatsAppIcon size={12} />
                    WhatsApp
                  </a>
                </div>
              )}
            </div>

            {/* Address */}
            <div style={{ padding: 14, background: 'var(--background)', borderRadius: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>
                Delivery Location
              </div>
              <div style={{ fontSize: 13, fontWeight: 600, marginTop: 4 }}>
                {order.recipient_address || 'No specific street address provided'}
              </div>
              {order.area && (
                <div style={{ fontSize: 12, color: 'var(--brand)', marginTop: 4 }}>
                  Zone: {order.area.name}
                </div>
              )}
              {order.recipient_address && (
                <div style={{ marginTop: 8 }}>
                  <a
                    href={getGoogleMapsDirectionsUrl(order.recipient_address)}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ fontSize: 12, color: 'var(--brand)', display: 'inline-flex', alignItems: 'center', gap: 4, textDecoration: 'none' }}
                  >
                    <GoogleMapsIcon size={12} />
                    Open in Maps
                  </a>
                </div>
              )}
            </div>

            {/* COD Cash Amount */}
            <div style={{ padding: 14, background: 'var(--background)', borderRadius: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>
                COD Cash Collection
              </div>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#10b981', marginTop: 4 }}>
                {formatUSD(Number(order.collection_usd) || 0)}
              </div>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                ≈ {formatLBP(usdToLbp(Number(order.collection_usd) || 0, exchangeRate))}
              </div>
            </div>

            {/* Assigned Driver */}
            <div style={{ padding: 14, background: 'var(--background)', borderRadius: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>
                Courier Assignment
              </div>
              <div style={{ marginTop: 6 }}>
                <select
                  value={order.driver_id || ''}
                  disabled={actionLoading}
                  onChange={(e) => handleAssignDriver(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: 8,
                    border: '1px solid var(--line)',
                    background: 'var(--surface)',
                    color: 'var(--ink)',
                    fontSize: 13,
                    fontWeight: 600,
                  }}
                >
                  <option value="">— Unassigned —</option>
                  {drivers.map(d => (
                    <option key={d.id} value={d.id}>
                      {d.name} {d.phone ? `(${d.phone})` : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Fast Status Action Buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', borderTop: '1px solid var(--line)', paddingTop: 16 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)' }}>Quick Actions:</span>

            {order.status !== 'picked_up' && (
              <button
                type="button"
                disabled={actionLoading}
                onClick={() => handleUpdateStatus(order.id, 'picked_up')}
                className="btn btn-secondary"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                <TruckIcon size={14} />
                <span>Mark In-Transit / Picked Up</span>
              </button>
            )}

            {order.status !== 'delivered' && (
              <button
                type="button"
                disabled={actionLoading}
                onClick={() => handleUpdateStatus(order.id, 'delivered')}
                className="btn btn-primary"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#10b981', borderColor: '#10b981' }}
              >
                <CheckIcon size={14} color="#fff" />
                <span>Mark Delivered & Collect COD</span>
              </button>
            )}

            {order.status !== 'failed' && (
              <button
                type="button"
                disabled={actionLoading}
                onClick={() => handleUpdateStatus(order.id, 'failed')}
                className="btn btn-secondary"
                style={{ color: '#f87171' }}
              >
                Postpone / Reschedule
              </button>
            )}

            {order.status === 'delivered' && (
              <button
                type="button"
                disabled={actionLoading}
                onClick={() => handleUpdateStatus(order.id, 'picked_up')}
                className="btn btn-ghost"
                style={{ fontSize: 12 }}
              >
                Revert to In-Transit
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
