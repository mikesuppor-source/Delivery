'use client'

import Link from 'next/link'
import { ShopifyIcon } from '@/components/shopify-icon'
import { getDateRangeLabel } from '@/lib/utils'
import { ScanIcon } from '@/components/icons'
import { useOrderList } from '../context'

export function OrdersHeader() {
  const { autoAssigning, canManage, customEnd, customStart, datePreset, filteredOrders, handleAutoAssign, handleExportCsv, orders, playChime, setIsBulkImportOpen, setIsScannerOpen, setSoundEnabled, soundEnabled } = useOrderList()
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Orders</h1>
          <p>
            {orders.length} orders total · {filteredOrders.length} displayed
            {datePreset !== 'all' && (
              <span style={{ color: 'var(--brand)', fontWeight: 600, marginLeft: 6 }}>
                ({getDateRangeLabel(datePreset, customStart, customEnd)})
              </span>
            )}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {canManage && (
            <button
              type="button"
              className="btn btn-secondary"
              disabled={autoAssigning}
              onClick={handleAutoAssign}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
              title="Automatically assign unassigned pending orders to their designated area courier"
            >
              <span>{autoAssigning ? 'Auto-Dispatching…' : 'Auto-Assign by Area'}</span>
            </button>
          )}

          {canManage && (
            <button
              className="btn btn-secondary"
              onClick={() => setIsScannerOpen(true)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
              title="Open Barcode & QR Code Warehouse Scanner"
            >
              <ScanIcon size={14} />
              <span>Scan Barcode / QR</span>
            </button>
          )}
          {canManage && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleExportCsv}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
              title="Download current filtered orders as CSV for Excel"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              <span>Export CSV</span>
            </button>
          )}

          {canManage && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setIsBulkImportOpen(true)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
              title="Bulk Import Orders from CSV or Shopify Export"
            >
              <ShopifyIcon size={14} />
              <span>Import CSV / Shopify</span>
            </button>
          )}

          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              setSoundEnabled(prev => {
                const next = !prev
                if (next) playChime()
                return next
              })
            }}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13 }}
            title={soundEnabled ? 'Live Order Audio Alerts: Active (Click to mute)' : 'Live Order Audio Alerts: Muted (Click to enable)'}
          >
            <span>{soundEnabled ? 'Sound On' : 'Muted'}</span>
          </button>

          {canManage && (
            <Link href="/orders/new" className="btn btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="12" y1="5" x2="12" y2="19"/>
                <line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              New order
            </Link>
          )}
        </div>
      </div>
    </>
  )
}
