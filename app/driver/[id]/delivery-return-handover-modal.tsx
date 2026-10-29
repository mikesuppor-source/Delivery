'use client'

import React, { useRef, useState, useEffect } from 'react'
import type { DriverRunSheetOrder } from './run-sheet/shared'

interface DeliveryReturnHandoverModalProps {
  order: DriverRunSheetOrder
  onClose: () => void
  onSuccess: (orderId: string) => void
}

export function DeliveryReturnHandoverModal({
  order,
  onClose,
  onSuccess,
}: DeliveryReturnHandoverModalProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [hasSignature, setHasSignature] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    canvas.width = rect.width * dpr
    canvas.height = rect.height * dpr
    ctx.scale(dpr, dpr)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.lineWidth = 2.5
    ctx.strokeStyle = '#059669'
  }, [])

  function getCoords(e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()
    if ('touches' in e) {
      return {
        x: e.touches[0].clientX - rect.left,
        y: e.touches[0].clientY - rect.top,
      }
    }
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    }
  }

  function startDrawing(e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) {
    e.preventDefault()
    setIsDrawing(true)
    const { x, y } = getCoords(e)
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!ctx) return
    ctx.beginPath()
    ctx.moveTo(x, y)
  }

  function draw(e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) {
    if (!isDrawing) return
    e.preventDefault()
    const { x, y } = getCoords(e)
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!ctx) return
    ctx.lineTo(x, y)
    ctx.stroke()
    setHasSignature(true)
  }

  function stopDrawing() {
    setIsDrawing(false)
  }

  function clearCanvas() {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    setHasSignature(false)
  }

  async function handleSubmit() {
    if (!order.shop?.id) {
      setErrorMsg('Cannot handover: Order has no associated shop.')
      return
    }

    setSubmitting(true)
    setErrorMsg('')

    try {
      let signatureBase64: string | null = null
      if (canvasRef.current && hasSignature) {
        signatureBase64 = canvasRef.current.toDataURL('image/png')
      }

      const res = await fetch('/api/orders/returns-handover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shopId: order.shop.id,
          orderIds: [order.id],
          signature: signatureBase64,
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to complete return handover')

      onSuccess(order.id)
      onClose()
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Handover failed')
    } finally {
      setSubmitting(false)
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
        background: 'rgba(0, 0, 0, 0.75)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        style={{
          background: '#0f172a',
          color: '#f8fafc',
          border: '1px solid #334155',
          borderRadius: 14,
          maxWidth: 440,
          width: '100%',
          padding: 20,
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#10b981' }}>
              📦 Return Handover to Merchant
            </h3>
            <p style={{ margin: '2px 0 0', fontSize: 12, color: '#94a3b8' }}>
              Order #{order.code} · {order.shop?.name || 'Shop'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: '#94a3b8',
              fontSize: 20,
              cursor: 'pointer',
            }}
          >
            ✕
          </button>
        </div>

        {errorMsg && (
          <div
            style={{
              background: '#fee2e2',
              color: '#b91c1c',
              padding: '8px 12px',
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            {errorMsg}
          </div>
        )}

        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: '#cbd5e1' }}>
              ✍️ Shop Signature:
            </label>
            {hasSignature && (
              <button
                type="button"
                onClick={clearCanvas}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#f87171',
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: 'pointer',
                  textDecoration: 'underline',
                }}
              >
                Clear
              </button>
            )}
          </div>
          <div
            style={{
              border: '2px dashed #475569',
              borderRadius: 10,
              background: '#ffffff',
              touchAction: 'none',
              overflow: 'hidden',
            }}
          >
            <canvas
              ref={canvasRef}
              style={{ width: '100%', height: 150, display: 'block', cursor: 'crosshair' }}
              onMouseDown={startDrawing}
              onMouseMove={draw}
              onMouseUp={stopDrawing}
              onMouseLeave={stopDrawing}
              onTouchStart={startDrawing}
              onTouchMove={draw}
              onTouchEnd={stopDrawing}
            />
          </div>
          <p style={{ margin: '4px 0 0', fontSize: 11, color: '#94a3b8' }}>
            Merchant representative signs above to acknowledge receiving the returned package.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 6 }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: '#1e293b',
              border: '1px solid #475569',
              color: '#cbd5e1',
              padding: '8px 14px',
              borderRadius: 8,
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={handleSubmit}
            style={{
              background: '#059669',
              border: '1px solid #10b981',
              color: '#fff',
              padding: '8px 16px',
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 700,
              cursor: submitting ? 'wait' : 'pointer',
            }}
          >
            {submitting ? 'Saving…' : '✓ Confirm Handover'}
          </button>
        </div>
      </div>
    </div>
  )
}
