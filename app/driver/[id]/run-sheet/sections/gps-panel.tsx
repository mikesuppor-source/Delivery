'use client'

import { NavigationIcon } from '@/components/icons'
import { Button, StatusPanel, type StatusTone } from '@/components/ui'
import { useRunSheet } from '../context'

/** Phone GPS state, nearest-first sorting, and fallbacks when location is unavailable. */
export function GpsPanel() {
  const { driverGps, gpsErrorText, gpsStatus, requestGps, setShowCityPickerModal, setShowGpsHelpModal, setSortByNearest, sortByNearest, t } = useRunSheet()
  const failed = gpsStatus === 'denied' || gpsStatus === 'unavailable' || gpsStatus === 'timeout'
  const tone: StatusTone = gpsStatus === 'active' ? 'ok' : gpsStatus === 'requesting' ? 'busy' : failed ? 'error' : 'idle'

  const message =
    gpsStatus === 'active' ? (
      <span style={{ color: '#34d399' }}>
        <strong>{driverGps?.label ? `Location: ${driverGps.label}` : 'Phone GPS Live'}</strong>{' '}
        {driverGps?.label ? '(Area)' : driverGps?.accuracy ? `(±${driverGps.accuracy}m)` : ''}
      </span>
    ) : gpsStatus === 'requesting' ? (
      <span style={{ color: '#38bdf8' }}>
        <strong>Acquiring phone GPS...</strong> (allow browser prompt)
      </span>
    ) : failed ? (
      <span style={{ color: '#f87171', fontWeight: 600 }}>
        {gpsStatus === 'denied' ? 'Location access denied in browser' : gpsStatus === 'unavailable' ? 'Phone GPS is OFF or signal lost' : 'GPS search timed out'}
      </span>
    ) : (
      <span style={{ color: '#cbd5e1' }}>Enable Phone GPS to track distance</span>
    )

  const actions =
    gpsStatus === 'active' ? (
      <>
        <Button variant="toggle" size="sm" aria-pressed={sortByNearest} onClick={() => setSortByNearest(prev => !prev)}>
          <NavigationIcon size={10} color={sortByNearest ? '#022c22' : '#94a3b8'} />
          <span>{sortByNearest ? t('nearestFirst') : t('sortNearest')}</span>
        </Button>
        <Button variant="neutral" size="sm" onClick={() => setShowCityPickerModal(true)} title="Change delivery area">
          {t('area')} ▾
        </Button>
      </>
    ) : gpsStatus === 'requesting' ? (
      <Button variant="primary" size="sm" disabled style={{ cursor: 'wait' }}>
        Locating...
      </Button>
    ) : (
      <>
        <Button variant="primary" size="sm" onClick={() => requestGps(false)}>
          {gpsStatus === 'prompt' ? t('enableGps') : 'Retry GPS'}
        </Button>
        {failed && (
          <>
            <Button variant="neutral" size="sm" onClick={() => requestGps(true)} title="Use Cell/WiFi network location">
              Network
            </Button>
            <Button variant="success" size="sm" onClick={() => setShowCityPickerModal(true)} title="Pick your city or area manually">
              📍 {t('setArea')}
            </Button>
          </>
        )}
      </>
    )

  return (
    <StatusPanel tone={tone} message={message} actions={actions}>
      {gpsErrorText && gpsStatus !== 'active' && (
        <div
          style={{
            background: 'rgba(15, 23, 42, 0.7)',
            border: '1px solid rgba(239, 68, 68, 0.35)',
            borderRadius: 8,
            padding: '8px 10px',
            fontSize: 11.5,
            lineHeight: 1.4,
            color: '#fca5a5',
          }}
        >
          <div style={{ marginBottom: 4, fontWeight: 700, color: '#f87171' }}>
            {gpsStatus === 'denied' ? 'How to allow browser location:' : 'GPS Connection Note:'}
          </div>
          <div>{gpsErrorText}</div>
          <div style={{ marginTop: 6, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <Button variant="link" onClick={() => setShowGpsHelpModal(true)}>
              Step-by-step phone settings guide ↗
            </Button>
            <Button variant="link" style={{ color: '#34d399' }} onClick={() => setShowCityPickerModal(true)}>
              Pick delivery city manually ↗
            </Button>
          </div>
        </div>
      )}
    </StatusPanel>
  )
}
