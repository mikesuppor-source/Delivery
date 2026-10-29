'use client'

import React, { type CSSProperties, type ReactNode } from 'react'

/** Shared look for the finance forms: matches the inputs on the warehouse screen. */
export const inputStyle: CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  borderRadius: 6,
  border: '1px solid var(--ui-border)',
  background: 'var(--ui-surface-2)',
  color: 'var(--ui-text)',
  fontSize: 13,
}

export function Field({ label, hint, children }: { label: ReactNode; hint?: ReactNode; children: ReactNode }) {
  return (
    <label style={{ display: 'block' }}>
      <span style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 6, color: 'var(--ui-text)' }}>{label}</span>
      {children}
      {hint && <span style={{ display: 'block', fontSize: 11, marginTop: 4, color: 'var(--ui-text-muted)' }}>{hint}</span>}
    </label>
  )
}

export function FormError({ message }: { message: string }) {
  if (!message) return null
  return (
    <div role="alert" style={{ fontSize: 12, color: 'var(--ui-danger)', background: 'var(--ui-danger-soft)', padding: '8px 12px', borderRadius: 6 }}>
      {message}
    </div>
  )
}
