'use client'

import React, { createContext, useContext, useState, useCallback, type ReactNode } from 'react'

export type ToastTone = 'success' | 'error' | 'info'

export interface ToastItem {
  id: string
  message: ReactNode
  tone: ToastTone
  durationMs?: number
}

interface ToastContextType {
  toast: (message: ReactNode, tone?: ToastTone, durationMs?: number) => void
  success: (message: ReactNode) => void
  error: (message: ReactNode) => void
  info: (message: ReactNode) => void
}

const ToastContext = createContext<ToastContextType>({
  toast: () => {},
  success: () => {},
  error: () => {},
  info: () => {},
})

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  const addToast = useCallback(
    (message: ReactNode, tone: ToastTone = 'info', durationMs: number = 3500) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
      setToasts(prev => [...prev, { id, message, tone, durationMs }])

      setTimeout(() => {
        removeToast(id)
      }, durationMs)
    },
    [removeToast],
  )

  const success = useCallback((msg: ReactNode) => addToast(msg, 'success'), [addToast])
  const error = useCallback((msg: ReactNode) => addToast(msg, 'error', 5000), [addToast])
  const info = useCallback((msg: ReactNode) => addToast(msg, 'info'), [addToast])

  return (
    <ToastContext.Provider value={{ toast: addToast, success, error, info }}>
      {children}
      {toasts.length > 0 && (
        <div
          style={{
            position: 'fixed',
            bottom: 24,
            insetInlineEnd: 24,
            zIndex: 9999,
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
            pointerEvents: 'none',
          }}
        >
          {toasts.map(t => (
            <div
              key={t.id}
              role="alert"
              style={{
                pointerEvents: 'auto',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '10px 16px',
                borderRadius: 'var(--ui-radius-sm)',
                boxShadow: 'var(--ui-shadow-lg)',
                fontSize: 13,
                fontWeight: 600,
                color: '#ffffff',
                background:
                  t.tone === 'success'
                    ? 'var(--ui-success)'
                    : t.tone === 'error'
                    ? 'var(--ui-danger)'
                    : 'var(--ui-info)',
                animation: 'uiToastPop 0.2s ease',
              }}
            >
              <span aria-hidden="true" style={{ fontSize: 16 }}>
                {t.tone === 'success' ? '✓' : t.tone === 'error' ? '⚠' : 'ℹ'}
              </span>
              <span>{t.message}</span>
              <button
                type="button"
                onClick={() => removeToast(t.id)}
                style={{
                  border: 'none',
                  background: 'none',
                  color: '#fff',
                  cursor: 'pointer',
                  opacity: 0.7,
                  marginInlineStart: 8,
                }}
                aria-label="Dismiss toast"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </ToastContext.Provider>
  )
}

export function useToast() {
  return useContext(ToastContext)
}
