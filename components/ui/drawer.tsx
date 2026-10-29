'use client'

import React, { useEffect, type ReactNode } from 'react'
import { useI18n } from '@/lib/i18n'

export interface DrawerProps {
  isOpen: boolean
  onClose: () => void
  title?: ReactNode
  children: ReactNode
  footer?: ReactNode
  width?: string | number
}

export function Drawer({
  isOpen,
  onClose,
  title,
  children,
  footer,
  width = 460,
}: DrawerProps) {
  const { t } = useI18n()
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = ''
    }
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div
      className="ui-drawer-backdrop"
      onClick={e => {
        if (e.target === e.currentTarget) onClose()
      }}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="ui-drawer-panel"
        style={{ maxWidth: typeof width === 'number' ? `${width}px` : width }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 20px',
            borderBottom: '1px solid var(--ui-border)',
          }}
        >
          {title && <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>{title}</h2>}
          <button
            type="button"
            className="ui-btn ui-btn--subtle ui-btn--sm"
            onClick={onClose}
            aria-label={t('Close drawer')}
            style={{ marginInlineStart: 'auto' }}
          >
            ✕
          </button>
        </div>

        <div style={{ padding: 20, flex: 1, overflowY: 'auto' }}>{children}</div>

        {footer && (
          <div
            style={{
              padding: '16px 20px',
              borderTop: '1px solid var(--ui-border)',
              background: 'var(--ui-surface-2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: 10,
            }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}
