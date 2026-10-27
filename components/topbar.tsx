'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { formatLBP } from '@/lib/utils'

interface TopbarProps {
  usdToLbp: number
  workspaceId: string
  userRole?: string
}

const COMMON_RATES = [89500, 90000, 90500, 91000]

export function Topbar({ usdToLbp: initialRate, workspaceId, userRole }: TopbarProps) {
  const router = useRouter()
  const [currentRate, setCurrentRate] = useState<number>(initialRate)
  const [isOpen, setIsOpen] = useState(false)
  const [newRateInput, setNewRateInput] = useState<string>(String(initialRate))
  const [saving, setSaving] = useState(false)
  const [successNotice, setSuccessNotice] = useState(false)
  const [errorNotice, setErrorNotice] = useState<string | null>(null)
  const popoverRef = useRef<HTMLDivElement | null>(null)

  const canEdit = userRole === 'owner' || userRole === 'manager'

  // Sync prop changes
  useEffect(() => {
    setCurrentRate(initialRate)
    setNewRateInput(String(initialRate))
  }, [initialRate])

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setIsOpen(false)
        setErrorNotice(null)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen])

  const handleUpdateRate = async (rateToSet: number) => {
    if (!rateToSet || rateToSet <= 0 || isNaN(rateToSet)) {
      setErrorNotice('Please enter a valid positive exchange rate.')
      return
    }

    setSaving(true)
    setErrorNotice(null)
    try {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId,
          usdToLbp: rateToSet,
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Failed to update rate')
      }

      setCurrentRate(rateToSet)
      setNewRateInput(String(rateToSet))
      setSuccessNotice(true)
      setTimeout(() => setSuccessNotice(false), 2500)
      setIsOpen(false)
      router.refresh()
    } catch (err: unknown) {
      setErrorNotice(err instanceof Error ? err.message : 'Failed to update rate')
    } finally {
      setSaving(false)
    }
  }

  const today = new Date().toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Beirut',
  })

  return (
    <div className="topbar" style={{ position: 'relative' }}>
      <span suppressHydrationWarning style={{ marginRight: 'auto', fontSize: 12, color: 'var(--muted)' }}>
        {today.toUpperCase()}
      </span>

      {/* Rate Pill */}
      <div style={{ position: 'relative' }} ref={popoverRef}>
        <button
          type="button"
          onClick={() => {
            if (canEdit) {
              setIsOpen(prev => !prev)
              setErrorNotice(null)
              setNewRateInput(String(currentRate))
            }
          }}
          className="rate-pill"
          style={{
            cursor: canEdit ? 'pointer' : 'default',
            border: isOpen ? '1.5px solid var(--brand)' : '1.5px solid var(--line)',
            background: isOpen ? 'var(--surface)' : 'var(--bg)',
            transition: 'all 0.15s ease',
            outline: 'none',
          }}
          title={canEdit ? 'Click to change Lebanese market exchange rate' : undefined}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="12" y1="1" x2="12" y2="23" />
            <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
          </svg>
          <span>1 USD = {formatLBP(currentRate)}</span>
          {canEdit && (
            <span
              style={{
                marginLeft: 4,
                fontSize: 10,
                color: 'var(--brand)',
                fontWeight: 700,
                background: 'rgba(37, 99, 235, 0.1)',
                padding: '2px 5px',
                borderRadius: 4,
              }}
            >
              EDIT
            </span>
          )}
          {successNotice && (
            <span style={{ color: '#10b981', fontSize: 11, fontWeight: 700, marginLeft: 2 }}>✓</span>
          )}
        </button>

        {/* Dropdown / Popover for Quick Rate Switcher */}
        {isOpen && canEdit && (
          <div
            style={{
              position: 'absolute',
              top: 'calc(100% + 8px)',
              right: 0,
              width: 280,
              background: 'var(--surface)',
              border: '1.5px solid var(--line)',
              borderRadius: 'var(--radius)',
              boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.25), 0 8px 10px -6px rgba(0, 0, 0, 0.2)',
              padding: 16,
              zIndex: 100,
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text)' }}>
                Lebanese Market Rate
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--muted)',
                  cursor: 'pointer',
                  fontSize: 16,
                  padding: 0,
                  lineHeight: 1,
                }}
              >
                ✕
              </button>
            </div>

            <p style={{ margin: 0, fontSize: 11.5, color: 'var(--muted)', lineHeight: 1.4 }}>
              Updates the exchange rate used across all delivery fees, COD calculations, and driver run sheets.
            </p>

            {/* Quick Presets */}
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', marginBottom: 6 }}>
                COMMON PRESETS
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                {COMMON_RATES.map(rate => (
                  <button
                    key={rate}
                    type="button"
                    onClick={() => {
                      setNewRateInput(String(rate))
                      handleUpdateRate(rate)
                    }}
                    disabled={saving}
                    style={{
                      background: currentRate === rate ? 'var(--brand)' : 'var(--bg)',
                      color: currentRate === rate ? '#fff' : 'var(--text)',
                      border: '1px solid ' + (currentRate === rate ? 'var(--brand)' : 'var(--line)'),
                      borderRadius: 6,
                      padding: '6px 8px',
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: 'pointer',
                      textAlign: 'center',
                    }}
                  >
                    {rate.toLocaleString()} L.L.
                  </button>
                ))}
              </div>
            </div>

            {/* Custom Rate Input */}
            <div>
              <label
                htmlFor="custom-rate-input"
                style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--muted)', marginBottom: 4 }}
              >
                CUSTOM RATE (LBP PER 1 USD)
              </label>
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  id="custom-rate-input"
                  type="number"
                  step="500"
                  min="1000"
                  placeholder="e.g. 89500"
                  value={newRateInput}
                  onChange={e => setNewRateInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      handleUpdateRate(Number(newRateInput))
                    }
                  }}
                  style={{
                    flex: 1,
                    background: 'var(--bg)',
                    border: '1px solid var(--line)',
                    color: 'var(--text)',
                    borderRadius: 6,
                    padding: '8px 10px',
                    fontSize: 13,
                    fontWeight: 700,
                    outline: 'none',
                  }}
                />
                <button
                  type="button"
                  onClick={() => handleUpdateRate(Number(newRateInput))}
                  disabled={saving}
                  className="btn btn-primary btn-sm"
                  style={{ padding: '8px 12px', fontSize: 12, fontWeight: 700 }}
                >
                  {saving ? '…' : 'Save'}
                </button>
              </div>
            </div>

            {errorNotice && (
              <div style={{ fontSize: 11, color: '#ef4444', background: 'rgba(239, 68, 68, 0.1)', padding: '6px 8px', borderRadius: 4 }}>
                {errorNotice}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
