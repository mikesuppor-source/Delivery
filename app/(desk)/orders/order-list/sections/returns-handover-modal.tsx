'use client'

import React, { useRef, useState, useEffect } from 'react'
import { formatUSD } from '@/lib/utils'
import { useOrderList } from '../context'

export function ReturnsHandoverModal() {
  const {
    isReturnsHandoverOpen,
    setIsReturnsHandoverOpen,
    orders,
    selectedOrderIds,
    setSelectedOrderIds,
    setOrders,
  } = useOrderList()

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [hasSignature, setHasSignature] = useState(false)
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  const returnedOrders = orders.filter(
    o => selectedOrderIds.includes(o.id) && o.status === 'returned' && !o.returns_handed_at
  )

  const distinctShops = Array.from(
    new Map(
      returnedOrders
        .filter(o => o.shop)
        .map(o => [o.shop!.id, o.shop!])
    ).values()
  )

  const [selectedShopId, setSelectedShopId] = useState<string>('')

  useEffect(() => {
    if (distinctShops.length > 0 && (!selectedShopId || !distinctShops.some(s => s.id === selectedShopId))) {
      setSelectedShopId(distinctShops[0].id)
    }
  }, [distinctShops, selectedShopId])

  // Canvas setup
  useEffect(() => {
    if (!isReturnsHandoverOpen) return
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
    ctx.strokeStyle = '#047857'
  }, [isReturnsHandoverOpen, selectedShopId])

  if (!isReturnsHandoverOpen) return null

  const targetOrders = returnedOrders.filter(o => o.shop?.id === selectedShopId)
  const currentShop = distinctShops.find(s => s.id === selectedShopId)

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

  async function handleConfirmHandover() {
    if (!selectedShopId || targetOrders.length === 0) return
    setLoading(true)
    setErrorMsg('')
    try {
      let signatureBase64: string | null = null
      if (canvasRef.current && hasSignature) {
        signatureBase64 = canvasRef.current.toDataURL('image/png')
      }

      const orderIds = targetOrders.map(o => o.id)
      const res = await fetch('/api/orders/returns-handover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shopId: selectedShopId,
          orderIds,
          signature: signatureBase64,
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to complete return handover')

      const handedAt = new Date().toISOString()
      setOrders(prev =>
        prev.map(o => (orderIds.includes(o.id) ? { ...o, returns_handed_at: handedAt } : o))
      )
      setSelectedOrderIds(prev => prev.filter(id => !orderIds.includes(id)))

      // If more shops remain, let the user continue; otherwise close
      const remainingShops = distinctShops.filter(s => s.id !== selectedShopId)
      if (remainingShops.length > 0) {
        setSelectedShopId(remainingShops[0].id)
        clearCanvas()
      } else {
        setIsReturnsHandoverOpen(false)
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Error completing handover')
    } finally {
      setLoading(false)
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
        background: 'rgba(0, 0, 0, 0.65)',
        zIndex: 60,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        style={{
          background: '#1e293b',
          color: '#f8fafc',
          borderRadius: 14,
          maxWidth: 520,
          width: '100%',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
          border: '1px solid #334155',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid #334155',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#10b981' }}>
              📦 Return-to-Shop Handover
            </h3>
            <p style={{ margin: '3px 0 0', fontSize: 12, color: '#94a3b8' }}>
              Collect shop signature & mark returned parcels delivered back to merchant
            </p>
          </div>
          <button
            type="button"
            onClick={() => setIsReturnsHandoverOpen(false)}
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

        {/* Content */}
        <div style={{ padding: 20, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
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

          {distinctShops.length > 1 && (
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#cbd5e1', marginBottom: 6 }}>
                Select Shop for Handover:
              </label>
              <select
                value={selectedShopId}
                onChange={e => {
                  setSelectedShopId(e.target.value)
                  clearCanvas()
                }}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: 8,
                  border: '1px solid #475569',
                  background: '#0f172a',
                  color: '#fff',
                  fontSize: 13,
                }}
              >
                {distinctShops.map(s => {
                  const count = returnedOrders.filter(o => o.shop?.id === s.id).length
                  return (
                    <option key={s.id} value={s.id}>
                      {s.name} ({count} returned parcels)
                    </option>
                  )
                })}
              </select>
            </div>
          )}

          {currentShop && (
            <div style={{ background: '#0f172a', padding: '12px 14px', borderRadius: 10, border: '1px solid #334155' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#38bdf8' }}>
                Merchant: {currentShop.name}
              </div>
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                {targetOrders.length} parcel(s) ready for handover
              </div>
              <div
                style={{
                  display: 'flex',
                  gap: 6,
                  flexWrap: 'wrap',
                  marginTop: 8,
                  maxHeight: 90,
                  overflowY: 'auto',
                }}
              >
                {targetOrders.map(o => (
                  <span
                    key={o.id}
                    style={{
                      background: '#1e293b',
                      border: '1px solid #475569',
                      padding: '2px 8px',
                      borderRadius: 6,
                      fontSize: 11,
                      fontFamily: 'monospace',
                      color: '#f8fafc',
                    }}
                  >
                    #{o.code} ({formatUSD(Number(o.collection_usd || 0))})
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Signature Canvas */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#cbd5e1' }}>
                ✍️ Shop Representative Signature:
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
                  Clear Signature
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
                style={{ width: '100%', height: 160, display: 'block', cursor: 'crosshair' }}
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
              Sign above with finger or mouse to confirm receipt of returned stock.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '12px 20px',
            borderTop: '1px solid #334155',
            background: '#0f172a',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 10,
          }}
        >
          <button
            type="button"
            onClick={() => setIsReturnsHandoverOpen(false)}
            className="btn btn-secondary btn-sm"
            style={{ fontSize: 12 }}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={loading || targetOrders.length === 0}
            onClick={handleConfirmHandover}
            className="btn btn-primary btn-sm"
            style={{
              fontSize: 12,
              background: '#059669',
              borderColor: '#10b981',
              color: '#fff',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            {loading ? 'Processing…' : `✓ Confirm Handover (${targetOrders.length} Parcels)`}
          </button>
        </div>
      </div>
    </div>
  )
}
