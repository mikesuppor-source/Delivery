'use client'

import React, { useRef, useState, useEffect } from 'react'
import { formatUSD, formatLBP, usdToLbp } from '@/lib/utils'
import { CameraIcon, CheckIcon } from '@/components/icons'
import { QrCodeScanner } from '@/components/qr-code-scanner'

/** Where the courier is right now, for the delivery record. Null when the phone says no or takes too long. */
function currentPlace(): Promise<{ lat: number; lng: number } | null> {
  return new Promise(resolve => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return resolve(null)
    navigator.geolocation.getCurrentPosition(p => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }), () => resolve(null), { enableHighAccuracy: true, timeout: 6000, maximumAge: 60000 })
  })
}

const FALLBACK_REASONS: Array<[string, string]> = [['not_present', 'Customer is not there'], ['no_phone', 'Customer has no phone or data'], ['refused_code', 'Customer will not give the code'], ['other', 'Another reason']]

interface DeliveryPodModalProps {
  order: {
    id: string
    code: string
    tracking_token?: string
    recipient_name: string | null
    recipient_address: string | null
    collection_usd: number
    usd_to_lbp_rate: number
    /** The order has a customer delivery code the courier must collect. */
    code_required?: boolean
  }
  rate: number
  onClose: () => void
  onConfirm: (data: {
    podSignature: string | null
    podPhoto: string | null
    podCollectedUsd: number | null
    podCollectedLbp: number | null
    notes?: string
    deliveryCode?: string
    proofFallbackReason?: string
    deliveryLat?: number
    deliveryLng?: number
  }) => Promise<void>
}

