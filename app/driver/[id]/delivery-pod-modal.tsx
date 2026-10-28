'use client'

import React, { useRef, useState, useEffect } from 'react'
import { formatUSD, formatLBP, usdToLbp } from '@/lib/utils'
import { CameraIcon, CheckIcon } from '@/components/icons'

interface DeliveryPodModalProps {
  order: {
    id: string
    code: string
    tracking_token?: string
    recipient_name: string | null
    recipient_address: string | null
    collection_usd: number
    usd_to_lbp_rate: number
  }
  rate: number
  onClose: () => void
  onConfirm: (data: {
    podSignature: string | null
    podPhoto: string | null
    podCollectedUsd: number | null
    podCollectedLbp: number | null
    notes?: string
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
    setSaving(true)

    try {
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
      })
      onClose()
    } catch (err) {
      console.error(err)
      alert(err instanceof Error ? err.message : 'Error confirming delivery')
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

          {/* Touch Signature Pad */}
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

          {/* Camera Photo Upload */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: '#e2e8f0', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <CameraIcon size={14} color="#38bdf8" />
              <span>Doorstep / Handover Photo (Optional)</span>
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
