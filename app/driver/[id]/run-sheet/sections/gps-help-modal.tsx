'use client'

import { useRunSheet } from '../context'

export function GpsHelpModal() {
  const { isInAppBrowser, requestGps, setShowCityPickerModal, setShowGpsHelpModal, showGpsHelpModal } = useRunSheet()
  return (
    <>
      {/* ─── PHONE GPS PERMISSION GUIDE MODAL ─── */}
      {showGpsHelpModal && (
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
          onClick={() => setShowGpsHelpModal(false)}
        >
          <div
            style={{
              background: '#1e293b',
              border: '1px solid #334155',
              borderRadius: 16,
              padding: '20px',
              maxWidth: 480,
              width: '100%',
              color: '#f8fafc',
              maxHeight: '90vh',
              overflowY: 'auto',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <h3 style={{ fontSize: 16, fontWeight: 800, margin: 0 }}>Phone GPS &amp; Permission Guide</h3>
              <button
                type="button"
                onClick={() => setShowGpsHelpModal(false)}
                style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: 20, cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            {isInAppBrowser && (
              <div style={{ background: 'rgba(245, 158, 11, 0.2)', border: '1px solid #f59e0b', borderRadius: 8, padding: '10px 12px', fontSize: 12, color: '#fef08a', marginBottom: 14 }}>
                <strong>⚠️ WhatsApp In-App Browser Warning:</strong> You are viewing inside WhatsApp. WhatsApp does NOT allow website GPS. Tap the 3 dots (⋮) in the corner and tap <u>Open in Safari</u> or <u>Open in Chrome</u>.
              </div>
            )}

            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#60a5fa', marginBottom: 6 }}>
                🍏 iPhone (iOS Safari)
              </div>
              <ol style={{ fontSize: 12, color: '#cbd5e1', paddingLeft: 18, margin: 0, lineHeight: 1.6 }}>
                <li>Open iPhone <strong>Settings</strong> $\rightarrow$ <strong>Privacy &amp; Security</strong> $\rightarrow$ <strong>Location Services</strong>.</li>
                <li>Ensure the top switch is turned <strong>ON</strong>.</li>
                <li>In that same list, tap <strong>Safari Websites</strong> $\rightarrow$ select <strong>&quot;While Using the App&quot;</strong> and turn <strong>&quot;Precise Location&quot; ON</strong>.</li>
                <li>Return to Safari, tap the <strong>aA</strong> icon in the address bar $\rightarrow$ <strong>Website Settings</strong> $\rightarrow$ set Location to <strong>Allow</strong>.</li>
              </ol>
            </div>

            <div style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#34d399', marginBottom: 6 }}>
                🤖 Android (Chrome)
              </div>
              <ol style={{ fontSize: 12, color: '#cbd5e1', paddingLeft: 18, margin: 0, lineHeight: 1.6 }}>
                <li>Swipe down the top notification shade on your phone and ensure <strong>Location / GPS</strong> is <strong>ON</strong>.</li>
                <li>In Chrome, tap the <strong>🔒 Lock icon</strong> in the address bar $\rightarrow$ <strong>Permissions</strong> $\rightarrow$ <strong>Location</strong> $\rightarrow$ set to <strong>Allow</strong>.</li>
                <li>If still blocked, open phone <strong>Settings</strong> $\rightarrow$ <strong>Apps</strong> $\rightarrow$ <strong>Chrome</strong> $\rightarrow$ <strong>Permissions</strong> $\rightarrow$ <strong>Location</strong> $\rightarrow$ select <strong>Allow only while using the app</strong>.</li>
              </ol>
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => {
                  setShowGpsHelpModal(false)
                  requestGps(false)
                }}
                style={{
                  flex: 1,
                  background: '#2563eb',
                  color: '#ffffff',
                  border: 'none',
                  padding: '10px',
                  borderRadius: 8,
                  fontWeight: 800,
                  fontSize: 12.5,
                  cursor: 'pointer',
                  minWidth: 120,
                }}
              >
                Retry GPS Now
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowGpsHelpModal(false)
                  setShowCityPickerModal(true)
                }}
                style={{
                  flex: 1,
                  background: '#059669',
                  color: '#ffffff',
                  border: 'none',
                  padding: '10px',
                  borderRadius: 8,
                  fontWeight: 800,
                  fontSize: 12.5,
                  cursor: 'pointer',
                  minWidth: 120,
                }}
              >
                📍 Pick City Instead
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
