'use client'

import Link from 'next/link'
import { useOrderList } from '../context'

export function BulkActionsBar() {
  const {
    bulkDriverId,
    bulkLoading,
    bulkMessage,
    canManage,
    drivers,
    handleBulkExecute,
    handleDeleteOrders,
    isOwner,
    selectedOrderIds,
    setBulkDriverId,
    setSelectedOrderIds,
    orders,
    setIsReturnsHandoverOpen,
  } = useOrderList()

  const returnedSelectedCount = orders.filter(
    o => selectedOrderIds.includes(o.id) && o.status === 'returned' && !o.returns_handed_at
  ).length

  return (
    <>
      {/* ─── FLOATING BATCH ACTIONS TOOLBAR (WHEN ORDERS SELECTED) ─── */}
      {selectedOrderIds.length > 0 && canManage && (
        <div
          style={{
            position: 'sticky',
            bottom: 24,
            zIndex: 40,
            background: '#111827',
            color: '#ffffff',
            padding: '12px 20px',
            borderRadius: 10,
            boxShadow: '0 12px 36px rgba(0,0,0,0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
            flexWrap: 'wrap',
            margin: '0 0 20px',
            border: '1px solid rgba(255,255,255,0.1)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span
              style={{
                fontWeight: 800,
                fontSize: 12.5,
                background: 'var(--brand)',
                color: '#fff',
                padding: '3px 10px',
                borderRadius: 99,
              }}
            >
              {selectedOrderIds.length} Orders Selected
            </span>
            <button
              type="button"
              onClick={() => setSelectedOrderIds([])}
              style={{
                background: 'none',
                border: 'none',
                color: '#9ca3af',
                fontSize: 12,
                cursor: 'pointer',
                textDecoration: 'underline',
              }}
            >
              Deselect All
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            {/* Bulk Assign Driver */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <select
                value={bulkDriverId}
                onChange={e => setBulkDriverId(e.target.value)}
                style={{
                  fontSize: 12,
                  padding: '6px 10px',
                  borderRadius: 6,
                  border: '1px solid #374151',
                  background: '#1f2937',
                  color: '#fff',
                }}
              >
                <option value="">Assign Courier…</option>
                {drivers.map(d => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={!bulkDriverId || bulkLoading}
                onClick={() => handleBulkExecute('assign_driver', { driverId: bulkDriverId })}
                className="btn btn-secondary btn-sm"
                style={{ fontSize: 12 }}
              >
                Assign
              </button>
            </div>

            {/* Bulk Status Updates */}
            <button
              type="button"
              disabled={bulkLoading}
              onClick={() => handleBulkExecute('update_status', { status: 'picked_up' })}
              className="btn btn-secondary btn-sm"
              style={{ fontSize: 12 }}
            >
              Mark Picked Up
            </button>

            <button
              type="button"
              disabled={bulkLoading}
              onClick={() => handleBulkExecute('update_status', { status: 'delivered' })}
              className="btn btn-primary btn-sm"
              style={{ fontSize: 12 }}
            >
              Mark Delivered
            </button>

            <button
              type="button"
              disabled={bulkLoading}
              onClick={() => handleBulkExecute('update_status', { status: 'returned' })}
              className="btn btn-ghost btn-sm"
              style={{ fontSize: 12, color: '#f87171' }}
            >
              Mark Returned
            </button>

            {/* Return Handover to Shop */}
            {returnedSelectedCount > 0 && (
              <button
                type="button"
                disabled={bulkLoading}
                onClick={() => setIsReturnsHandoverOpen(true)}
                className="btn btn-sm"
                style={{
                  fontSize: 12,
                  background: '#059669',
                  color: '#fff',
                  border: '1px solid #10b981',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                }}
              >
                <span>📦 Handover to Shop ({returnedSelectedCount})</span>
              </button>
            )}

            {/* Batch Waybills Print */}
            <Link
              href={`/print/bulk?ids=${selectedOrderIds.join(',')}`}
              target="_blank"
              className="btn btn-secondary btn-sm"
              style={{
                fontSize: 12,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                textDecoration: 'none',
                color: '#fff',
                background: '#374151',
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="6 9 6 2 18 2 18 9" />
                <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                <rect x="6" y="14" width="12" height="8" />
              </svg>
              Print All ({selectedOrderIds.length}) Waybills
            </Link>

            {/* Batch Delete Orders */}
            {isOwner && (
              <button
                type="button"
                disabled={bulkLoading}
                onClick={() => handleDeleteOrders(selectedOrderIds)}
                className="btn btn-ghost btn-sm"
                style={{
                  fontSize: 12,
                  color: '#fca5a5',
                  background: 'rgba(239, 68, 68, 0.18)',
                  border: '1px solid rgba(239, 68, 68, 0.35)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                }}
                title="Permanently delete selected records (Owner Only)"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
                <span>Delete Selected ({selectedOrderIds.length})</span>
              </button>
            )}
          </div>
        </div>
      )}

      {bulkMessage && (
        <div
          style={{
            background: '#ecfdf5',
            color: '#065f46',
            border: '1px solid #86efac',
            padding: '10px 16px',
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 600,
            marginBottom: 20,
          }}
        >
          {bulkMessage}
        </div>
      )}
    </>
  )
}
