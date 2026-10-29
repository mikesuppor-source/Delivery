'use client'

import React, { useState } from 'react'

export interface DateRange {
  from: string
  to: string
}

export interface DateRangePickerProps {
  value: DateRange
  onChange: (range: DateRange) => void
  className?: string
}

export function DateRangePicker({ value, onChange, className = '' }: DateRangePickerProps) {
  const [activePreset, setActivePreset] = useState<string>('today')

  const applyPreset = (preset: string) => {
    setActivePreset(preset)
    const now = new Date()

    if (preset === 'today') {
      const from = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0)
      const to = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)
      onChange({ from: from.toISOString(), to: to.toISOString() })
    } else if (preset === 'yesterday') {
      const yesterday = new Date(now.getTime() - 24 * 3600 * 1000)
      const from = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 0, 0, 0)
      const to = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 23, 59, 59, 999)
      onChange({ from: from.toISOString(), to: to.toISOString() })
    } else if (preset === 'this_week') {
      const day = now.getDay()
      const diff = now.getDate() - day + (day === 0 ? -6 : 1) // Monday
      const monday = new Date(now.setDate(diff))
      const from = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate(), 0, 0, 0)
      const to = new Date()
      onChange({ from: from.toISOString(), to: to.toISOString() })
    } else if (preset === 'this_month') {
      const from = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0)
      const to = new Date()
      onChange({ from: from.toISOString(), to: to.toISOString() })
    } else if (preset === 'last_month') {
      const from = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0)
      const to = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999)
      onChange({ from: from.toISOString(), to: to.toISOString() })
    }
  }

  const handleFromChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setActivePreset('custom')
    const val = e.target.value
    if (val) {
      const date = new Date(val)
      date.setHours(0, 0, 0, 0)
      onChange({ ...value, from: date.toISOString() })
    }
  }

  const handleToChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setActivePreset('custom')
    const val = e.target.value
    if (val) {
      const date = new Date(val)
      date.setHours(23, 59, 59, 999)
      onChange({ ...value, to: date.toISOString() })
    }
  }

  const fromDateStr = value.from ? value.from.slice(0, 10) : ''
  const toDateStr = value.to ? value.to.slice(0, 10) : ''

  return (
    <div
      className={`ui-date-picker ${className}`}
      style={{
        display: 'inline-flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 8,
        background: 'var(--ui-surface)',
        border: '1px solid var(--ui-border)',
        borderRadius: 'var(--ui-radius-sm)',
        padding: '6px 10px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        {[
          { id: 'today', label: 'Today' },
          { id: 'yesterday', label: 'Yesterday' },
          { id: 'this_week', label: 'This Week' },
          { id: 'this_month', label: 'This Month' },
        ].map(p => {
          const isActive = activePreset === p.id
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => applyPreset(p.id)}
              style={{
                border: 'none',
                background: isActive ? 'var(--ui-primary-soft)' : 'transparent',
                color: isActive ? 'var(--ui-primary)' : 'var(--ui-text-muted)',
                borderRadius: 4,
                padding: '4px 8px',
                fontSize: 12,
                fontWeight: isActive ? 700 : 500,
                cursor: 'pointer',
              }}
            >
              {p.label}
            </button>
          )
        })}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <input
          type="date"
          value={fromDateStr}
          onChange={handleFromChange}
          style={{
            padding: '2px 6px',
            fontSize: 12,
            border: '1px solid var(--ui-border)',
            borderRadius: 4,
            background: 'var(--ui-surface-2)',
            width: 'auto',
          }}
          aria-label="From date"
        />
        <span style={{ color: 'var(--ui-text-muted)', fontSize: 11 }}>to</span>
        <input
          type="date"
          value={toDateStr}
          onChange={handleToChange}
          style={{
            padding: '2px 6px',
            fontSize: 12,
            border: '1px solid var(--ui-border)',
            borderRadius: 4,
            background: 'var(--ui-surface-2)',
            width: 'auto',
          }}
          aria-label="To date"
        />
      </div>
    </div>
  )
}
