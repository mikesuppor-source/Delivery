'use client'

import React, { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useI18n } from '@/lib/i18n'
import { StatusBadge } from './ui/status-badge'
import { MoneyText } from './ui/money-text'

interface SearchResultOrder {
  id: string
  code: string
  carrier_tracking_code?: string | null
  recipient_name: string
  recipient_phone: string
  status: string
  collection_usd: number
  shop?: { name: string } | null
}

export function GlobalSearchModal({
  isOpen,
  onClose,
  workspaceId,
}: {
  isOpen: boolean
  onClose: () => void
  workspaceId: string
}) {
  const router = useRouter()
  const { t } = useI18n()
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<SearchResultOrder[]>([])
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50)
      setQuery('')
      setResults([])
    }
  }, [isOpen])

  // Debounced search against /api/orders
  useEffect(() => {
    if (!isOpen || !query.trim() || query.trim().length < 2) {
      setResults([])
      setLoading(false)
      return
    }

    setLoading(true)
    const timeout = setTimeout(async () => {
      try {
        const res = await fetch(`/api/orders?workspaceId=${workspaceId}&search=${encodeURIComponent(query.trim())}`)
        if (res.ok) {
          const data = await res.json()
          setResults(data.orders || [])
        }
      } catch {
        // Ignore network errors
      } finally {
        setLoading(false)
      }
    }, 250)

    return () => clearTimeout(timeout)
  }, [isOpen, query, workspaceId])

  // Escape to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const handleSelectOrder = (code: string) => {
    onClose()
    router.push(`/orders?search=${encodeURIComponent(code)}`)
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.65)',
        backdropFilter: 'blur(3px)',
        zIndex: 999,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        padding: '80px 16px 16px',
      }}
      onClick={e => {
        if (e.target === e.currentTarget) onClose()
      }}
      role="dialog"
      aria-modal="true"
    >
      <div
        style={{
          width: '100%',
          maxWidth: 620,
          background: 'var(--ui-surface)',
          border: '1.5px solid var(--ui-border)',
          borderRadius: 'var(--ui-radius)',
          boxShadow: 'var(--ui-shadow-modal)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Search Input Bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '14px 18px',
            borderBottom: '1px solid var(--ui-border)',
            background: 'var(--ui-surface-2)',
          }}
        >
          <span style={{ fontSize: 18, color: 'var(--ui-text-muted)' }}>🔍</span>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={t('searchPlaceholderGlobal')}
            style={{
              flex: 1,
              border: 'none',
              background: 'transparent',
              fontSize: 15,
              fontWeight: 500,
              color: 'var(--ui-text)',
              outline: 'none',
              padding: 0,
            }}
          />
          {loading ? (
            <span style={{ fontSize: 12, color: 'var(--ui-text-muted)' }}>Searching...</span>
          ) : (
            <span
              style={{
                fontSize: 11,
                padding: '2px 6px',
                borderRadius: 4,
                border: '1px solid var(--ui-border)',
                background: 'var(--ui-surface)',
                color: 'var(--ui-text-muted)',
              }}
            >
              ESC
            </span>
          )}
        </div>

        {/* Results List */}
        <div style={{ maxHeight: 380, overflowY: 'auto', padding: 8 }}>
          {query.trim().length >= 2 && results.length === 0 && !loading && (
            <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--ui-text-muted)', fontSize: 13 }}>
              {t('searchNoResults')} for &quot;{query}&quot;
            </div>
          )}

          {results.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  color: 'var(--ui-text-muted)',
                  padding: '6px 10px',
                }}
              >
                {t('searchResults')} ({results.length})
              </div>
              {results.slice(0, 10).map(order => (
                <div
                  key={order.id}
                  onClick={() => handleSelectOrder(order.code)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 14px',
                    borderRadius: 8,
                    cursor: 'pointer',
                    background: 'var(--ui-surface)',
                    border: '1px solid transparent',
                    transition: 'background 0.1s ease',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.background = 'var(--ui-surface-2)'
                    e.currentTarget.style.borderColor = 'var(--ui-border)'
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.background = 'var(--ui-surface)'
                    e.currentTarget.style.borderColor = 'transparent'
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontWeight: 800, fontSize: 14, color: 'var(--ui-text)' }}>
                        {order.code}
                      </span>
                      {order.shop?.name && (
                        <span style={{ fontSize: 11, color: 'var(--ui-primary)', fontWeight: 600 }}>
                          {order.shop.name}
                        </span>
                      )}
                      <StatusBadge status={order.status} size="sm" />
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--ui-text-muted)' }}>
                      {order.recipient_name} · {order.recipient_phone}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <MoneyText amount={order.collection_usd} size="sm" />
                    {order.carrier_tracking_code && (
                      <div style={{ fontSize: 11, color: 'var(--ui-text-muted)' }}>
                        3PL: {order.carrier_tracking_code}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {query.trim().length < 2 && (
            <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--ui-text-muted)', fontSize: 12 }}>
              Type at least 2 characters to search orders, tracking codes, recipient phones, and merchants.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
