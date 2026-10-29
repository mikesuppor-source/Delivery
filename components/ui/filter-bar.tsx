'use client'

import React, { type ReactNode } from 'react'

export interface FilterChip {
  id: string
  label: string
  value: string
  onRemove?: () => void
}

export interface FilterBarProps {
  chips?: FilterChip[]
  onClearAll?: () => void
  search?: {
    value: string
    onChange: (val: string) => void
    placeholder?: string
  }
  savedViews?: {
    views: Array<{ id: string; name: string }>
    activeViewId?: string
    onSelectView: (viewId: string) => void
    onSaveCurrentView?: () => void
  }
  children?: ReactNode
  className?: string
}

export function FilterBar({
  chips = [],
  onClearAll,
  search,
  savedViews,
  children,
  className = '',
}: FilterBarProps) {
  return (
    <div
      className={`ui-filter-bar ${className}`}
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        marginBottom: 16,
      }}
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, flex: '1 1 300px' }}>
        {/* Search input if provided */}
        {search && (
          <div style={{ position: 'relative', width: 260, maxWidth: '100%' }}>
            <input
              type="text"
              value={search.value}
              onChange={e => search.onChange(e.target.value)}
              placeholder={search.placeholder || 'Filter records...'}
              style={{
                paddingInlineStart: 32,
                fontSize: 13,
                height: 36,
                background: 'var(--ui-surface)',
                borderColor: 'var(--ui-border)',
                borderRadius: 'var(--ui-radius-sm)',
              }}
            />
            <span
              style={{
                position: 'absolute',
                insetInlineStart: 10,
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--ui-text-muted)',
                pointerEvents: 'none',
                display: 'flex',
              }}
            >
              🔍
            </span>
          </div>
        )}

        {/* Custom filter dropdowns / controls */}
        {children}

        {/* Active chips */}
        {chips.map(chip => (
          <span
            key={chip.id}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              background: 'var(--ui-surface-2)',
              border: '1px solid var(--ui-border)',
              borderRadius: 9999,
              padding: '4px 10px',
              fontSize: 12,
              fontWeight: 600,
              color: 'var(--ui-text)',
            }}
          >
            <span style={{ color: 'var(--ui-text-muted)' }}>{chip.label}:</span>
            <span>{chip.value}</span>
            {chip.onRemove && (
              <button
                type="button"
                onClick={chip.onRemove}
                style={{
                  border: 'none',
                  background: 'none',
                  cursor: 'pointer',
                  padding: 0,
                  fontSize: 14,
                  lineHeight: 1,
                  color: 'var(--ui-text-muted)',
                  display: 'flex',
                  alignItems: 'center',
                }}
                aria-label={`Remove filter ${chip.label}`}
              >
                ×
              </button>
            )}
          </span>
        ))}

        {chips.length > 0 && onClearAll && (
          <button
            type="button"
            className="ui-btn ui-btn--link"
            onClick={onClearAll}
            style={{ fontSize: 12 }}
          >
            Clear all
          </button>
        )}
      </div>

      {/* Saved views dropdown */}
      {savedViews && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <select
            value={savedViews.activeViewId || ''}
            onChange={e => savedViews.onSelectView(e.target.value)}
            style={{
              padding: '6px 12px',
              fontSize: 12,
              fontWeight: 600,
              background: 'var(--ui-surface)',
              borderColor: 'var(--ui-border)',
              borderRadius: 'var(--ui-radius-sm)',
              width: 'auto',
            }}
          >
            <option value="">Default View</option>
            {savedViews.views.map(v => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
          {savedViews.onSaveCurrentView && (
            <button
              type="button"
              className="ui-btn ui-btn--neutral ui-btn--sm"
              onClick={savedViews.onSaveCurrentView}
            >
              Save View
            </button>
          )}
        </div>
      )}
    </div>
  )
}
