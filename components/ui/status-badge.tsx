'use client'

import React from 'react'
import type { OrderStatusKey } from '@/lib/i18n/types'
import { useI18n } from '@/lib/i18n'

export interface StatusBadgeProps {
  status: OrderStatusKey | string
  size?: 'sm' | 'md' | 'lg'
  showDot?: boolean
  className?: string
  labelOverride?: string
}

const STATUS_I18N_MAP: Record<string, string> = {
  pending: 'statusPending',
  assigned: 'statusAssigned',
  picked_up: 'statusPickedUp',
  held: 'statusHeld',
  delivered: 'statusDelivered',
  failed: 'statusFailed',
  returned: 'statusReturned',
  cancelled: 'statusCancelled',
}

export function StatusBadge({
  status,
  size = 'md',
  showDot = true,
  className = '',
  labelOverride,
}: StatusBadgeProps) {
  const { t } = useI18n()
  const normalized = (status || 'pending').toLowerCase()
  const i18nKey = STATUS_I18N_MAP[normalized]
  const displayLabel = labelOverride || (i18nKey ? t(i18nKey) : status)

  return (
    <span
      className={`ui-status-badge ui-status-badge--${normalized} ${
        size !== 'md' ? `ui-status-badge--${size}` : ''
      } ${className}`}
      role="status"
    >
      {showDot && <span className="ui-status-badge__dot" aria-hidden="true" />}
      <span>{displayLabel}</span>
    </span>
  )
}
