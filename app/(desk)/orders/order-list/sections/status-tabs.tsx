'use client'

import { useOrderList } from '../context'

export function StatusTabs() {
  const { filter, orders, setFilter } = useOrderList()
  return (
    <>
      {/* ─── Status Tabs ─── */}
      <div className="toolbar" style={{ marginBottom: 12 }}>
        <button
          className={`tab-btn ${filter === 'all' ? 'active' : ''}`}
          onClick={() => setFilter('all')}
        >
          All ({orders.length})
        </button>
        <button
          className={`tab-btn ${filter === 'pending' ? 'active' : ''}`}
          onClick={() => setFilter('pending')}
        >
          Pending ({orders.filter(o => o.status === 'pending').length})
        </button>
        <button
          className={`tab-btn ${filter === 'assigned' ? 'active' : ''}`}
          onClick={() => setFilter('assigned')}
        >
          Assigned ({orders.filter(o => o.status === 'assigned' || o.status === 'picked_up').length})
        </button>
        <button
          className={`tab-btn ${filter === 'delivered' ? 'active' : ''}`}
          onClick={() => setFilter('delivered')}
        >
          Delivered ({orders.filter(o => o.status === 'delivered').length})
        </button>
        <button
          className={`tab-btn ${filter === 'failed' ? 'active' : ''}`}
          onClick={() => setFilter('failed')}
        >
          Failed / Returned ({orders.filter(o => o.status === 'failed' || o.status === 'returned').length})
        </button>
        <button
          className={`tab-btn ${filter === 'cancelled' ? 'active' : ''}`}
          onClick={() => setFilter('cancelled')}
        >
          Cancelled ({orders.filter(o => o.status === 'cancelled').length})
        </button>
      </div>
    </>
  )
}
