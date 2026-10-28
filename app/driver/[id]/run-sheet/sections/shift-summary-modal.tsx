'use client'

import { formatUSD, formatLBP, usdToLbp } from '@/lib/utils'
import { useRunSheet } from '../context'

export function ShiftSummaryModal() {
  const { driver, lang, orders, rate, setShowShiftSummaryModal, shiftQrDataUrl, showShiftSummaryModal, stats, t } = useRunSheet()
  return (
    <>
      {/* ─── SHIFT HANDOVER SUMMARY MODAL ─── */}
      {showShiftSummaryModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.82)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '16px',
          }}
          onClick={() => setShowShiftSummaryModal(false)}
        >
          <div
            style={{
              background: '#1e293b',
              border: '1.5px solid #059669',
              borderRadius: 16,
              padding: '20px',
              maxWidth: 420,
              width: '100%',
              color: '#f8fafc',
              maxHeight: '90vh',
              overflowY: 'auto',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 20 }}>📋</span>
                <h3 style={{ fontSize: 16, fontWeight: 800, margin: 0, color: '#6ee7b7' }}>
                  {t('shiftHandoverTitle')}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowShiftSummaryModal(false)}
                style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: 20, cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            <div style={{ background: '#0f172a', padding: '12px', borderRadius: 10, marginBottom: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#f8fafc' }}>{driver.name}</div>
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                {new Date().toLocaleDateString(lang === 'ar' ? 'ar-LB' : 'en-GB', {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })}
              </div>
            </div>

            {/* Metrics Breakdown */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
              <div style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 8, padding: '10px' }}>
                <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>{t('ordersCompletedToday')}</span>
                <div style={{ fontSize: 20, fontWeight: 800, color: '#f8fafc', marginTop: 2 }}>{stats.delivered}</div>
              </div>
              <div style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 8, padding: '10px' }}>
                <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>{t('earnedPay')}</span>
                <div style={{ fontSize: 20, fontWeight: 800, color: '#10b981', marginTop: 2 }}>
                  {formatUSD(orders.filter(o => o.status === 'delivered').reduce((s, o) => s + (Number(o.driver_pay_usd) || 0), 0))}
                </div>
              </div>
            </div>

            {/* Cash in Hand to Turn In */}
            <div
              style={{
                background: 'linear-gradient(135deg, rgba(6, 78, 59, 0.5) 0%, rgba(15, 23, 42, 0.8) 100%)',
                border: '1.5px solid #10b981',
                borderRadius: 10,
                padding: '12px 14px',
                marginBottom: 16,
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 700, color: '#6ee7b7', textTransform: 'uppercase' }}>
                {t('totalCodHeld')}
              </div>
              <div style={{ fontSize: 28, fontWeight: 900, color: '#10b981', marginTop: 2 }}>
                {formatUSD(stats.cashCollectedUsd)}
              </div>
              <div style={{ fontSize: 12, color: '#cbd5e1', marginTop: 2, fontWeight: 600 }}>
                ≈ {formatLBP(usdToLbp(stats.cashCollectedUsd, rate))}
              </div>
            </div>

            {/* Handover QR Code for Cashier Scan */}
            {shiftQrDataUrl && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 16 }}>
                <div style={{ background: '#ffffff', padding: 8, borderRadius: 10, display: 'inline-block' }}>
                  <img src={shiftQrDataUrl} alt="Shift Handover QR" style={{ width: 160, height: 160, display: 'block' }} />
                </div>
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 6, textAlign: 'center' }}>
                  {t('voucherScanHint')}
                </div>
              </div>
            )}

            <p style={{ fontSize: 11.5, color: '#94a3b8', marginBottom: 16, lineHeight: 1.45, textAlign: 'center' }}>
              {t('scanOrPresent')}
            </p>

            <button
              type="button"
              onClick={() => setShowShiftSummaryModal(false)}
              style={{
                width: '100%',
                background: '#059669',
                color: '#ffffff',
                border: 'none',
                padding: '12px',
                borderRadius: 8,
                fontWeight: 800,
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              {lang === 'ar' ? 'إغلاق' : 'Close Summary'}
            </button>
          </div>
        </div>
      )}
    </>
  )
}
