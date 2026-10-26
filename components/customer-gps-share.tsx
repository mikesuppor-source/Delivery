'use client'

import React, { useState } from 'react'
import { MapPinIcon, CheckIcon } from '@/components/icons'
import { GoogleMapsIcon } from '@/components/google-maps-icon'

interface CustomerGpsShareProps {
  orderId: string
  orderCode: string
  trackingToken?: string
  currentAddress?: string | null
}

export function CustomerGpsShare({ orderId, orderCode, trackingToken, currentAddress }: CustomerGpsShareProps) {
  const [isLocating, setIsLocating] = useState(false)
  const [savedAddress, setSavedAddress] = useState<string | null>(null)
  const [extraNotes, setExtraNotes] = useState('')
  const [showNotesInput, setShowNotesInput] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const hasPinAlready = currentAddress && (currentAddress.includes('maps.google.com') || /(-?\d{1,2}\.\d{3,8})/.test(currentAddress))

  function handleShareLocation() {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by your mobile browser. Please send your pin via WhatsApp below.')
      return
    }

    setIsLocating(true)
    setError(null)

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const lat = pos.coords.latitude
          const lng = pos.coords.longitude

          const res = await fetch('/api/orders/location', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              token: trackingToken || orderCode,
              lat,
              lng,
              extraNotes: extraNotes.trim() || undefined,
            }),
          })

          const data = await res.json()
          if (!res.ok) throw new Error(data.error || 'Failed to update location')

          setSavedAddress(data.address || `GPS Coordinates: ${lat.toFixed(5)}, ${lng.toFixed(5)}`)
          setShowNotesInput(false)
        } catch (err: unknown) {
          setError(err instanceof Error ? err.message : 'Could not transmit location to dispatch.')
        } finally {
          setIsLocating(false)
        }
      },
      (geoErr) => {
        setIsLocating(false)
        setError(
          geoErr.message ||
            'Location permission denied. Please enable Location in your mobile browser settings or send your pin via WhatsApp.'
        )
      },
      {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 0,
      }
    )
  }

  return (
    <div
      style={{
        marginTop: 16,
        padding: '16px 20px',
        borderRadius: 12,
        background: savedAddress || hasPinAlready
          ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.08) 0%, rgba(5, 150, 105, 0.04) 100%)'
          : 'linear-gradient(135deg, rgba(37, 99, 235, 0.08) 0%, rgba(29, 78, 216, 0.03) 100%)',
        border: `1.5px solid ${savedAddress || hasPinAlready ? '#10b981' : '#3b82f6'}`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              background: savedAddress || hasPinAlready ? '#10b981' : '#2563eb',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            {savedAddress || hasPinAlready ? <CheckIcon size={18} color="#fff" /> : <MapPinIcon size={18} color="#fff" />}
          </div>

          <div>
            <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)' }}>
              {savedAddress || hasPinAlready ? 'Exact Building Pin Linked!' : 'Speed up your delivery with GPS Pin'}
            </div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
              {savedAddress || hasPinAlready
                ? 'Your exact building coordinates are active in the courier’s navigation.'
                : 'Share your device location so the courier arrives right at your doorstep without calling for directions.'}
            </div>
          </div>
        </div>

        {!(savedAddress || hasPinAlready) && (
          <button
            type="button"
            onClick={handleShareLocation}
            disabled={isLocating}
            style={{
              padding: '8px 16px',
              borderRadius: 8,
              background: '#2563eb',
              color: '#fff',
              border: 'none',
              fontWeight: 700,
              fontSize: 13,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              boxShadow: '0 2px 8px rgba(37, 99, 235, 0.25)',
            }}
          >
            <MapPinIcon size={14} color="#fff" />
            <span>{isLocating ? 'Acquiring GPS…' : 'Share My Live Pin'}</span>
          </button>
        )}
      </div>

      {/* Building Details Optional Box */}
      {!(savedAddress || hasPinAlready) && !showNotesInput && (
        <div style={{ marginTop: 10, textAlign: 'right' }}>
          <button
            type="button"
            onClick={() => setShowNotesInput(true)}
            style={{
              background: 'none',
              border: 'none',
              color: '#2563eb',
              fontSize: 11,
              fontWeight: 600,
              cursor: 'pointer',
              textDecoration: 'underline',
            }}
          >
            + Add floor, apartment, or landmark note
          </button>
        </div>
      )}

      {showNotesInput && !(savedAddress || hasPinAlready) && (
        <div style={{ marginTop: 12 }}>
          <input
            type="text"
            placeholder="e.g. 4th floor, apartment 12, facing the pharmacy"
            value={extraNotes}
            onChange={(e) => setExtraNotes(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 12px',
              borderRadius: 8,
              border: '1px solid var(--line)',
              background: 'var(--bg)',
              color: 'var(--text)',
              fontSize: 12,
            }}
          />
        </div>
      )}

      {/* Success State Details */}
      {(savedAddress || hasPinAlready) && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(16, 185, 129, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <span style={{ fontSize: 12, color: '#047857', fontWeight: 600 }}>
            ✓ Verified GPS Coordinates Active
          </span>

          <button
            type="button"
            onClick={handleShareLocation}
            disabled={isLocating}
            style={{
              background: 'none',
              border: 'none',
              color: '#047857',
              fontSize: 11,
              fontWeight: 700,
              textDecoration: 'underline',
              cursor: 'pointer',
            }}
          >
            {isLocating ? 'Re-acquiring…' : 'Update GPS pin'}
          </button>
        </div>
      )}

      {error && (
        <div style={{ marginTop: 10, fontSize: 12, color: '#dc2626', background: 'rgba(239, 68, 68, 0.1)', padding: '6px 12px', borderRadius: 6 }}>
          {error}
        </div>
      )}
    </div>
  )
}
