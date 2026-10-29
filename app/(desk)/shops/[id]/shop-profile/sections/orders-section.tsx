'use client'

import React from 'react'
import Link from 'next/link'
import { useShopProfile } from '../context'
import { formatUSD, formatLBP, usdToLbp, formatDate, ORDER_STATUS_LABELS } from '@/lib/utils'
import { WhatsAppIcon } from '@/components/whatsapp-icon'
import { getCustomerOrderWhatsAppUrl } from '@/lib/whatsapp'

export function OrdersSection() {
  const {
    shop,
    workspace,
    orderStatusFilter,
    searchQuery,
    filteredOrders,
    filteredCodTotal,
    filteredFeesTotal,
    filteredShopNetTotal,
  } = useShopProfile()

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Order Code</th>
            <th>Date</th>
            <th>Recipient & Area</th>
            <th>Courier / Driver</th>
            <th>COD Collection</th>
            <th>Delivery Fee</th>
            <th>Net Store Credit</th>
            <th>Status</th>
            <th style={{ textAlign: 'right' }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {filteredOrders.map(order => {
            const codLbp = usdToLbp(Number(order.collection_usd) || 0, order.usd_to_lbp_rate || workspace.usd_to_lbp)
            const netCredited = (Number(order.collection_usd) || 0) - (Number(order.delivery_fee_usd) || 0)

            return (
              <tr key={order.id}>
                {/* Code */}
                <td>
                  <Link
                    href={`/track/${order.tracking_token || order.code}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      fontWeight: 700,
                      fontFamily: 'monospace',
                      color: 'var(--brand)',
                      textDecoration: 'none',
                    }}
                    title="Open Live Tracking Page"
                  >
                    #{order.code}
                  </Link>
                </td>

                {/* Date */}
                <td>
                  <span style={{ fontSize: 12 }}>{formatDate(order.created_at)}</span>
                </td>

                {/* Recipient */}
                <td>
                  <div>
                    <strong>{order.recipient_name || 'Customer'}</strong>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                      {order.recipient_phone ? (
                        <a
                          href={getCustomerOrderWhatsAppUrl({
                            customerPhone: order.recipient_phone,
                            customerName: order.recipient_name,
                            orderCode: order.code,
                            trackingToken: order.tracking_token,
                            shopName: shop.name,
                            collectionUsd: Number(order.collection_usd) || 0,
                            collectionLbp: codLbp,
                            driverName: order.driver?.name,
                            status: order.status,
                          })}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="whatsapp-badge"
                          style={{ fontSize: 11, padding: '2px 6px' }}
                          title="Message customer on WhatsApp"
                        >
                          <WhatsAppIcon size={11} />
                          <span>{order.recipient_phone}</span>
                        </a>
                      ) : null}
                      {order.area && (
                        <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                          ({order.area.name})
                        </span>
                      )}
                    </div>
                  </div>
                </td>

                {/* Driver */}
                <td>
                  {order.driver ? (
                    <Link
                      href={`/drivers/${order.driver.id}`}
                      style={{ fontWeight: 600, color: 'var(--brand)', textDecoration: 'none', fontSize: 13 }}
                    >
                      {order.driver.name}
                    </Link>
                  ) : (
                    <span style={{ color: 'var(--muted)', fontSize: 12 }}>Unassigned</span>
                  )}
                </td>

                {/* COD Collection */}
                <td>
                  <strong>{formatUSD(Number(order.collection_usd) || 0)}</strong>
                  <small>{formatLBP(codLbp)}</small>
                </td>

                {/* Delivery Fee */}
                <td>
                  <span>{formatUSD(Number(order.delivery_fee_usd) || 0)}</span>
                </td>

                {/* Net Store Credit */}
                <td>
                  {order.status === 'delivered' ? (
                    <strong style={{ color: 'var(--brand)', fontSize: 13.5 }}>
                      {formatUSD(netCredited)}
                    </strong>
                  ) : order.status === 'returned' ? (
                    <strong style={{ color: '#b91c1c', fontSize: 13.5 }} title="Retail return / refund fee ($2.00) billed to store">
                      {formatUSD(netCredited)}
                    </strong>
                  ) : (
                    <span style={{ color: 'var(--muted)', fontSize: 12 }}>Pending delivery</span>
                  )}
                </td>

                {/* Status */}
                <td>
                  <span
                    className={`badge ${
                      order.status === 'delivered'
                        ? 'badge-delivered'
                        : ['dispatched', 'assigned', 'picked_up'].includes(order.status)
                        ? 'badge-dispatched'
                        : 'badge-returned'
                    }`}
                  >
                    {ORDER_STATUS_LABELS[order.status] || order.status}
                  </span>
                </td>

                {/* Actions */}
                <td style={{ textAlign: 'right' }}>
                  <Link
                    href={`/track/${order.tracking_token || order.code}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-ghost"
                    style={{ fontSize: 11, padding: '4px 8px' }}
                  >
                    Track
                  </Link>
                </td>
              </tr>
            )
          })}
        </tbody>

        {/* Dynamic Footer with Table Aggregates */}
        {filteredOrders.length > 0 && (
          <tfoot>
            <tr style={{ background: 'var(--bg)', fontWeight: 700, borderTop: '2px solid var(--line)' }}>
              <td colSpan={4}>
                Showing {filteredOrders.length} {orderStatusFilter !== 'all' ? orderStatusFilter : ''} orders
              </td>
              <td>
                <div>{formatUSD(filteredCodTotal)}</div>
                <small style={{ fontWeight: 500 }}>Total COD</small>
              </td>
              <td>
                <div>{formatUSD(filteredFeesTotal)}</div>
                <small style={{ fontWeight: 500 }}>Total Fees</small>
              </td>
              <td>
                <div style={{ color: 'var(--brand)' }}>{formatUSD(filteredShopNetTotal)}</div>
                <small style={{ fontWeight: 500 }}>Net Credited</small>
              </td>
              <td colSpan={2} />
            </tr>
          </tfoot>
        )}
      </table>

      {filteredOrders.length === 0 && (
        <div className="empty">
          <h3>No orders found</h3>
          <p>
            {searchQuery
              ? `No orders matching "${searchQuery}". Try a different keyword.`
              : `No ${orderStatusFilter !== 'all' ? orderStatusFilter : ''} orders registered for this store.`}
          </p>
        </div>
      )}
    </div>
  )
}
