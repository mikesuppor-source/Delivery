'use client'

import React from 'react'
import { useDriverProfile } from './context'
import { HeaderSection } from './sections/header-section'
import { KpiSection } from './sections/kpi-section'
import { OrdersSection } from './sections/orders-section'
import { SettlementsSection } from './sections/settlements-section'
import { ModalsSection } from './sections/modals-section'

export function DriverProfileView() {
  const {
    activeTab,
    setActiveTab,
    orderStatusFilter,
    setOrderStatusFilter,
    searchQuery,
    setSearchQuery,
    totalOrdersCount,
    deliveredCount,
    activeCount,
    returnedCount,
    settlements,
  } = useDriverProfile()

  return (
    <div>
      <HeaderSection />
      <KpiSection />

      {/* ─── Main Content Tabs: Which Orders & Settlement History ─── */}
      <div className="panel">
        <div
          className="panel-title"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 16,
          }}
        >
          {/* Main View Tabs */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              type="button"
              onClick={() => setActiveTab('orders')}
              style={{
                padding: '8px 16px',
                borderRadius: 'var(--radius-sm)',
                fontSize: 13,
                fontWeight: 600,
                border: 'none',
                cursor: 'pointer',
                background: activeTab === 'orders' ? 'var(--brand)' : 'transparent',
                color: activeTab === 'orders' ? '#fff' : 'var(--muted)',
                transition: 'all .15s',
              }}
            >
              Which Orders ({totalOrdersCount})
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('settlements')}
              style={{
                padding: '8px 16px',
                borderRadius: 'var(--radius-sm)',
                fontSize: 13,
                fontWeight: 600,
                border: 'none',
                cursor: 'pointer',
                background: activeTab === 'settlements' ? 'var(--brand)' : 'transparent',
                color: activeTab === 'settlements' ? '#fff' : 'var(--muted)',
                transition: 'all .15s',
              }}
            >
              Settlement History ({settlements.length})
            </button>
          </div>

          {/* If on orders tab, show search & status filter */}
          {activeTab === 'orders' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', background: 'var(--bg)', borderRadius: 'var(--radius-sm)', padding: 3, border: '1px solid var(--line)' }}>
                <button
                  type="button"
                  onClick={() => setOrderStatusFilter('all')}
                  style={{
                    padding: '4px 10px',
                    borderRadius: 4,
                    fontSize: 12,
                    fontWeight: 600,
                    border: 'none',
                    cursor: 'pointer',
                    background: orderStatusFilter === 'all' ? 'var(--surface)' : 'transparent',
                    color: orderStatusFilter === 'all' ? 'var(--text)' : 'var(--muted)',
                    boxShadow: orderStatusFilter === 'all' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                  }}
                >
                  All ({totalOrdersCount})
                </button>
                <button
                  type="button"
                  onClick={() => setOrderStatusFilter('delivered')}
                  style={{
                    padding: '4px 10px',
                    borderRadius: 4,
                    fontSize: 12,
                    fontWeight: 600,
                    border: 'none',
                    cursor: 'pointer',
                    background: orderStatusFilter === 'delivered' ? 'var(--surface)' : 'transparent',
                    color: orderStatusFilter === 'delivered' ? '#047857' : 'var(--muted)',
                    boxShadow: orderStatusFilter === 'delivered' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                  }}
                >
                  Delivered ({deliveredCount})
                </button>
                <button
                  type="button"
                  onClick={() => setOrderStatusFilter('active')}
                  style={{
                    padding: '4px 10px',
                    borderRadius: 4,
                    fontSize: 12,
                    fontWeight: 600,
                    border: 'none',
                    cursor: 'pointer',
                    background: orderStatusFilter === 'active' ? 'var(--surface)' : 'transparent',
                    color: orderStatusFilter === 'active' ? '#1d4ed8' : 'var(--muted)',
                    boxShadow: orderStatusFilter === 'active' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                  }}
                >
                  Active ({activeCount})
                </button>
                {returnedCount > 0 && (
                  <button
                    type="button"
                    onClick={() => setOrderStatusFilter('returned')}
                    style={{
                      padding: '4px 10px',
                      borderRadius: 4,
                      fontSize: 12,
                      fontWeight: 600,
                      border: 'none',
                      cursor: 'pointer',
                      background: orderStatusFilter === 'returned' ? 'var(--surface)' : 'transparent',
                      color: orderStatusFilter === 'returned' ? '#b91c1c' : 'var(--muted)',
                      boxShadow: orderStatusFilter === 'returned' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                    }}
                  >
                    Returned ({returnedCount})
                  </button>
                )}
              </div>

              <input
                type="text"
                placeholder="Search orders, shops, areas…"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{
                  fontSize: 12,
                  padding: '6px 12px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1.5px solid var(--line)',
                  background: 'var(--bg)',
                  minWidth: 200,
                }}
              />
            </div>
          )}
        </div>

        {activeTab === 'orders' ? <OrdersSection /> : <SettlementsSection />}
      </div>

      <ModalsSection />
    </div>
  )
}
