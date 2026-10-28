'use client'

import { SearchIcon } from '@/components/icons'
import { useRunSheet } from '../context'

export function SearchAndTabs() {
  const { filterTab, search, setFilterTab, setSearch, stats, t } = useRunSheet()
  return (
    <>
        {/* ─── SEARCH & FILTER TABS ─── */}
        <div style={{ marginBottom: 14 }}>
          {/* Search Box */}
          <div
            style={{
              position: 'relative',
              marginBottom: 10,
            }}
          >
            <input
              type="text"
              placeholder={t('searchPlaceholder')}
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{
                width: '100%',
                background: '#1e293b',
                border: '1.5px solid #334155',
                color: '#f8fafc',
                padding: '10px 14px 10px 36px',
                borderRadius: 10,
                fontSize: 13,
                outline: 'none',
              }}
            />
            <div style={{ position: 'absolute', left: 12, top: 12, color: '#94a3b8' }}>
              <SearchIcon size={14} />
            </div>
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                style={{
                  position: 'absolute',
                  right: 12,
                  top: 9,
                  background: 'none',
                  border: 'none',
                  color: '#94a3b8',
                  fontSize: 14,
                  cursor: 'pointer',
                }}
              >
                ✕
              </button>
            )}
          </div>

          {/* Quick Filter Tabs */}
          <div
            style={{
              display: 'flex',
              gap: 6,
              overflowX: 'auto',
              paddingBottom: 4,
            }}
          >
            <button
              type="button"
              onClick={() => setFilterTab('to_deliver')}
              style={{
                background: filterTab === 'to_deliver' ? '#2563eb' : '#1e293b',
                color: filterTab === 'to_deliver' ? '#ffffff' : '#94a3b8',
                border: '1px solid ' + (filterTab === 'to_deliver' ? '#3b82f6' : '#334155'),
                padding: '6px 12px',
                borderRadius: 99,
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {t('toDeliverTab')} ({stats.toDeliver})
            </button>
            <button
              type="button"
              onClick={() => setFilterTab('delivered')}
              style={{
                background: filterTab === 'delivered' ? '#059669' : '#1e293b',
                color: filterTab === 'delivered' ? '#ffffff' : '#94a3b8',
                border: '1px solid ' + (filterTab === 'delivered' ? '#10b981' : '#334155'),
                padding: '6px 12px',
                borderRadius: 99,
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {t('deliveredTab')} ({stats.delivered})
            </button>
            <button
              type="button"
              onClick={() => setFilterTab('all')}
              style={{
                background: filterTab === 'all' ? '#475569' : '#1e293b',
                color: filterTab === 'all' ? '#ffffff' : '#94a3b8',
                border: '1px solid ' + (filterTab === 'all' ? '#64748b' : '#334155'),
                padding: '6px 12px',
                borderRadius: 99,
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {t('allTab')} ({stats.total})
            </button>
            {stats.failed > 0 && (
              <button
                type="button"
                onClick={() => setFilterTab('failed')}
                style={{
                  background: filterTab === 'failed' ? '#dc2626' : '#1e293b',
                  color: filterTab === 'failed' ? '#ffffff' : '#f87171',
                  border: '1px solid ' + (filterTab === 'failed' ? '#ef4444' : '#334155'),
                  padding: '6px 12px',
                  borderRadius: 99,
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                {t('failedTab')} ({stats.failed})
              </button>
            )}
          </div>
        </div>
    </>
  )
}
