'use client'

import { TruckIcon } from '@/components/icons'
import { Button, Pill } from '@/components/ui'
import { useRunSheet } from '../context'

export function RunSheetHeader() {
  const { alertsEnabled, driver, handleEnableAlerts, handleSwitchCourier, lang, pushSubscribed, t, toggleLang, workspaceName } = useRunSheet()
  const alertsOn = pushSubscribed || alertsEnabled
  const today = new Date().toLocaleDateString(lang === 'ar' ? 'ar-LB' : 'en-GB', { weekday: 'short', month: 'short', day: 'numeric' })

  return (
    <header
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 50,
        background: 'rgba(15, 23, 42, 0.95)',
        backdropFilter: 'blur(12px)',
        borderBottom: '1px solid #1e293b',
        padding: '12px 16px',
      }}
    >
      <div style={{ maxWidth: 640, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
          <div
            style={{
              flexShrink: 0,
              width: 38,
              height: 38,
              borderRadius: 10,
              background: 'linear-gradient(135deg, #10b981 0%, #047857 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)',
            }}
          >
            <TruckIcon size={20} color="#ffffff" />
          </div>
          {/* On narrow phones long names shorten with "…" instead of wrapping under the buttons */}
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
              <span
                title={driver.name}
                style={{ fontSize: 15, fontWeight: 800, color: '#ffffff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
              >
                {driver.name}
              </span>
              <Pill tone="success" style={{ flexShrink: 0 }}>
                {t('courierActive')}
              </Pill>
            </div>
            <div style={{ fontSize: 11, color: '#94a3b8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {workspaceName} · {today}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <Button variant="info" size="sm" onClick={toggleLang} title="Switch Language / تغيير اللغة">
            {t('switchLang')}
          </Button>
          <Button
            variant={alertsOn ? 'on' : 'neutral'}
            size="sm"
            onClick={handleEnableAlerts}
            title={alertsOn ? 'Alert chime active (tap to test)' : 'Tap to enable loud alert sound & push notifications'}
          >
            {alertsOn ? '🔔' : '🔕'}
          </Button>
          <Button variant="neutral" size="sm" onClick={handleSwitchCourier} title="Switch courier profile or exit">
            {t('exit')}
          </Button>
        </div>
      </div>
    </header>
  )
}
