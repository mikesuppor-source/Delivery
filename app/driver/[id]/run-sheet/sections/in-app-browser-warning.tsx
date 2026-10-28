'use client'

import { Notice } from '@/components/ui'
import { useRunSheet } from '../context'

/** WhatsApp/Instagram in-app browsers block GPS and alerts, so ask the courier to open a real browser. */
export function InAppBrowserWarning() {
  const { isInAppBrowser, t } = useRunSheet()
  if (!isInAppBrowser) return null

  return (
    <Notice
      tone="warning"
      icon="⚠️"
      title={t('whatsappBrowserWarn')}
      actions={
        <div style={{ width: '100%', padding: '6px 10px', background: 'rgba(0,0,0,0.3)', borderRadius: 8, fontSize: 11.5, fontWeight: 700, color: '#fde68a' }}>
          👉 {t('whatsappBrowserAction')}
        </div>
      }
    >
      {t('whatsappBrowserDesc')}
    </Notice>
  )
}
