'use client'

import { Button } from '@/components/ui'
import { getDateRangeLabel, type DateRangePreset } from '@/lib/utils'
import { useOrderList } from '../context'

const PRESETS: Array<{ id: DateRangePreset; label: string }> = [
  { id: 'all', label: 'All Time' },
  { id: 'today', label: 'Today' },
  { id: 'this_month', label: 'This Month' },
  { id: 'last_month', label: 'Last Month' },
  { id: 'this_year', label: 'This Year' },
  { id: 'last_year', label: 'Last Year' },
  { id: 'custom', label: 'Custom Range' },
]

const inputStyle = { fontSize: 12, padding: '3px 8px', borderRadius: 4, border: '1px solid var(--line)', background: 'var(--bg)' }

/** Timeframe presets, custom dates and sort order. */
export function DateToolbar() {
  const { customEnd, customStart, datePreset, setCustomEnd, setCustomStart, setDatePreset, setSortBy, sortBy } = useOrderList()

  return (
    <div className="panel" style={{ padding: '12px 18px', marginBottom: 20, background: 'var(--surface)', border: '1.5px solid var(--line)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div role="group" aria-label="Timeframe" style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', marginRight: 4 }}>Timeframe:</span>
          {PRESETS.map(preset => (
            <Button key={preset.id} variant="toggle" className="ui-btn--pill" aria-pressed={datePreset === preset.id} onClick={() => setDatePreset(preset.id)}>
              {preset.label}
            </Button>
          ))}
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 600, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
          Sort by:
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value as typeof sortBy)}
            style={{ ...inputStyle, padding: '4px 10px', borderRadius: 'var(--radius-sm)', color: 'var(--text)', fontWeight: 600, cursor: 'pointer' }}
          >
            <option value="newest">Newest First</option>
            <option value="oldest">Oldest First</option>
            <option value="collection_high">Highest COD Collection ($)</option>
            <option value="fee_high">Highest Delivery Fee ($)</option>
          </select>
        </label>
      </div>

      {datePreset === 'custom' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--line)', flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>
            From:
            <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} style={inputStyle} />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>
            To:
            <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)} style={inputStyle} />
          </label>
        </div>
      )}

      {datePreset !== 'all' && (
        <div style={{ marginTop: 8, fontSize: 11.5, color: 'var(--brand)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
          <span>Filtering orders for:</span>
          <span style={{ background: 'var(--brand-light)', padding: '2px 8px', borderRadius: 4 }}>{getDateRangeLabel(datePreset, customStart, customEnd)}</span>
          <Button variant="link" style={{ color: '#dc2626' }} onClick={() => setDatePreset('all')}>
            Reset to All Time
          </Button>
        </div>
      )}
    </div>
  )
}
