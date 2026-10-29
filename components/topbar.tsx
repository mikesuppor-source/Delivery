'use client'

import React, { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { formatLBP } from '@/lib/utils'
import { useI18n } from '@/lib/i18n'
import { useTheme } from '@/lib/theme'
import { GlobalSearchModal } from './global-search-modal'

interface TopbarProps {
  usdToLbp: number
  workspaceId: string
  userRole?: string
}

const COMMON_RATES = [89500, 90000, 90500, 91000]

export function Topbar({ usdToLbp: initialRate, workspaceId, userRole }: TopbarProps) {
  const router = useRouter()
  const { locale, toggleLocale, t } = useI18n()
  const { resolvedTheme, toggleTheme } = useTheme()

  const [currentRate, setCurrentRate] = useState<number>(initialRate)
  const [isOpen, setIsOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [newRateInput, setNewRateInput] = useState<string>(String(initialRate))
  const [saving, setSaving] = useState(false)
  const [successNotice, setSuccessNotice] = useState(false)
  const [errorNotice, setErrorNotice] = useState<string | null>(null)
  const popoverRef = useRef<HTMLDivElement | null>(null)

  const canEdit = userRole === 'owner' || userRole === 'manager'

  // Global keyboard shortcut '/' or 'Cmd+K' / 'Ctrl+K' to open search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement
      const isInput =
        activeEl instanceof HTMLInputElement ||
        activeEl instanceof HTMLTextAreaElement ||
        activeEl?.getAttribute('contenteditable') === 'true'

      if ((e.key === '/' && !isInput) || ((e.metaKey || e.ctrlKey) && e.key === 'k')) {
        e.preventDefault()
        setSearchOpen(true)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // Sync prop changes
  useEffect(() => {
    setCurrentRate(initialRate)
    setNewRateInput(String(initialRate))
  }, [initialRate])

  // Close rate popover on outside click
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

  return (
    <>
      <header
        className="topbar"
        style={{
          height: 'var(--ui-topbar-h)',
          background: 'var(--ui-surface)',
          borderBottom: '1px solid var(--ui-border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          padding: '0 24px',
          position: 'sticky',
          top: 0,
          zIndex: 40,
        }}
      >
        {/* Global Search Bar (Trigger) */}
        <div style={{ flex: '1 1 320px', maxWidth: 440 }}>
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '7px 12px',
              borderRadius: 'var(--ui-radius-sm)',
              border: '1px solid var(--ui-border)',
              background: 'var(--ui-surface-2)',
              color: 'var(--ui-text-muted)',
              fontSize: 13,
              cursor: 'pointer',
              transition: 'border-color 0.15s ease',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 14 }}>🔍</span>
              <span>{t('searchPlaceholderGlobal')}</span>
            </div>
            <kbd
              style={{
                fontSize: 11,
                padding: '2px 5px',
                borderRadius: 4,
                border: '1px solid var(--ui-border)',
                background: 'var(--ui-surface)',
                color: 'var(--ui-text-muted)',
              }}
            >
              /
            </kbd>
          </button>
        </div>

        {/* Right side controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* New Order Quick Action Button */}
          <Link
            href="/orders/new"
            className="ui-btn ui-btn--primary ui-btn--sm"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 700 }}
          >
            <span style={{ fontSize: 14 }}>＋</span>
            <span>{t('actionNewOrder')}</span>
          </Link>

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
                border: isOpen ? '1.5px solid var(--ui-primary)' : '1px solid var(--ui-border)',
                background: isOpen ? 'var(--ui-surface)' : 'var(--ui-surface-2)',
                color: 'var(--ui-text)',
                transition: 'all 0.15s ease',
                outline: 'none',
                padding: '4px 10px',
                borderRadius: 9999,
                fontSize: 12,
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
              title={canEdit ? 'Click to change Lebanese market exchange rate' : undefined}
            >
              <span style={{ color: 'var(--ui-primary)' }}>$</span>
              <span>1 USD = {formatLBP(currentRate)}</span>
              {canEdit && (
                <span
                  style={{
                    fontSize: 9.5,
                    color: 'var(--ui-primary)',
                    fontWeight: 800,
                    background: 'var(--ui-primary-soft)',
                    padding: '2px 4px',
                    borderRadius: 3,
                  }}
                >
                  EDIT
                </span>
              )}
              {successNotice && (
                <span style={{ color: 'var(--ui-success)', fontSize: 11, fontWeight: 700 }}>✓</span>
              )}
            </button>

            {/* Dropdown / Popover for Quick Rate Switcher */}
            {isOpen && canEdit && (
              <div
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 8px)',
                  insetInlineEnd: 0,
                  width: 290,
                  background: 'var(--ui-surface)',
                  border: '1.5px solid var(--ui-border)',
                  borderRadius: 'var(--ui-radius)',
                  boxShadow: 'var(--ui-shadow-modal)',
                  padding: 16,
                  zIndex: 100,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--ui-text)' }}>
                    Lebanese Market Rate
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsOpen(false)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--ui-text-muted)',
                      cursor: 'pointer',
                      fontSize: 16,
                      padding: 0,
                      lineHeight: 1,
                    }}
                  >
                    ✕
                  </button>
                </div>

                <p style={{ margin: 0, fontSize: 11.5, color: 'var(--ui-text-muted)', lineHeight: 1.4 }}>
                  Updates the exchange rate used across all delivery fees, COD calculations, and driver run sheets.
                </p>

                {/* Quick Presets */}
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ui-text-muted)', marginBottom: 6 }}>
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
                          background: currentRate === rate ? 'var(--ui-primary)' : 'var(--ui-surface-2)',
                          color: currentRate === rate ? '#fff' : 'var(--ui-text)',
                          border: '1px solid ' + (currentRate === rate ? 'var(--ui-primary)' : 'var(--ui-border)'),
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
                    style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--ui-text-muted)', marginBottom: 4 }}
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
                        background: 'var(--ui-surface-2)',
                        border: '1px solid var(--ui-border)',
                        color: 'var(--ui-text)',
                        borderRadius: 6,
                        padding: '6px 10px',
                        fontSize: 13,
                        fontWeight: 700,
                        outline: 'none',
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => handleUpdateRate(Number(newRateInput))}
                      disabled={saving}
                      className="ui-btn ui-btn--primary ui-btn--sm"
                    >
                      {saving ? '…' : 'Save'}
                    </button>
                  </div>
                </div>

                {errorNotice && (
                  <div style={{ fontSize: 11, color: 'var(--ui-danger)', background: 'var(--ui-danger-soft)', padding: '6px 8px', borderRadius: 4 }}>
                    {errorNotice}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Theme Toggle (Light / Dark) */}
          <button
            type="button"
            onClick={toggleTheme}
            className="ui-btn ui-btn--subtle ui-btn--sm"
            style={{ padding: '6px 10px', fontSize: 14 }}
            title={t('actionToggleTheme')}
            aria-label={t('actionToggleTheme')}
          >
            {resolvedTheme === 'dark' ? '☀️' : '🌙'}
          </button>

          {/* Language Toggle (EN / AR) */}
          <button
            type="button"
            onClick={toggleLocale}
            className="ui-btn ui-btn--subtle ui-btn--sm"
            style={{ padding: '5px 9px', fontSize: 12, fontWeight: 700 }}
            title="Switch Language"
            aria-label="Switch Language"
          >
            {locale === 'en' ? 'عربي' : 'EN'}
          </button>
        </div>
      </header>

      {/* Global Search Modal */}
      <GlobalSearchModal
        isOpen={searchOpen}
        onClose={() => setSearchOpen(false)}
        workspaceId={workspaceId}
      />
    </>
  )
}
