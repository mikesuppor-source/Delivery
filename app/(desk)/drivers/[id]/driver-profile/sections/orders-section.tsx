'use client'

import React from 'react'
import Link from 'next/link'
import { useDriverProfile } from '../context'
import { formatUSD, formatLBP, usdToLbp, formatDate, ORDER_STATUS_LABELS } from '@/lib/utils'
import { WhatsAppIcon } from '@/components/whatsapp-icon'
import { getWhatsAppUrl, getCustomerOrderWhatsAppUrl } from '@/lib/whatsapp'
import { GoogleMapsIcon } from '@/components/google-maps-icon'
import { getGoogleMapsDirectionsUrl } from '@/lib/maps'

export function OrdersSection() {
  const {
    driver,
    workspace,
    orderStatusFilter,
    searchQuery,
    filteredOrders,
    filteredCodTotal,
    filteredDriverPayTotal,
    filteredCompanyProfitTotal,
  } = useDriverProfile()

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Order Code</th>
            <th>Date</th>
            <th>Merchant / Shop</th>
            <th>Recipient & Area</th>
            <th>COD Collection</th>
            <th>Driver Net Make</th>
            <th>Company Profit</th>
            <th>Status</th>
            <th style={{ textAlign: 'right' }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {filteredOrders.map(order => {
            const companyOrderProfit =
              order.status === 'delivered'
                ? (Number(order.delivery_fee_usd) || 0) - (Number(order.driver_pay_usd) || 0)
                : 0

            const codLbp = usdToLbp(Number(order.collection_usd) || 0, order.usd_to_lbp_rate || workspace.usd_to_lbp)

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
                    title="View Public Tracking Page"
                  >
                    #{order.code}
                  </Link>
                </td>

                {/* Date */}
                <td>
                  <span style={{ fontSize: 12 }}>{formatDate(order.created_at)}</span>
                </td>

                {/* Shop */}
                <td>
                  {order.shop ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <strong>{order.shop.name}</strong>
                      {order.shop.phone && (
                        <a
                          href={getWhatsAppUrl(order.shop.phone, `Hello ${order.shop.name}, regarding order #${order.code} handled by courier ${driver.name}.`)}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Chat with merchant on WhatsApp"
                          style={{ color: '#25D366', display: 'inline-flex' }}
                        >
                          <WhatsAppIcon size={13} />
                        </a>
                      )}
                    </div>
                  ) : (
                    <span style={{ color: 'var(--muted)' }}>—</span>
                  )}
                </td>

                {/* Recipient & Destination */}
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
                            shopName: order.shop?.name,
                            collectionUsd: Number(order.collection_usd) || 0,
                            collectionLbp: codLbp,
                            driverName: driver.name,
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
                    {order.recipient_address && (
                      <div style={{ marginTop: 4 }}>
                        <a
                          href={getGoogleMapsDirectionsUrl(order.recipient_address)}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            fontSize: 11,
                            fontWeight: 600,
                            color: '#2563eb',
                            background: '#eff6ff',
                            padding: '2px 8px',
                            borderRadius: 4,
                            textDecoration: 'none',
                            border: '1px solid #bfdbfe',
                          }}
                          title="Open 1-Tap Google Maps Turn-by-Turn Navigation"
                        >
                          <GoogleMapsIcon size={11} />
                          <span>{order.recipient_address}</span>
                        </a>
                      </div>
                    )}
                  </div>
                </td>

                {/* COD Collection */}
                <td>
                  <strong>{formatUSD(Number(order.collection_usd) || 0)}</strong>
                  <small>{formatLBP(codLbp)}</small>
                </td>

                {/* Driver Net Cut */}
                <td>
                  <strong style={{ color: '#047857' }}>
                    {formatUSD(Number(order.driver_pay_usd) || 0)}
                  </strong>
                  <small>Driver Commission</small>
                </td>

                {/* Company Net Profit */}
                <td>
                  {order.status === 'delivered' ? (
                    <>
                      <strong style={{ color: companyOrderProfit >= 0 ? 'var(--brand)' : '#dc2626' }}>
                        +{formatUSD(companyOrderProfit)}
                      </strong>
                      <small>
                        Fee: {formatUSD(Number(order.delivery_fee_usd) || 0)}
                      </small>
                    </>
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
                <div style={{ color: '#047857' }}>{formatUSD(filteredDriverPayTotal)}</div>
                <small style={{ fontWeight: 500 }}>Total Driver Net</small>
              </td>
              <td>
                <div style={{ color: 'var(--brand)' }}>+{formatUSD(filteredCompanyProfitTotal)}</div>
                <small style={{ fontWeight: 500 }}>Total Company Profit</small>
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
              : `No ${orderStatusFilter !== 'all' ? orderStatusFilter : ''} orders assigned to this driver.`}
          </p>
        </div>
      )}
    </div>
  )
}
