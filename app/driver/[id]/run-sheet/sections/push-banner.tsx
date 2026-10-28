'use client'

import { Button, Notice } from '@/components/ui'
import { useRunSheet } from '../context'

/** Prominent prompt to turn on lock-screen alerts until the courier has done so. */
export function PushBanner() {
  const { handleInstallApp, handleSubscribePush, isStandaloneApp, pushLoading, pushSubscribed, t } = useRunSheet()
  if (pushSubscribed) return null

  return (
    <Notice
      tone="info"
      icon="🔔"
      title={t('pushBannerTitle')}
      actions={
        <>
          <Button variant="primary" onClick={handleSubscribePush} disabled={pushLoading}>
            {pushLoading ? '…' : t('pushBannerBtn')}
          </Button>
          {!isStandaloneApp && (
            <Button variant="subtle" onClick={handleInstallApp}>
              {t('installAppBtn')}
            </Button>
          )}
        </>
      }
    >
      {t('pushBannerDesc')}
    </Notice>
  )
}
