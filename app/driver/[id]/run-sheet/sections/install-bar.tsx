'use client'

import { Button, Panel, Pill } from '@/components/ui'
import { useRunSheet } from '../context'

/** Install-as-app and push-alert controls. */
export function InstallBar() {
  const { handleInstallApp, handleSubscribePush, handleTestPush, isStandaloneApp, pushLoading, pushSubscribed, t } = useRunSheet()

  return (
    <Panel style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
        <div
          aria-hidden="true"
          style={{
            width: 34,
            height: 34,
            borderRadius: 8,
            background: '#10b981',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 16,
            fontWeight: 900,
            flexShrink: 0,
          }}
        >
          C
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#f8fafc' }}>
            {isStandaloneApp ? t('cedarCourierApp') : t('installAsApp')}
          </div>
          <div style={{ fontSize: 11, color: '#94a3b8' }}>{isStandaloneApp ? t('appModeFullscreen') : t('appModeDesc')}</div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
        {!isStandaloneApp && (
          <Button variant="primary" size="sm" onClick={handleInstallApp}>
            {t('installAppBtn')}
          </Button>
        )}
        {pushSubscribed ? (
          <>
            <Pill tone="success-soft">{t('alertsReady')}</Pill>
            <Button variant="neutral" size="sm" onClick={handleTestPush} disabled={pushLoading} title="Test lock-screen notification">
              {pushLoading ? '…' : t('testPush')}
            </Button>
          </>
        ) : (
          <Button variant="success" size="sm" onClick={handleSubscribePush} disabled={pushLoading}>
            {pushLoading ? '…' : t('enableAlerts')}
          </Button>
        )}
      </div>
    </Panel>
  )
}
