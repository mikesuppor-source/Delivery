'use client'

import { useRunSheet } from '../context'

export function InstallGuideModal() {
  const { isInAppBrowser, setShowIosInstallModal, showIosInstallModal } = useRunSheet()
  return (
    <>
      {/* ─── PWA INSTALL MODAL (iOS & Android Guide) ─── */}
      {showIosInstallModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.8)',
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '16px',
          }}
          onClick={() => setShowIosInstallModal(false)}
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
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <h3 style={{ fontSize: 16, fontWeight: 800, margin: 0 }}>Install Cedar on Your Phone</h3>
              <button
                type="button"
                onClick={() => setShowIosInstallModal(false)}
                style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: 20, cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            <p style={{ fontSize: 13, color: '#94a3b8', marginBottom: 16, lineHeight: 1.45 }}>
              Install Cedar Courier directly onto your phone&apos;s home screen to launch it anytime with 1-tap, just like a native app:
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, background: '#0f172a', padding: '10px 12px', borderRadius: 10 }}>
                <span style={{ width: 24, height: 24, borderRadius: '50%', background: '#2563eb', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, flexShrink: 0 }}>1</span>
                <div style={{ fontSize: 13, lineHeight: 1.4 }}>
                  <strong>In Safari (iPhone)</strong>, tap the <strong>Share</strong> button <span style={{ fontSize: 15 }}>⎋</span> (bottom bar). In Chrome (Android), tap the <strong>3 dots (⋮)</strong> menu.
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, background: '#0f172a', padding: '10px 12px', borderRadius: 10 }}>
                <span style={{ width: 24, height: 24, borderRadius: '50%', background: '#2563eb', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, flexShrink: 0 }}>2</span>
                <div style={{ fontSize: 13, lineHeight: 1.4 }}>
                  Scroll down the menu and tap <strong>Add to Home Screen</strong> <span style={{ fontSize: 15 }}>➕</span>.
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, background: '#0f172a', padding: '10px 12px', borderRadius: 10 }}>
                <span style={{ width: 24, height: 24, borderRadius: '50%', background: '#2563eb', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, flexShrink: 0 }}>3</span>
                <div style={{ fontSize: 13, lineHeight: 1.4 }}>
                  Tap <strong>Add</strong> in the top-right corner. The <strong>Cedar</strong> app icon will now appear on your home screen!
                </div>
              </div>
            </div>

            {isInAppBrowser && (
              <div style={{ background: 'rgba(245, 158, 11, 0.15)', border: '1px solid #f59e0b', borderRadius: 8, padding: '10px', fontSize: 12, color: '#fef08a', marginBottom: 16 }}>
                <strong>Note:</strong> You are currently viewing inside WhatsApp. Please tap the 3 dots in the corner and choose <u>Open in Safari</u> or <u>Open in Chrome</u> first.
              </div>
            )}

            <button
              type="button"
              onClick={() => setShowIosInstallModal(false)}
              style={{
                width: '100%',
                background: '#10b981',
                color: '#022c22',
                border: 'none',
                padding: '10px',
                borderRadius: 8,
                fontWeight: 800,
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              Got It
            </button>
          </div>
        </div>
      )}
    </>
  )
}
