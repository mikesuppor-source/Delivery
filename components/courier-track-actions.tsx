'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { PackageIcon, CheckIcon, RefreshIcon, TruckIcon, MapPinIcon } from '@/components/icons'
import { GoogleMapsIcon } from '@/components/google-maps-icon'
import { WhatsAppIcon } from '@/components/whatsapp-icon'
import { getGoogleMapsDirectionsUrl, getWazeDirectionsUrl, parseLocation, formatDisplayAddress } from '@/lib/maps'

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
  recipientAddress?: string | null
  recipientPhone?: string | null
  recipientName?: string | null
  drivers: Driver[]
}

export function CourierTrackActions({
  orderId,
  orderCode,
  currentStatus,
  currentDriverName,
  currentDriverId,
  recipientAddress,
  recipientPhone,
  recipientName,
  drivers,
}: CourierTrackActionsProps) {
  const router = useRouter()
  const [selectedDriverId, setSelectedDriverId] = useState(currentDriverId || '')
  const [loading, setLoading] = useState(false)
  const [statusMsg, setStatusMsg] = useState('')
  const [errorMsg, setErrorMsg] = useState('')

  const parsedLoc = parseLocation(recipientAddress)

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

      {/* 1-Tap Courier Navigation to Customer Address */}
      {recipientAddress && (
        <div
          style={{
            background: 'var(--bg)',
            border: '1.5px solid var(--line)',
            borderRadius: 8,
            padding: '12px 14px',
            marginBottom: 14,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, flexWrap: 'wrap', gap: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <MapPinIcon size={14} color="var(--brand)" />
              <strong style={{ fontSize: 12, color: 'var(--text)' }}>
                Customer Location Pin & Directions
              </strong>
            </div>
            {parsedLoc.isCoords && (
              <span style={{ fontSize: 10.5, fontWeight: 700, color: '#059669', background: '#ecfdf5', padding: '2px 8px', borderRadius: 99, border: '1px solid #a7f3d0' }}>
                GPS: {parsedLoc.lat}, {parsedLoc.lng}
              </span>
            )}
          </div>

          <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 10, wordBreak: 'break-word' }}>
            {formatDisplayAddress(recipientAddress)}
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {/* 1-Tap Google Maps */}
            <a
              href={getGoogleMapsDirectionsUrl(recipientAddress)}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-secondary btn-sm"
              style={{
                fontSize: 12,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                fontWeight: 700,
                color: '#1d4ed8',
                background: '#eff6ff',
                borderColor: '#bfdbfe',
              }}
            >
              <GoogleMapsIcon size={13} />
              <span>Google Maps Navigation</span>
            </a>

            {/* 1-Tap Waze */}
            <a
              href={getWazeDirectionsUrl(recipientAddress)}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-secondary btn-sm"
              style={{
                fontSize: 12,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                fontWeight: 700,
                color: '#0369a1',
                background: '#f0f9ff',
                borderColor: '#bae6fd',
              }}
            >
              <span>Waze Navigation</span>
            </a>

            {/* WhatsApp Customer */}
            {recipientPhone && (
              <a
                href={`https://wa.me/${recipientPhone.replace(/\D/g, '')}?text=${encodeURIComponent(
                  `Hello ${recipientName || 'Customer'}, I am your Cedar courier with your delivery #${orderCode}. I am heading to your location.`
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-secondary btn-sm"
                style={{
                  fontSize: 12,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  color: '#047857',
                }}
              >
                <WhatsAppIcon size={13} color="#047857" />
                <span>WhatsApp Customer</span>
              </a>
            )}
          </div>
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
