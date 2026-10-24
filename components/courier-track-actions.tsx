'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { PackageIcon, CheckIcon, RefreshIcon, TruckIcon } from '@/components/icons'

interface Driver {
  id: string
  name: string
  phone?: string | null
}

interface CourierTrackActionsProps {
  orderId: string
  orderCode: string
  currentStatus: string
  currentDriverName?: string | null
  currentDriverId?: string | null
  drivers: Driver[]
}

export function CourierTrackActions({
  orderId,
  orderCode,
  currentStatus,
  currentDriverName,
  currentDriverId,
  drivers,
}: CourierTrackActionsProps) {
  const router = useRouter()
  const [selectedDriverId, setSelectedDriverId] = useState(currentDriverId || '')
  const [loading, setLoading] = useState(false)
  const [statusMsg, setStatusMsg] = useState('')
  const [errorMsg, setErrorMsg] = useState('')

  async function handleAction(actionStatus?: string, customDriverId?: string) {
    setLoading(true)
    setErrorMsg('')
    setStatusMsg('')

    try {
      const res = await fetch('/api/orders', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId,
          status: actionStatus || currentStatus,
          driverId: customDriverId !== undefined ? customDriverId : (selectedDriverId || null),
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Failed to update order')
      }

      setStatusMsg(`Order #${orderCode} updated successfully!`)
      router.refresh()
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Error updating order')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      style={{
        marginTop: 20,
        background: 'var(--surface)',
        border: '2px solid var(--brand)',
        borderRadius: 12,
        padding: '16px 20px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <TruckIcon size={16} color="var(--brand)" />
          <span style={{ fontSize: 12, fontWeight: 800, textTransform: 'uppercase', color: 'var(--brand)', letterSpacing: '0.5px' }}>
            Courier QR Dispatch & Check-In
          </span>
        </div>
        <span style={{ fontSize: 11, color: 'var(--muted)' }}>
          {currentDriverName ? `Assigned to: ${currentDriverName}` : 'Unassigned Courier'}
        </span>
      </div>

      {statusMsg && (
        <div style={{ background: '#ecfdf5', color: '#065f46', border: '1px solid #86efac', padding: '8px 12px', borderRadius: 6, fontSize: 12, marginBottom: 12 }}>
          ✓ {statusMsg}
        </div>
      )}
      {errorMsg && (
        <div style={{ background: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca', padding: '8px 12px', borderRadius: 6, fontSize: 12, marginBottom: 12 }}>
          {errorMsg}
        </div>
      )}

      {/* Driver Connection Select */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>
          Connect Courier:
        </span>
        <select
          value={selectedDriverId}
          onChange={e => setSelectedDriverId(e.target.value)}
          style={{
            fontSize: 12.5,
            padding: '6px 10px',
            borderRadius: 6,
            border: '1.5px solid var(--line)',
            background: 'var(--bg)',
            maxWidth: 220,
          }}
        >
          <option value="">Select courier…</option>
          {drivers.map(d => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>

        <button
          type="button"
          disabled={!selectedDriverId || loading || selectedDriverId === currentDriverId}
          onClick={() => handleAction('assigned', selectedDriverId)}
          className="btn btn-secondary btn-sm"
          style={{ fontSize: 12 }}
        >
          {loading ? 'Assigning…' : 'Link Courier'}
        </button>
      </div>

      {/* 1-Tap Courier Actions */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button
          type="button"
          disabled={loading || currentStatus === 'picked_up'}
          onClick={() => handleAction('picked_up')}
          className="btn btn-secondary btn-sm"
          style={{ fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }}
        >
          <PackageIcon size={13} />
          <span>Mark Picked Up from Shop</span>
        </button>

        <button
          type="button"
          disabled={loading || currentStatus === 'delivered'}
          onClick={() => handleAction('delivered')}
          className="btn btn-primary btn-sm"
          style={{ fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }}
        >
          <CheckIcon size={13} />
          <span>Mark Delivered (COD Collected)</span>
        </button>

        <button
          type="button"
          disabled={loading || currentStatus === 'returned'}
          onClick={() => handleAction('returned')}
          className="btn btn-ghost btn-sm"
          style={{ fontSize: 12, color: '#dc2626', display: 'inline-flex', alignItems: 'center', gap: 6 }}
        >
          <RefreshIcon size={13} />
          <span>Mark Returned</span>
        </button>
      </div>
    </div>
  )
}
