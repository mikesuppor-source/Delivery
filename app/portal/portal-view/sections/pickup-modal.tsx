'use client'

import React from 'react'
import { usePortal } from '../context'
import { formatDate } from '@/lib/utils'

export function PickupModal() {
  const {
    isPickupModalOpen,
    setIsPickupModalOpen,
    pickupCount,
    setPickupCount,
    pickupNote,
    setPickupNote,
    handleRequestPickup,
    isSubmittingPickup,
    pickupSuccess,
    pickupError,
    recentPickups,
  } = usePortal()

  if (!isPickupModalOpen) return null

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 1000,
        background: 'rgba(0, 0, 0, 0.7)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
      onClick={() => setIsPickupModalOpen(false)}
    >
      <div
        style={{
          background: 'var(--surface)',
          border: '1.5px solid var(--line)',
          borderRadius: 16,
          width: '100%',
          maxWidth: 540,
          maxHeight: '90vh',
          overflowY: 'auto',
          boxShadow: 'var(--shadow)',
          color: 'var(--ink)',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div
          style={{
            padding: '20px 24px',
            borderBottom: '1px solid var(--line)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--brand)', textTransform: 'uppercase' }}>
              Dispatch Collection
            </span>
            <h2 style={{ fontSize: 18, fontWeight: 800, margin: '2px 0 0' }}>
              Request Courier Pickup
            </h2>
          </div>
          <button
            type="button"
            onClick={() => setIsPickupModalOpen(false)}
            style={{
              background: 'none',
              border: 'none',
              fontSize: 18,
              cursor: 'pointer',
              color: 'var(--muted)',
            }}
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleRequestPickup} style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 18 }}>
          {pickupSuccess && (
            <div
              style={{
                padding: '12px 14px',
                background: 'rgba(5, 150, 105, 0.1)',
                border: '1px solid #059669',
                borderRadius: 8,
                color: '#059669',
                fontSize: 13,
                fontWeight: 700,
              }}
            >
              ✓ {pickupSuccess}
            </div>
          )}

          {pickupError && (
            <div
              style={{
                padding: '12px 14px',
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid #ef4444',
                borderRadius: 8,
                color: '#ef4444',
                fontSize: 13,
                fontWeight: 700,
              }}
            >
              {pickupError}
            </div>
          )}

          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
              How many parcels are ready for collection?
            </label>
            <input
              type="number"
              min={1}
              max={500}
              required
              value={pickupCount}
              onChange={e => setPickupCount(Math.max(1, parseInt(e.target.value) || 1))}
              style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: 8,
                border: '1px solid var(--line)',
                background: 'var(--bg)',
                color: 'var(--ink)',
                fontSize: 16,
                fontWeight: 700,
              }}
            />
            <small style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginTop: 4 }}>
              Enter the approximate or exact quantity of boxes / packages ready at your shop.
            </small>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
              Pickup Notes (Optional)
            </label>
            <textarea
              rows={2}
              placeholder="e.g. Ring the warehouse bell at back entrance or ask for Ahmad"
              value={pickupNote}
              onChange={e => setPickupNote(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: 8,
                border: '1px solid var(--line)',
                background: 'var(--bg)',
                color: 'var(--ink)',
                fontSize: 13,
              }}
            />
          </div>

          <button
            type="submit"
            disabled={isSubmittingPickup}
            className="btn btn-primary"
            style={{ padding: '12px', fontWeight: 800, fontSize: 14 }}
          >
            {isSubmittingPickup ? 'Submitting Request…' : `Request Pickup (${pickupCount} Parcels)`}
          </button>
        </form>

        {/* Recent Pickup History */}
        {recentPickups.length > 0 && (
          <div style={{ padding: '0 24px 24px', borderTop: '1px solid var(--line)' }}>
            <h4 style={{ fontSize: 13, fontWeight: 700, color: 'var(--muted)', margin: '16px 0 10px' }}>
              RECENT PICKUP REQUESTS
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {recentPickups.slice(0, 5).map(p => (
                <div
                  key={p.id}
                  style={{
                    padding: '10px 12px',
                    background: 'var(--bg)',
                    borderRadius: 8,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    fontSize: 12,
                  }}
                >
                  <div>
                    <span style={{ fontWeight: 700 }}>{p.parcel_count} parcels</span>
                    <span style={{ color: 'var(--muted)', marginLeft: 8 }}>
                      {formatDate(p.requested_at)}
                    </span>
                    {p.driver?.name && (
                      <span style={{ color: 'var(--brand)', marginLeft: 8 }}>
                        Courier: {p.driver.name}
                      </span>
                    )}
                  </div>
                  <span
                    style={{
                      fontWeight: 700,
                      padding: '2px 8px',
                      borderRadius: 99,
                      fontSize: 11,
                      background:
                        p.status === 'collected'
                          ? 'rgba(5, 150, 105, 0.15)'
                          : p.status === 'assigned'
                          ? 'rgba(37, 99, 235, 0.15)'
                          : 'rgba(217, 119, 6, 0.15)',
                      color:
                        p.status === 'collected'
                          ? '#059669'
                          : p.status === 'assigned'
                          ? '#2563eb'
                          : '#d97706',
                    }}
                  >
                    {p.status.toUpperCase()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