export function DeliveryPodModal({
  order,
  rate,
  onClose,
  onConfirm,
}: DeliveryPodModalProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [hasSignature, setHasSignature] = useState(false)

  // Photo capture
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Payment breakdown in USD + LBP
  const orderRate = order.usd_to_lbp_rate || rate || 89500
  const totalUsd = Number(order.collection_usd || 0)
  const totalLbp = usdToLbp(totalUsd, orderRate)

  const [collectedUsd, setCollectedUsd] = useState<string>(totalUsd > 0 ? String(totalUsd) : '0')
  const [collectedLbp, setCollectedLbp] = useState<string>('0')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  // Customer delivery code
  const [deliveryCode, setDeliveryCode] = useState('')
  const [scanning, setScanning] = useState(false)
  const [fallbackOn, setFallbackOn] = useState(false)
  const [fallbackReason, setFallbackReason] = useState('not_present')
  const [formError, setFormError] = useState('')

  // Initialize canvas
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Set display resolution vs internal coordinate scaling
    const dpr = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    canvas.width = rect.width * dpr
    canvas.height = rect.height * dpr
    ctx.scale(dpr, dpr)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.lineWidth = 2.5
    ctx.strokeStyle = '#0284c7'
  }, [])

  // Drawing event handlers with touch support
  function getCoordinates(e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()

    if ('touches' in e) {
      const touch = e.touches[0]
      return {
        x: touch.clientX - rect.left,
        y: touch.clientY - rect.top,
      }
    } else {
      return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      }
    }
  }

  function startDrawing(e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) {
    e.preventDefault()
    setIsDrawing(true)
    const { x, y } = getCoordinates(e)
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!ctx) return
    ctx.beginPath()
    ctx.moveTo(x, y)
  }

  function draw(e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) {
    if (!isDrawing) return
    e.preventDefault()
    const { x, y } = getCoordinates(e)
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!ctx) return
    ctx.lineTo(x, y)
    ctx.stroke()
    setHasSignature(true)
  }

  function stopDrawing(e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) {
    e.preventDefault()
    setIsDrawing(false)
  }

  function handleClearSignature() {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    setHasSignature(false)
  }

  // Handle camera photo capture & compression
  function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = event => {
      const img = new Image()
      img.onload = () => {
        // Compress to max 800px dimension
        const maxDim = 800
        let { width, height } = img
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width)
            width = maxDim
          } else {
            width = Math.round((width * maxDim) / height)
            height = maxDim
          }
        }

        const compCanvas = document.createElement('canvas')
        compCanvas.width = width
        compCanvas.height = height
        const ctx = compCanvas.getContext('2d')
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height)
          const compressedDataUrl = compCanvas.toDataURL('image/jpeg', 0.72)
          setPhotoPreview(compressedDataUrl)
        }
      }
      img.src = event.target?.result as string
    }
    reader.readAsDataURL(file)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (order.code_required) {
      if (!fallbackOn && !/^\d{4}$/.test(deliveryCode.trim())) { setFormError('Ask the customer for their 4-digit delivery code, or choose "Customer cannot show the code".'); return }
      if (fallbackOn && !photoPreview) { setFormError('Take a photo of the parcel at the door first.'); return }
    }
    setFormError('')
    setSaving(true)

    try {
      const place = order.code_required ? await currentPlace() : null
      let signatureDataUrl: string | null = null
      if (hasSignature && canvasRef.current) {
        signatureDataUrl = canvasRef.current.toDataURL('image/png')
      }

      await onConfirm({
        podSignature: signatureDataUrl,
        podPhoto: photoPreview,
        podCollectedUsd: Number(collectedUsd) || 0,
        podCollectedLbp: Number(collectedLbp) || 0,
        notes: notes.trim() || undefined,
        ...(order.code_required ? { deliveryCode: deliveryCode.trim() || undefined, proofFallbackReason: fallbackOn ? fallbackReason : undefined, deliveryLat: place?.lat, deliveryLng: place?.lng } : {}),
      })
      onClose()
    } catch (err) {
      console.error(err)
      const message = err instanceof Error ? err.message : 'Error confirming delivery'
      if (order.code_required) setFormError(message)
      else alert(message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 1000,
        background: 'rgba(0, 0, 0, 0.85)',
        backdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        padding: 0,
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 580,
          background: '#0f172a',
          border: '1px solid #334155',
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          padding: '20px 20px 32px 20px',
          maxHeight: '92vh',
          overflowY: 'auto',
          boxShadow: '0 -10px 40px rgba(0,0,0,0.7)',
          color: '#f8fafc',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: '#38bdf8', fontFamily: 'monospace' }}>
                #{order.code}
              </span>
              <span style={{ fontSize: 11, background: '#064e3b', color: '#6ee7b7', padding: '1px 8px', borderRadius: 99, fontWeight: 700 }}>
                Proof of Delivery
              </span>
            </div>
            <h2 style={{ fontSize: 18, fontWeight: 800, margin: '4px 0 0', color: '#ffffff' }}>
              Confirm Delivery
            </h2>
            <p style={{ fontSize: 12, color: '#94a3b8', margin: '2px 0 0' }}>
              {order.recipient_name || 'Customer'}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            style={{
              background: '#1e293b',
              border: '1px solid #334155',
              color: '#94a3b8',
              width: 32,
              height: 32,
              borderRadius: '50%',
              fontSize: 16,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Total COD Amount Box */}
          <div
            style={{
              background: '#1e293b',
              border: '1.5px solid #059669',
              borderRadius: 12,
              padding: '12px 16px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#6ee7b7', textTransform: 'uppercase' }}>
                Total Cash to Collect
              </div>
              <div style={{ fontSize: 24, fontWeight: 900, color: '#10b981' }}>
                {formatUSD(totalUsd)}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 11, color: '#94a3b8' }}>
                Lebanese Rate @ {rate.toLocaleString()}
              </div>
              <div style={{ fontSize: 14, fontWeight: 800, color: '#cbd5e1' }}>
                {formatLBP(totalLbp)}
              </div>
            </div>
          </div>

          {/* Mixed Cash Split Inputs (USD / LBP) */}
          <div style={{ background: '#1e293b', borderRadius: 10, padding: 12, border: '1px solid #334155' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#f8fafc', marginBottom: 8 }}>
              Cash Received Breakdown (Mixed Currency)
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={{ fontSize: 11, color: '#94a3b8', display: 'block', marginBottom: 4 }}>
                  USD Collected ($)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={collectedUsd}
                  onChange={e => setCollectedUsd(e.target.value)}
                  style={{
                    width: '100%',
                    background: '#0f172a',
                    border: '1px solid #475569',
                    borderRadius: 6,
                    padding: '8px 10px',
                    color: '#ffffff',
                    fontSize: 14,
                    fontWeight: 700,
                  }}
                />
              </div>
              <div>
                <label style={{ fontSize: 11, color: '#94a3b8', display: 'block', marginBottom: 4 }}>
                  LBP Collected (L.L.)
                </label>
                <input
                  type="number"
                  step="50000"
                  value={collectedLbp}
                  onChange={e => setCollectedLbp(e.target.value)}
                  placeholder="0"
                  style={{
                    width: '100%',
                    background: '#0f172a',
                    border: '1px solid #475569',
                    borderRadius: 6,
                    padding: '8px 10px',
                    color: '#ffffff',
                    fontSize: 14,
                    fontWeight: 700,
                  }}
                />
              </div>
            </div>
          </div>

          {/* The customer's own proof: a code only they can see, typed or scanned from their phone */}
          {order.code_required && (
            <div data-testid="delivery-code-box" style={{ background: '#1e293b', border: '1.5px solid #38bdf8', borderRadius: 12, padding: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: '#e2e8f0', marginBottom: 4 }}>Customer delivery code</div>
              <p style={{ fontSize: 12, color: '#94a3b8', margin: '0 0 8px' }}>Ask the customer for the 4-digit code on their tracking link, or scan their QR.</p>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  aria-label="Customer delivery code"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={4}
                  placeholder="0000"
                  value={deliveryCode}
                  onChange={e => setDeliveryCode(e.target.value.replace(/\D/g, ''))}
                  style={{ flex: 1, background: '#0f172a', border: '1px solid #475569', borderRadius: 8, padding: '10px 12px', color: '#fff', fontSize: 22, fontWeight: 800, letterSpacing: 8, textAlign: 'center', fontFamily: 'monospace' }}
                />
                <button type="button" onClick={() => setScanning(s => !s)} style={{ background: '#0369a1', border: 'none', color: '#fff', borderRadius: 8, padding: '0 14px', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>Scan QR</button>
              </div>
              {scanning && (
                <QrCodeScanner
                  onClose={() => setScanning(false)}
                  onResult={text => {
                    // The QR says CEDAR-DC:<order code>:<code>; it must be for this order
                    const match = /^CEDAR-DC:([^:]+):(\d{4})$/.exec(text.trim())
                    if (!match || match[1].toUpperCase() !== order.code.toUpperCase()) { setFormError('That QR is for a different order.'); setScanning(false); return }
                    setDeliveryCode(match[2]); setFormError(''); setScanning(false)
                  }}
                />
              )}
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, fontSize: 12, color: '#e2e8f0' }}>
                <input type="checkbox" checked={fallbackOn} onChange={e => setFallbackOn(e.target.checked)} />
                <span>Customer cannot show the code</span>
              </label>
              {fallbackOn && (
                <div style={{ marginTop: 8 }}>
                  <select aria-label="Why the code is missing" value={fallbackReason} onChange={e => setFallbackReason(e.target.value)} style={{ width: '100%', background: '#0f172a', border: '1px solid #475569', borderRadius: 6, padding: '8px 10px', color: '#fff', fontSize: 13 }}>
                    {FALLBACK_REASONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                  <p style={{ fontSize: 11, color: '#fbbf24', margin: '6px 0 0' }}>A photo of the parcel at the door is required. The owner will review this delivery.</p>
                </div>
              )}
              {formError && <p role="alert" data-testid="proof-error" style={{ color: '#fca5a5', fontSize: 12, margin: '8px 0 0', fontWeight: 600 }}>{formError}</p>}
            </div>
          )}

          {/* Touch Signature Pad (orders without a customer code only: a signature on the courier's own phone proves little) */}
          {!order.code_required && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#e2e8f0', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>Customer Signature (Digital POD)</span>
              </label>
              {hasSignature && (
                <button
                  type="button"
                  onClick={handleClearSignature}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#f87171',
                    fontSize: 11,
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Clear ✕
                </button>
              )}
            </div>

            <div
              style={{
                background: '#020617',
                border: '1.5px dashed #475569',
                borderRadius: 10,
                position: 'relative',
                overflow: 'hidden',
                touchAction: 'none', // Prevents mobile touch gestures from scrolling the page
              }}
            >
              <canvas
                ref={canvasRef}
                style={{
                  width: '100%',
                  height: 120,
                  display: 'block',
                  cursor: 'crosshair',
                }}
                onMouseDown={startDrawing}
                onMouseMove={draw}
                onMouseUp={stopDrawing}
                onMouseLeave={stopDrawing}
                onTouchStart={startDrawing}
                onTouchMove={draw}
                onTouchEnd={stopDrawing}
              />
              {!hasSignature && (
                <div
                  style={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    pointerEvents: 'none',
                    color: '#475569',
                    fontSize: 12,
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  Sign with finger here
                </div>
              )}
            </div>
          </div>
          )}

          {/* Camera Photo Upload */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: '#e2e8f0', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <CameraIcon size={14} color="#38bdf8" />
              <span>Doorstep / Handover Photo ({order.code_required && fallbackOn ? 'Required' : 'Optional'})</span>
            </label>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handlePhotoUpload}
              style={{ display: 'none' }}
            />

            {photoPreview ? (
              <div style={{ position: 'relative', borderRadius: 8, overflow: 'hidden', border: '1px solid #334155' }}>
                <img
                  src={photoPreview}
                  alt="POD Snapshot"
                  style={{ width: '100%', height: 140, objectFit: 'cover', display: 'block' }}
                />
                <button
                  type="button"
                  onClick={() => setPhotoPreview(null)}
                  style={{
                    position: 'absolute',
                    top: 8,
                    right: 8,
                    background: 'rgba(0,0,0,0.7)',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '50%',
                    width: 28,
                    height: 28,
                    fontSize: 14,
                    cursor: 'pointer',
                  }}
                >
                  ✕
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                style={{
                  width: '100%',
                  background: '#1e293b',
                  border: '1.5px dashed #475569',
                  borderRadius: 8,
                  padding: '12px',
                  color: '#94a3b8',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                }}
              >
                <CameraIcon size={16} color="#94a3b8" />
                <span>Snap Parcel Photo with Camera</span>
              </button>
            )}
          </div>

          {/* Quick Notes */}
          <div>
            <label style={{ fontSize: 11, color: '#94a3b8', display: 'block', marginBottom: 4 }}>
              Delivery Note (Optional)
            </label>
            <input
              type="text"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="e.g. Handed to sister, received full cash"
              style={{
                width: '100%',
                background: '#0f172a',
                border: '1px solid #334155',
                borderRadius: 6,
                padding: '8px 10px',
                color: '#ffffff',
                fontSize: 12.5,
              }}
            />
          </div>

          {/* Submit Action */}
          <button
            type="submit"
            disabled={saving}
            style={{
              background: '#059669',
              color: '#ffffff',
              border: 'none',
              padding: '14px',
              borderRadius: 10,
              fontSize: 15,
              fontWeight: 800,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              boxShadow: '0 4px 14px rgba(5, 150, 105, 0.4)',
              marginTop: 4,
            }}
          >
            <CheckIcon size={18} color="#fff" />
            <span>{saving ? 'Recording POD & Finishing…' : 'Complete Delivery & Collect Cash'}</span>
          </button>
        </form>
      </div>
    </div>
  )
}
