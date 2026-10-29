'use client'

import React, { useState } from 'react'
import { PhoneIcon, NavigationIcon } from '@/components/icons'
import { getGoogleMapsDirectionsUrl } from '@/lib/maps'
import { useRunSheet } from '../context'
import type { DriverPickup } from '../shared'

export function PickupsView() {
  const { pickups, loadingPickups, handleCollectPickup, fetchPickups } = useRunSheet()
  const [activePickup, setActivePickup] = useState<DriverPickup | null>(null)
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const activePickups = (pickups || []).filter(p => p.status !== 'cancelled')

  const handleCapturePhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      setPhotoDataUrl(reader.result as string)
    }
    reader.readAsDataURL(file)
  }

  const handleConfirmCollect = async () => {
    if (!activePickup) return
    setSubmitting(true)
    try {
      await handleCollectPickup(activePickup.id, photoDataUrl || undefined)
      setActivePickup(null)
      setPhotoDataUrl(null)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0, color: '#f8fafc' }}>
            Merchant Pickups
          </h2>
          <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
            Collect parcels from partner shops and deliver to hub or route
          </div>
        </div>
        <button
          type="button"
          onClick={() => fetchPickups()}
          className="btn btn-secondary"
          style={{ fontSize: 12, padding: '6px 12px' }}
        >
          ↻ Refresh
        </button>
      </div>

      {loadingPickups && activePickups.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 30, color: '#94a3b8', fontSize: 13 }}>
          Loading scheduled pickups…
        </div>
      ) : activePickups.length === 0 ? (
        <div
          style={{
            background: '#1e293b',
            border: '1px dashed #334155',
            borderRadius: 12,
            padding: '36px 20px',
            textAlign: 'center',
            color: '#94a3b8',
          }}
        >
          <div style={{ fontSize: 32, marginBottom: 8 }}>🏪</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#f8fafc' }}>
            No pickups scheduled
          </div>
          <p style={{ fontSize: 12, marginTop: 4, color: '#94a3b8' }}>
            When a merchant requests a parcel collection, it will appear here.
          </p>
        </div>
      ) : (
        activePickups.map(pickup => {
          const isCollected = pickup.status === 'collected'
          const shopPhone = pickup.shop?.phone?.replace(/\D/g, '')

          return (
            <div
              key={pickup.id}
              style={{
                background: isCollected ? 'rgba(5, 150, 105, 0.08)' : '#1e293b',
                border: '1px solid ' + (isCollected ? '#059669' : '#334155'),
                borderRadius: 12,
                padding: 16,
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 16, fontWeight: 800, color: '#f8fafc' }}>
                      {pickup.shop?.name || 'Partner Merchant'}
                    </span>
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        padding: '2px 8px',
                        borderRadius: 99,
                        background: isCollected ? '#065f46' : '#92400e',
                        color: isCollected ? '#a7f3d0' : '#fde68a',
                      }}
                    >
                      {isCollected ? 'Collected' : 'Pending Pickup'}
                    </span>
                  </div>

                  <div style={{ fontSize: 13, color: '#38bdf8', fontWeight: 700, marginTop: 4 }}>
                    📦 {pickup.parcel_count} parcel{pickup.parcel_count === 1 ? '' : 's'} ready
                  </div>

                  {pickup.shop?.address && (
                    <div style={{ fontSize: 12, color: '#cbd5e1', marginTop: 4 }}>
                      📍 {pickup.shop.address}
                    </div>
                  )}

                  {pickup.note && (
                    <div
                      style={{
                        fontSize: 12,
                        color: '#fbbf24',
                        background: 'rgba(245, 158, 11, 0.1)',
                        padding: '4px 8px',
                        borderRadius: 6,
                        marginTop: 6,
                      }}
                    >
                      Note: {pickup.note}
                    </div>
                  )}
                </div>

                {/* Direct Action Links */}
                <div style={{ display: 'flex', gap: 6 }}>
                  {shopPhone && (
                    <a
                      href={`tel:${shopPhone}`}
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 8,
                        background: '#047857',
                        color: '#fff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        textDecoration: 'none',
                      }}
                      title="Call merchant"
                    >
                      <PhoneIcon size={16} />
                    </a>
                  )}

                  {pickup.shop?.address && (
                    <a
                      href={getGoogleMapsDirectionsUrl(pickup.shop.address)}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 8,
                        background: '#2563eb',
                        color: '#fff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        textDecoration: 'none',
                      }}
                      title="Navigate to shop"
                    >
                      <NavigationIcon size={16} />
                    </a>
                  )}
                </div>
              </div>

              {!isCollected && (
                <button
                  type="button"
                  onClick={() => setActivePickup(pickup)}
                  style={{
                    background: 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)',
                    color: '#fff',
                    border: 'none',
                    padding: '10px 16px',
                    borderRadius: 8,
                    fontWeight: 700,
                    fontSize: 14,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                  }}
                >
                  <span>✓ Collect {pickup.parcel_count} Parcels</span>
                </button>
              )}
            </div>
          )
        })
      )}

      {/* Collect Modal */}
      {activePickup && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 1000,
            background: 'rgba(0, 0, 0, 0.85)',
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'center',
          }}
          onClick={() => setActivePickup(null)}
        >
          <div
            style={{
              width: '100%',
              maxWidth: 500,
              background: '#0f172a',
              borderTop: '1px solid #334155',
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              padding: 24,
              color: '#f8fafc',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>
                Confirm Collection
              </h3>
              <button
                type="button"
                onClick={() => setActivePickup(null)}
                style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: 18, cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            <div style={{ fontSize: 14, marginBottom: 16 }}>
              Collecting from <strong>{activePickup.shop?.name || 'Shop'}</strong>
            </div>

            <div style={{ background: '#1e293b', borderRadius: 8, padding: 14, marginBottom: 16 }}>
              <div style={{ fontSize: 13, color: '#94a3b8' }}>Parcels to Collect:</div>
              <div style={{ fontSize: 24, fontWeight: 900, color: '#22c55e' }}>
                {activePickup.parcel_count} parcels
              </div>
            </div>

            {/* Optional proof photo */}
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#94a3b8', marginBottom: 6 }}>
                Proof Photo (Optional)
              </label>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleCapturePhoto}
                style={{ width: '100%', fontSize: 13 }}
              />
              {photoDataUrl && (
                <div style={{ marginTop: 8, fontSize: 12, color: '#22c55e' }}>
                  ✓ Photo attached ({Math.round(photoDataUrl.length / 1024)} KB)
                </div>
              )}
            </div>

            <button
              type="button"
              disabled={submitting}
              onClick={handleConfirmCollect}
              style={{
                width: '100%',
                background: '#16a34a',
                color: '#fff',
                border: 'none',
                padding: '12px 18px',
                borderRadius: 8,
                fontSize: 15,
                fontWeight: 800,
                cursor: 'pointer',
              }}
            >
              {submitting ? 'Confirming…' : 'Confirm Collection'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
