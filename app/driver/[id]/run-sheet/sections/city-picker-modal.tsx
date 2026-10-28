'use client'

import { LEBANON_QUICK_CITIES } from '../shared'
import { useRunSheet } from '../context'

export function CityPickerModal() {
  const { handleSelectManualCity, setShowCityPickerModal, showCityPickerModal } = useRunSheet()
  return (
    <>
      {/* ─── MANUAL CITY / AREA PICKER MODAL ─── */}
      {showCityPickerModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '16px',
          }}
          onClick={() => setShowCityPickerModal(false)}
        >
          <div
            style={{
              background: '#1e293b',
              border: '1px solid #334155',
              borderRadius: 16,
              padding: '20px',
              maxWidth: 440,
              width: '100%',
              color: '#f8fafc',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <h3 style={{ fontSize: 16, fontWeight: 800, margin: 0 }}>Select Delivery Area</h3>
              <button
                type="button"
                onClick={() => setShowCityPickerModal(false)}
                style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: 20, cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>
            <p style={{ fontSize: 12, color: '#94a3b8', marginBottom: 14 }}>
              Choose your current delivery area in Lebanon. Drop-off distances and &quot;Sort Nearest&quot; will immediately calculate from this location:
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
              {LEBANON_QUICK_CITIES.map(city => (
                <button
                  key={city.name}
                  type="button"
                  onClick={() => handleSelectManualCity(city)}
                  style={{
                    background: '#0f172a',
                    border: '1px solid #334155',
                    borderRadius: 8,
                    padding: '10px 12px',
                    color: '#f8fafc',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                    textAlign: 'left',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <span style={{ color: '#10b981' }}>📍</span>
                  <span>{city.name}</span>
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setShowCityPickerModal(false)}
              style={{
                width: '100%',
                background: '#334155',
                color: '#cbd5e1',
                border: 'none',
                padding: '8px',
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </>
  )
}
