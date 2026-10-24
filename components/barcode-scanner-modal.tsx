'use client'

import React, { useState, useEffect, useRef } from 'react'
import { Modal } from './modal'
import { formatUSD, formatLBP, usdToLbp } from '@/lib/utils'
import type { OrderStatus } from '@/lib/roles'
import Link from 'next/link'
import { PrinterIcon } from '@/components/icons'

export interface ScannedOrder {
  id: string
  code: string
  status: OrderStatus
  collection_usd: number
  delivery_fee_usd: number
  driver_pay_usd: number
  shop_balance_usd: number
  usd_to_lbp_rate: number
  recipient_name: string | null
  recipient_phone: string | null
  recipient_address: string | null
  notes?: string | null
  created_at: string
  shop: { id: string; name: string; phone?: string | null } | null
  driver: { id: string; name: string; phone?: string | null } | null
  area: { id: string; name: string } | null
}

interface Driver {
  id: string
  name: string
}

interface BarcodeScannerModalProps {
  isOpen: boolean
  onClose: () => void
  orders: ScannedOrder[]
  drivers: Driver[]
  workspaceId: string
  onOrderUpdated: (updated: ScannedOrder) => void
}

// Synthesize pleasant pos/neg beeps with Web Audio API (no external asset downloads required)
function playBeep(type: 'success' | 'error') {
  try {
    const AudioContext = window.AudioContext || (window as unknown as { webkitAudioContext: typeof window.AudioContext }).webkitAudioContext
    if (!AudioContext) return
    const ctx = new AudioContext()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()

    osc.connect(gain)
    gain.connect(ctx.destination)

    if (type === 'success') {
      osc.type = 'sine'
      osc.frequency.setValueAtTime(880, ctx.currentTime) // High A5
      gain.gain.setValueAtTime(0.15, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.14)
      osc.start(ctx.currentTime)
      osc.stop(ctx.currentTime + 0.15)
    } else {
      osc.type = 'sawtooth'
      osc.frequency.setValueAtTime(220, ctx.currentTime) // Low A3
      gain.gain.setValueAtTime(0.18, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.25)
      osc.start(ctx.currentTime)
      osc.stop(ctx.currentTime + 0.26)
    }
  } catch {
    // Ignore audio permission restrictions
  }
}

