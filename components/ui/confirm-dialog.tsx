'use client'

import React, { useEffect, type ReactNode } from 'react'
import { useI18n } from '@/lib/i18n'

export interface ConfirmDialogProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void | Promise<void>
  title: ReactNode
  description?: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  tone?: 'danger' | 'primary'
  loading?: boolean
}

export function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel,
  cancelLabel,
  tone = 'danger',
  loading = false,
}: ConfirmDialogProps) {
  const { t } = useI18n()
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !loading) onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = ''
    }
  }, [isOpen, loading, onClose])

  if (!isOpen) return null

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.6)',
        backdropFilter: 'blur(2px)',
        zIndex: 200,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
      onClick={e => {
        if (e.target === e.currentTarget && !loading) onClose()
      }}
      role="alertdialog"
      aria-modal="true"
    >
      <div
        style={{
          width: '100%',
          maxWidth: 420,
          background: 'var(--ui-surface)',
          border: '1px solid var(--ui-border)',
          borderRadius: 'var(--ui-radius)',
          boxShadow: 'var(--ui-shadow-modal)',
          padding: 24,
        }}
      >
        <h3 style={{ fontSize: 17, fontWeight: 700, margin: '0 0 8px', color: 'var(--ui-text)' }}>
          {title}
        </h3>
        {description && (
          <p style={{ fontSize: 13, color: 'var(--ui-text-muted)', lineHeight: 1.5, margin: '0 0 20px' }}>
            {description}
          </p>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button
            type="button"
            className="ui-btn ui-btn--neutral"
            onClick={onClose}
            disabled={loading}
          >
            {cancelLabel ?? t('actionCancel')}
          </button>
          <button
            type="button"
            className={`ui-btn ui-btn--${tone}`}
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? t('Processing...') : confirmLabel ?? t('actionConfirm')}
          </button>
        </div>
      </div>
    </div>
  )
}
