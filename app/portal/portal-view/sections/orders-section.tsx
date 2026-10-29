'use client'

import React from 'react'
import Link from 'next/link'
import { usePortal } from '../context'
import { formatUSD, formatLBP, usdToLbp, formatDate, ORDER_STATUS_LABELS } from '@/lib/utils'
import { WhatsAppIcon } from '@/components/whatsapp-icon'
import { GoogleMapsIcon } from '@/components/google-maps-icon'
import { getGoogleMapsDirectionsUrl } from '@/lib/maps'
import { ShopifyIcon } from '@/components/shopify-icon'
import { TrashIcon, PrinterIcon } from '@/components/icons'

export function OrdersSection() {
  const {
    shop,
    orders,
    rate,
    search,
    setSearch,
    statusFilter,
    setStatusFilter,
    filteredOrders,
    selectedOrderIds,
    setSelectedOrderIds,
    isAllSelected,
    toggleSelectAll,
    toggleSelectOrder,
    handlePrintSelected,
    handleExportCSV,
    handleDeleteOrders,
    isDeleting,
    setInspectingOrder,
    pendingCount,
    inTransitCount,
    deliveredCount,
    returnedCount,
  } = usePortal()

  const origin = typeof window !== 'undefined' ? window.location.origin : (process.env.NEXT_PUBLIC_SITE_URL || '')

  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1.5px solid var(--line)',
        borderRadius: 14,
        padding: '20px 24px',
        boxShadow: 'var(--shadow)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 14, marginBottom: 18 }}>
        {/* Status Tabs */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {[
            { id: 'all', label: `All (${orders.length})` },
            { id: 'pending', label: `Pending Pickup (${pendingCount})` },
            { id: 'in_transit', label: `With Courier (${inTransitCount})` },
            { id: 'delivered', label: `Delivered (${deliveredCount})` },
            { id: 'returned', label: `Returned (${returnedCount})` },
          ].map(tab => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setStatusFilter(tab.id)}
              className={`btn btn-sm ${statusFilter === tab.id ? 'btn-primary' : 'btn-secondary'}`}
              style={{ fontSize: 12 }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Search Box & Quick Export */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={handleExportCSV}
            className="btn btn-secondary btn-sm"
            style={{ fontSize: 12, padding: '7px 12px', display: 'inline-flex', alignItems: 'center', gap: 6 }}
            title="Download orders as CSV spreadsheet"
          >
            <span>Export CSV</span>
          </button>
          <div style={{ minWidth: 220, maxWidth: 320, width: '100%' }}>
            <input
              type="text"
              placeholder="Search code, customer name, phone..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ fontSize: 12.5, padding: '8px 12px' }}
            />
          </div>
        </div>
      </div>

      {/* Batch Selection Action Bar */}
      {selectedOrderIds.length > 0 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--brand-light)',
            border: '1.5px solid var(--brand)',
            borderRadius: 10,
            padding: '10px 16px',
            marginBottom: 16,
            flexWrap: 'wrap',
            gap: 10,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontWeight: 800, color: 'var(--brand)', fontSize: 13 }}>
              {selectedOrderIds.length} {selectedOrderIds.length === 1 ? 'order' : 'orders'} selected
            </span>
            <button
              type="button"
              onClick={() => setSelectedOrderIds([])}
              className="btn btn-ghost btn-sm"
              style={{ fontSize: 11, padding: '3px 8px' }}
            >
              Clear
            </button>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              onClick={handleExportCSV}
              className="btn btn-secondary btn-sm"
              style={{ fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 5 }}
            >
              Export Selected ({selectedOrderIds.length})
            </button>
            <button
              type="button"
              onClick={handlePrintSelected}
              className="btn btn-primary btn-sm"
              style={{ fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <PrinterIcon size={14} />
              <span>Print {selectedOrderIds.length} Waybills</span>
            </button>
            <button
              type="button"
              disabled={isDeleting}
              onClick={() => handleDeleteOrders(selectedOrderIds)}
              className="btn btn-ghost btn-sm"
              style={{ fontSize: 12, color: '#dc2626', border: '1px solid #fecaca', display: 'inline-flex', alignItems: 'center', gap: 5 }}
              title="Cancel selected pending order records"
            >
              <TrashIcon size={13} color="#dc2626" />
              <span>{isDeleting ? 'Cancelling…' : `Cancel (${selectedOrderIds.length})`}</span>
            </button>
          </div>
        </div>
      )}

      {/* Orders Table */}
      {filteredOrders.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 16px', color: 'var(--muted)' }}>
          <p style={{ fontSize: 14, fontWeight: 600 }}>No orders found in this view.</p>
          <p style={{ fontSize: 12, marginTop: 4 }}>
            Click <strong>&quot;Make New Delivery Order&quot;</strong> above to create your first delivery with scannable barcode!
          </p>
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1.5px solid var(--line)', textAlign: 'left', color: 'var(--muted)', fontSize: 11, textTransform: 'uppercase' }}>
                <th style={{ width: 36, padding: '10px 12px' }}>
                  <input
                    type="checkbox"
                    checked={isAllSelected}
                    onChange={toggleSelectAll}
                    title="Select / Deselect All Orders"
                    style={{ cursor: 'pointer', width: 16, height: 16 }}
                  />
                </th>
                <th style={{ padding: '10px 12px' }}>Waybill Code</th>
                <th style={{ padding: '10px 12px' }}>Recipient & Destination</th>
                <th style={{ padding: '10px 12px' }}>Area & Fee</th>
                <th style={{ padding: '10px 12px' }}>COD Collection</th>
                <th style={{ padding: '10px 12px' }}>Status</th>
                <th style={{ padding: '10px 12px' }}>Courier</th>
                <th style={{ padding: '10px 12px', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredOrders.map(order => {
                const trackingUrl = `${origin}/track/${order.tracking_token || order.code}`
                const whatsappMsg = `Hello ${order.recipient_name || 'Customer'}, your order from ${shop.name} has been registered! Tracking code: #${order.code}. Live tracking: ${trackingUrl}. Amount on delivery: $${Number(order.collection_usd).toFixed(2)} (${usdToLbp(Number(order.collection_usd), order.usd_to_lbp_rate || rate).toLocaleString()} L.L.).`
                const whatsappUrl = `https://wa.me/${order.recipient_phone?.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(whatsappMsg)}`
                const isRowSelected = selectedOrderIds.includes(order.id)

                return (
                  <tr
                    key={order.id}
                    style={{
                      borderBottom: '1px solid var(--line)',
                      background: isRowSelected ? 'rgba(34, 197, 94, 0.05)' : undefined,
                    }}
                  >
                    <td style={{ width: 36, padding: '12px' }}>
                      <input
                        type="checkbox"
                        checked={isRowSelected}
                        onChange={() => toggleSelectOrder(order.id)}
                        style={{ cursor: 'pointer', width: 16, height: 16 }}
                      />
                    </td>
                    <td style={{ padding: '12px' }}>
                      <button
                        type="button"
                        onClick={() => setInspectingOrder(order)}
                        style={{
                          fontFamily: 'monospace',
                          fontWeight: 800,
                          color: 'var(--brand)',
                          fontSize: 13,
                          background: 'none',
                          border: 'none',
                          padding: 0,
                          cursor: 'pointer',
                          display: 'inline-block',
                          textAlign: 'left',
                          textDecoration: 'underline',
                          textDecorationColor: 'transparent',
                          transition: 'text-decoration-color .15s',
                        }}
                        onMouseEnter={e => (e.currentTarget.style.textDecorationColor = 'var(--brand)')}
                        onMouseLeave={e => (e.currentTarget.style.textDecorationColor = 'transparent')}
                        title="Click to inspect live order status & timeline"
                      >
                        #{order.code}
                      </button>
                      {order.service_type === 'replacement' && (
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 5px', borderRadius: 4, background: 'rgba(217,119,6,0.15)', color: '#b45309', border: '1px solid rgba(217,119,6,0.3)', marginLeft: 6 }}>
                          Swap
                        </span>
                      )}
                      {order.service_type === 'pickup' && (
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 5px', borderRadius: 4, background: 'rgba(124,58,237,0.15)', color: '#7c3aed', border: '1px solid rgba(124,58,237,0.3)', marginLeft: 6 }}>
                          Pickup
                        </span>
                      )}
                      {order.is_breakable && (
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 5px', borderRadius: 4, background: 'rgba(220,38,38,0.12)', color: '#dc2626', border: '1px solid rgba(220,38,38,0.25)', marginLeft: 4 }}>
                          Fragile
                        </span>
                      )}
                      {order.shopify_order_number && (
                        <div style={{ marginTop: 2 }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10.5, fontWeight: 700, color: '#3f6212', background: '#ecfccb', padding: '1px 6px', borderRadius: 4, border: '1px solid #bef264' }}>
                            <ShopifyIcon size={11} />
                            <span>Shopify {order.shopify_order_number}</span>
                          </span>
                        </div>
                      )}
                      <small style={{ display: 'block', fontSize: 11, color: 'var(--muted)' }}>
                        {formatDate(order.created_at)}
                      </small>
                    </td>

                    <td style={{ padding: '12px' }}>
                      <strong style={{ color: 'var(--text)', display: 'block' }}>
                        {order.recipient_name || '—'}
                      </strong>
                      {order.recipient_phone && (
                        <span style={{ fontSize: 12, color: 'var(--muted)', display: 'block' }}>
                          {order.recipient_phone}
                        </span>
                      )}
                      {order.recipient_address && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                          <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                            {order.recipient_address}
                          </span>
                          <a
                            href={getGoogleMapsDirectionsUrl(order.recipient_address)}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="Directions on Google Maps"
                            style={{ display: 'inline-flex', verticalAlign: 'middle' }}
                          >
                            <GoogleMapsIcon size={12} />
                          </a>
                        </div>
                      )}
                    </td>

                    <td style={{ padding: '12px' }}>
                      <span style={{ fontWeight: 600 }}>{order.area?.name || 'Standard Area'}</span>
                      <small style={{ display: 'block', fontSize: 11, color: 'var(--muted)' }}>
                        Fee: {formatUSD(Number(order.delivery_fee_usd))}
                      </small>
                    </td>

                    <td style={{ padding: '12px' }}>
                      <strong style={{ color: '#047857' }}>
                        {formatUSD(Number(order.collection_usd))}
                      </strong>
                      <small style={{ display: 'block', fontSize: 11, color: 'var(--muted)' }}>
                        {formatLBP(usdToLbp(Number(order.collection_usd), order.usd_to_lbp_rate || rate))}
                      </small>
                      <small style={{ fontSize: 10, color: 'var(--muted)', display: 'block' }}>
                        Net to you: {formatUSD(Number(order.shop_balance_usd))}
                      </small>
                    </td>

                    <td style={{ padding: '12px' }}>
                      <button
                        type="button"
                        onClick={() => setInspectingOrder(order)}
                        className={`badge badge-${order.status}`}
                        style={{
                          fontSize: 12,
                          textTransform: 'capitalize',
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                        }}
                        title="Click to inspect order status timeline"
                      >
                        <span>{ORDER_STATUS_LABELS[order.status] || order.status}</span>
                      </button>
                      {order.is_held && (
                        <div style={{ marginTop: 4 }}>
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                              fontSize: 11,
                              fontWeight: 700,
                              color: '#92400e',
                              background: '#fef3c7',
                              padding: '2px 7px',
                              borderRadius: 6,
                              border: '1px solid #fde68a',
                            }}
                            title={`Held in warehouse${order.deliver_after ? ` until ${order.deliver_after}` : ''}`}
                          >
                            <span>📦 Held</span>
                            {order.hold_reason && (
                              <span style={{ fontWeight: 500, opacity: 0.9 }}>
                                : {order.hold_reason.replace('_', ' ')}
                              </span>
                            )}
                            {order.deliver_after && (
                              <span style={{ fontWeight: 500, opacity: 0.85 }}>
                                • from {new Date(order.deliver_after).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                              </span>
                            )}
                          </span>
                        </div>
                      )}
                    </td>

                    <td style={{ padding: '12px' }}>
                      {order.driver ? (
                        <div>
                          <span style={{ fontWeight: 600, fontSize: 12 }}>{order.driver.name}</span>
                          {order.driver.phone && (
                            <small style={{ display: 'block', fontSize: 11, color: 'var(--muted)' }}>
                              {order.driver.phone}
                            </small>
                          )}
                        </div>
                      ) : (
                        <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                          Waiting for courier
                        </span>
                      )}
                    </td>

                    <td style={{ padding: '12px', textAlign: 'right' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>
                        <button
                          type="button"
                          onClick={() => setInspectingOrder(order)}
                          className="btn btn-secondary btn-sm"
                          style={{ padding: '4px 8px', fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4 }}
                          title="Inspect full order status and milestone progression"
                        >
                          <span>Status</span>
                        </button>

                        {order.recipient_phone && (
                          <a
                            href={whatsappUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn btn-secondary btn-sm"
                            style={{ padding: '4px 8px', fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4 }}
                            title="Send WhatsApp confirmation to customer"
                          >
                            <WhatsAppIcon size={12} color="#059669" />
                            <span>WhatsApp</span>
                          </a>
                        )}

                        <Link
                          href={`/print/order/${order.code}?print=true`}
                          target="_blank"
                          className="btn btn-secondary btn-sm"
                          style={{ padding: '4px 8px', fontSize: 11, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                          title="Print scannable Waybill receipt"
                        >
                          <PrinterIcon size={12} />
                          <span>Slip</span>
                        </Link>

                        <Link
                          href={`/track/${order.tracking_token || order.code}`}
                          target="_blank"
                          className="btn btn-ghost btn-sm"
                          style={{ padding: '4px 8px', fontSize: 11, textDecoration: 'none' }}
                          title="Open live customer tracking page"
                        >
                          Track ↗
                        </Link>

                        {order.status === 'pending' && (
                          <button
                            type="button"
                            disabled={isDeleting}
                            onClick={() => handleDeleteOrders([order.id], `#${order.code}`)}
                            className="btn btn-ghost btn-sm"
                            style={{ padding: '4px 7px', fontSize: 11, color: '#dc2626' }}
                            title={`Cancel pending order #${order.code}`}
                          >
                            <TrashIcon size={12} color="#dc2626" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