export function BarcodeScannerModal({
  isOpen,
  onClose,
  orders,
  drivers,
  workspaceId,
  onOrderUpdated,
}: BarcodeScannerModalProps) {
  const [scanInput, setScanInput] = useState('')
  const [matchedOrder, setMatchedOrder] = useState<ScannedOrder | null>(null)
  const [autoAction, setAutoAction] = useState<'none' | 'picked_up' | 'delivered' | 'assign_driver'>('none')
  const [statusMessage, setStatusMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [isUpdating, setIsUpdating] = useState(false)
  const [targetDriverId, setTargetDriverId] = useState('')
  const [soundEnabled, setSoundEnabled] = useState(true)

  // Camera video refs
  const [cameraActive, setCameraActive] = useState(false)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const scanInputRef = useRef<HTMLInputElement | null>(null)

  // Auto focus input on modal open
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        scanInputRef.current?.focus()
      }, 100)
    } else {
      stopCamera()
      setScanInput('')
      setMatchedOrder(null)
      setStatusMessage('')
      setErrorMessage('')
    }
  }, [isOpen])

  function stopCamera() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
      streamRef.current = null
    }
    setCameraActive(false)
  }

  async function startCamera() {
    try {
      setErrorMessage('')
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.play()
      }
      setCameraActive(true)

      // Start BarcodeDetector loop if supported by browser
      if ('BarcodeDetector' in window) {
        const barcodeDetector = new (window as any).BarcodeDetector({
          formats: ['code_128', 'qr_code', 'ean_13', 'upc_a'],
        })

        const interval = setInterval(async () => {
          if (!videoRef.current || !streamRef.current) {
            clearInterval(interval)
            return
          }
          try {
            const barcodes = await barcodeDetector.detect(videoRef.current)
            if (barcodes.length > 0) {
              const code = barcodes[0].rawValue
              if (code) {
                handleProcessScan(code)
                clearInterval(interval)
                stopCamera()
              }
            }
          } catch {
            // detection frame skip
          }
        }, 300)
      }
    } catch {
      setErrorMessage('Could not access camera. Please allow camera permissions or use laser / keyboard input.')
      stopCamera()
    }
  }

  // Process a scanned or typed code
  async function handleProcessScan(rawCode: string) {
    const trimmed = rawCode.trim().toUpperCase()
    if (!trimmed) return

    setErrorMessage('')
    setStatusMessage('')

    // Look for exact code or stripped code (in case scan contains full URL like .../track/CD-1234)
    let searchCode = trimmed
    if (searchCode.includes('/TRACK/')) {
      searchCode = searchCode.split('/TRACK/')[1]?.split('?')[0]?.trim() || trimmed
    } else if (searchCode.includes('/PRINT/ORDER/')) {
      searchCode = searchCode.split('/PRINT/ORDER/')[1]?.split('?')[0]?.trim() || trimmed
    }

    const found = orders.find(
      o => o.code.toUpperCase() === searchCode || o.id.toLowerCase() === searchCode.toLowerCase()
    )

    if (!found) {
      if (soundEnabled) playBeep('error')
      setErrorMessage(`No order found matching code "${searchCode}".`)
      setScanInput('')
      return
    }

    if (soundEnabled) playBeep('success')
    setMatchedOrder(found)
    setScanInput('')

    // Check if auto action is configured
    if (autoAction === 'assign_driver' && targetDriverId) {
      await executeStatusChange(found, 'assigned', targetDriverId)
    } else if (autoAction === 'picked_up' || autoAction === 'delivered') {
      await executeStatusChange(found, autoAction)
    } else {
      setStatusMessage(`Found order #${found.code}! Ready for check-in action.`)
    }
  }

  async function executeStatusChange(order: ScannedOrder, newStatus: OrderStatus, customDriverId?: string) {
    setIsUpdating(true)
    setErrorMessage('')
    try {
      const res = await fetch('/api/orders', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: order.id,
          workspaceId,
          status: newStatus,
          driverId: customDriverId !== undefined ? customDriverId : order.driver?.id,
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to update order')

      const updated = {
        ...order,
        status: newStatus,
        driver: customDriverId
          ? drivers.find(d => d.id === customDriverId) || order.driver
          : order.driver,
      }

      setMatchedOrder(updated)
      onOrderUpdated(updated)
      if (soundEnabled) playBeep('success')
      setStatusMessage(`Order #${order.code} updated to "${newStatus.replace('_', ' ')}"!`)
    } catch (err: unknown) {
      if (soundEnabled) playBeep('error')
      setErrorMessage(err instanceof Error ? err.message : 'Error updating order')
    } finally {
      setIsUpdating(false)
      scanInputRef.current?.focus()
    }
  }

  function handleFormSubmit(e: React.FormEvent) {
    e.preventDefault()
    handleProcessScan(scanInput)
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Warehouse Barcode & QR Scanner">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Scanner instructions & hardware laser wedge field */}
        <div
          style={{
            background: 'var(--bg)',
            border: '2px solid var(--brand)',
            borderRadius: 8,
            padding: '16px',
            textAlign: 'center',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--brand)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Barcode Scanner & Camera Ready
            </span>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <label style={{ fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'pointer', color: 'var(--muted)' }}>
                <input
                  type="checkbox"
                  checked={soundEnabled}
                  onChange={e => setSoundEnabled(e.target.checked)}
                />
                Audio Feedback
              </label>

              <button
                type="button"
                onClick={cameraActive ? stopCamera : startCamera}
                className="btn btn-secondary btn-sm"
                style={{ fontSize: 11, padding: '3px 8px' }}
              >
                {cameraActive ? 'Stop Camera' : 'Use Camera'}
              </button>
            </div>
          </div>

          {/* Camera Viewfinder */}
          {cameraActive && (
            <div style={{ position: 'relative', width: '100%', maxHeight: 220, overflow: 'hidden', borderRadius: 8, marginBottom: 12, background: '#000' }}>
              <video ref={videoRef} style={{ width: '100%', height: '100%', objectFit: 'cover' }} playsInline muted />
              <div
                style={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  width: '75%',
                  height: 90,
                  border: '2px dashed #22c55e',
                  borderRadius: 6,
                  pointerEvents: 'none',
                }}
              />
            </div>
          )}

          <form onSubmit={handleFormSubmit} style={{ display: 'flex', gap: 8 }}>
            <input
              ref={scanInputRef}
              type="text"
              value={scanInput}
              onChange={e => setScanInput(e.target.value)}
              placeholder="Scan barcode or enter code (e.g. CD-A1B2C3D4)..."
              style={{
                flex: 1,
                fontSize: 16,
                fontWeight: 700,
                padding: '10px 14px',
                borderRadius: 6,
                border: '1.5px solid var(--line)',
                fontFamily: 'monospace',
                background: 'var(--surface)',
              }}
              autoFocus
            />
            <button type="submit" className="btn btn-primary" style={{ minWidth: 100 }}>
              Scan / Find
            </button>
          </form>

          {/* Quick Auto-action selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, fontSize: 12 }}>
            <span style={{ color: 'var(--muted)', fontWeight: 600 }}>Auto-action on scan:</span>
            <select
              value={autoAction}
              onChange={e => setAutoAction(e.target.value as any)}
              style={{
                fontSize: 12,
                padding: '3px 8px',
                borderRadius: 4,
                border: '1px solid var(--line)',
                background: 'var(--surface)',
                fontWeight: 600,
              }}
            >
              <option value="none">Manual Action (Prompt below)</option>
              <option value="assign_driver">Auto-Assign to Courier (Connect Driver)</option>
              <option value="picked_up">Auto Check-In (Mark Picked Up)</option>
              <option value="delivered">Auto Mark Delivered</option>
            </select>

            {autoAction === 'assign_driver' && (
              <select
                value={targetDriverId}
                onChange={e => setTargetDriverId(e.target.value)}
                style={{
                  fontSize: 12,
                  padding: '3px 8px',
                  borderRadius: 4,
                  border: '1.5px solid var(--brand)',
                  background: 'var(--brand-light)',
                  fontWeight: 700,
                  color: 'var(--brand)',
                }}
              >
                <option value="">Select courier to auto-assign…</option>
                {drivers.map(d => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        {/* Status / Error Alerts */}
        {statusMessage && (
          <div style={{ background: '#ecfdf5', color: '#065f46', border: '1px solid #86efac', padding: '10px 14px', borderRadius: 6, fontSize: 12.5, fontWeight: 600 }}>
            {statusMessage}
          </div>
        )}
        {errorMessage && (
          <div style={{ background: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca', padding: '10px 14px', borderRadius: 6, fontSize: 12.5, fontWeight: 600 }}>
            {errorMessage}
          </div>
        )}

        {/* Scanned Order Details & Rapid Actions */}
        {matchedOrder ? (
          <div
            style={{
              background: 'var(--surface)',
              border: '1.5px solid var(--line)',
              borderRadius: 8,
              padding: '18px 20px',
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--line)', paddingBottom: 10 }}>
              <div>
                <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase' }}>
                  Waybill Package
                </span>
                <div style={{ fontSize: 20, fontWeight: 900, fontFamily: 'monospace', color: 'var(--brand)' }}>
                  #{matchedOrder.code}
                </div>
              </div>
              <span className={`badge badge-${matchedOrder.status}`} style={{ fontSize: 13, textTransform: 'capitalize' }}>
                {matchedOrder.status.replace('_', ' ')}
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, fontSize: 12.5 }}>
              <div>
                <span style={{ color: 'var(--muted)', display: 'block', fontSize: 11 }}>Merchant / Shop</span>
                <strong>{matchedOrder.shop?.name || '—'}</strong>
              </div>
              <div>
                <span style={{ color: 'var(--muted)', display: 'block', fontSize: 11 }}>Customer / Area</span>
                <strong>{matchedOrder.recipient_name || 'Customer'}</strong>
                {matchedOrder.area && <span style={{ color: 'var(--muted)', fontSize: 11 }}> ({matchedOrder.area.name})</span>}
              </div>
              <div>
                <span style={{ color: 'var(--muted)', display: 'block', fontSize: 11 }}>COD to Collect</span>
                <strong style={{ color: '#047857' }}>
                  {formatUSD(matchedOrder.collection_usd)}
                  <small style={{ fontWeight: 500, color: 'var(--muted)', marginLeft: 4 }}>
                    ({formatLBP(usdToLbp(matchedOrder.collection_usd, matchedOrder.usd_to_lbp_rate))})
                  </small>
                </strong>
              </div>
              <div>
                <span style={{ color: 'var(--muted)', display: 'block', fontSize: 11 }}>Assigned Courier</span>
                <strong>{matchedOrder.driver?.name || 'Unassigned'}</strong>
              </div>
            </div>

            {/* Quick Actions Grid */}
            <div style={{ borderTop: '1px solid var(--line)', paddingTop: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 8 }}>
                Quick Check-In Actions
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                <button
                  type="button"
                  disabled={isUpdating || matchedOrder.status === 'picked_up'}
                  onClick={() => executeStatusChange(matchedOrder, 'picked_up')}
                  className="btn btn-secondary"
                  style={{ fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 4 }}
                >
                  Mark Picked Up (Warehouse Check-In)
                </button>

                <button
                  type="button"
                  disabled={isUpdating || matchedOrder.status === 'delivered'}
                  onClick={() => executeStatusChange(matchedOrder, 'delivered')}
                  className="btn btn-primary"
                  style={{ fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 4 }}
                >
                  Mark Delivered
                </button>

                <button
                  type="button"
                  disabled={isUpdating || matchedOrder.status === 'returned'}
                  onClick={() => executeStatusChange(matchedOrder, 'returned')}
                  className="btn btn-ghost"
                  style={{ fontSize: 12, color: '#dc2626' }}
                >
                  Mark Returned
                </button>

                <Link
                  href={`/print/order/${matchedOrder.code}?print=true`}
                  target="_blank"
                  className="btn btn-secondary"
                  style={{ fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 6, textDecoration: 'none' }}
                >
                  <PrinterIcon size={13} />
                  <span>Print Waybill Slip</span>
                </Link>
              </div>

              {/* Assign / Re-assign Driver */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>Dispatch to Courier:</span>
                <select
                  value={targetDriverId}
                  onChange={e => setTargetDriverId(e.target.value)}
                  style={{ fontSize: 12, padding: '4px 8px', borderRadius: 4, border: '1px solid var(--line)', background: 'var(--surface)' }}
                >
                  <option value="">Select driver…</option>
                  {drivers.map(d => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={!targetDriverId || isUpdating}
                  onClick={() => executeStatusChange(matchedOrder, 'assigned', targetDriverId)}
                  className="btn btn-secondary btn-sm"
                  style={{ fontSize: 11 }}
                >
                  Assign Driver
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--muted)', fontSize: 13 }}>
            Point your laser barcode scanner at any package or type the tracking code above.
          </div>
        )}
      </div>
    </Modal>
  )
}
