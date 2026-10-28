'use client'

import { Button } from '@/components/ui'
import { useRunSheet } from '../context'

/** Sticky bar while offline, or while status changes are waiting to sync. */
export function OfflineBanner() {
  const { isOnline, isSyncing, offlineQueue, syncOfflineQueue, t } = useRunSheet()
  if (isOnline && offlineQueue.length === 0) return null

  return (
    <div
      role="status"
      style={{
        position: 'sticky',
        top: 63,
        zIndex: 49,
        background: !isOnline ? '#991b1b' : '#b45309',
        borderBottom: '1px solid ' + (!isOnline ? '#b91c1c' : '#d97706'),
        padding: '10px 16px',
        color: '#ffffff',
        fontSize: 12.5,
        fontWeight: 600,
        boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
      }}
    >
      <div style={{ maxWidth: 640, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <strong>{!isOnline ? t('offlineMode') : `${offlineQueue.length} ${t('pendingOffline')}`}</strong>
        {offlineQueue.length > 0 && (
          <Button variant={isOnline ? 'warning' : 'neutral'} size="sm" onClick={syncOfflineQueue} disabled={isSyncing || !isOnline}>
            {isSyncing ? t('syncing') : `${t('syncNow')} (${offlineQueue.length})`}
          </Button>
        )}
      </div>
    </div>
  )
}
