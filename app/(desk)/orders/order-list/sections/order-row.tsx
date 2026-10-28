'use client'

import Link from 'next/link'
import { WhatsAppIcon } from '@/components/whatsapp-icon'
import { GoogleMapsIcon } from '@/components/google-maps-icon'
import { ShopifyIcon } from '@/components/shopify-icon'
import { TrashIcon } from '@/components/icons'
import { Tag, TagLink } from '@/components/ui'
import { formatUSD, formatLBP, usdToLbp } from '@/lib/utils'
import { getWhatsAppUrl, buildCustomerOrderMessage, buildDriverDispatchMessage } from '@/lib/whatsapp'
import { getGoogleMapsDirectionsUrl, getWazeDirectionsUrl, formatDisplayAddress } from '@/lib/maps'
import type { OrderStatus } from '@/lib/roles'
import type { Order } from '../types'
import { useOrderList } from '../context'

const STATUSES: Array<[OrderStatus, string]> = [
  ['pending', 'Pending'],
  ['assigned', 'Assigned'],
  ['picked_up', 'Picked Up'],
  ['delivered', 'Delivered'],
  ['failed', 'Failed'],
  ['returned', 'Returned'],
  ['cancelled', 'Cancelled'],
]

export function OrderRow({ order }: { order: Order }) {
  const {
    canManage,
    drivers,
    handleDeleteOrders,
    handleInlineDriverChange,
    handleStatusSelect,
    handleToggleSelectOrder,
    isOwner,
    openEditOrderModal,
    rate,
    selectedOrderIds,
    setReceiptOrder,
    userRole,
  } = useOrderList()
  const r = Number(order.usd_to_lbp_rate) || rate
  const trackHref = `/track/${order.tracking_token || order.code}`

  const driverOptions = drivers.map(d => (
    <option key={d.id} value={d.id}>
      {d.name}
    </option>
  ))

  return (
    <tr>
      {canManage && (
        <td style={{ width: 36, textAlign: 'center' }}>
          <input
            type="checkbox"
            aria-label={`Select order ${order.code}`}
            checked={selectedOrderIds.includes(order.id)}
            onChange={() => handleToggleSelectOrder(order.id)}
          />
        </td>
      )}

      {/* Code, package flags, customer and address */}
      <td>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <Link
            href={trackHref}
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontWeight: 700, color: 'var(--brand)', textDecoration: 'none' }}
            title="Open live customer tracking page"
          >
            {order.code} ↗
          </Link>
          {order.service_type === 'replacement' && (
            <Tag tone="warning" title="Replacement / Exchange Item (Driver collects old item)">
              Swap
            </Tag>
          )}
          {order.service_type === 'pickup' && (
            <Tag tone="violet" title="Return Pickup from Customer">
              Pickup
            </Tag>
          )}
          {order.is_breakable && (
            <Tag tone="danger" title="Fragile / Breakable Content">
              Fragile
            </Tag>
          )}
          {order.weight_kg && order.weight_kg > 1 && (
            <Tag tone="neutral" title="Package Weight">
              {order.weight_kg}kg
            </Tag>
          )}
          {order.carrier_tracking_code && (
            <Tag tone="info" title={`External Carrier Tracking: ${order.carrier_name || 'Octopus'}`}>
              {order.carrier_tracking_code}
            </Tag>
          )}
          {order.shopify_order_number && (
            <Tag tone="success" title={`Shopify Order #${order.shopify_order_number}`}>
              <ShopifyIcon size={10} />
              <span>#{order.shopify_order_number}</span>
            </Tag>
          )}
        </div>
        {order.recipient_name && (
          <small>
            {order.recipient_name}
            {order.recipient_phone && (
              <>
                {' · '}
                <a
                  href={getWhatsAppUrl(order.recipient_phone, buildCustomerOrderMessage(order))}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="whatsapp-badge"
                  title="Chat on WhatsApp"
                >
                  <WhatsAppIcon size={12} />
                  <span>{order.recipient_phone}</span>
                </a>
              </>
            )}
          </small>
        )}
        {order.recipient_address && (
          <div style={{ marginTop: 3, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <TagLink
              tone="info"
              href={getGoogleMapsDirectionsUrl(order.recipient_address)}
              target="_blank"
              rel="noopener noreferrer"
              title="Open 1-Tap Google Maps Directions"
              style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: 600 }}
            >
              <GoogleMapsIcon size={11} />
              <span>{formatDisplayAddress(order.recipient_address)}</span>
            </TagLink>
            <TagLink
              tone="sky"
              href={getWazeDirectionsUrl(order.recipient_address)}
              target="_blank"
              rel="noopener noreferrer"
              title="Open Waze Turn-by-Turn Navigation"
            >
              Waze
            </TagLink>
          </div>
        )}
      </td>

      <td>{order.shop?.name || '—'}</td>

      {/* Courier, with quick reassignment */}
      <td>
        {order.driver ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Link
                href={`/drivers/${order.driver.id}`}
                style={{ fontWeight: 700, color: 'var(--brand)', textDecoration: 'none', fontSize: 13 }}
                title="View courier profile & performance"
              >
                {order.driver.name}
              </Link>
              {order.driver.phone && (
                <a
                  href={getWhatsAppUrl(order.driver.phone, buildDriverDispatchMessage(order))}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="whatsapp-icon-btn"
                  title={`Dispatch order to ${order.driver.name} on WhatsApp`}
                >
                  <WhatsAppIcon size={13} />
                </a>
              )}
            </div>
            {canManage && (
              <select
                className="ui-inline-select"
                value={order.driver.id}
                onChange={e => handleInlineDriverChange(order.id, e.target.value)}
                title="Change assigned courier"
                aria-label={`Courier for order ${order.code}`}
              >
                <option value="">-- Unassign Driver --</option>
                {driverOptions}
              </select>
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <Tag tone="warning" pill style={{ width: 'fit-content' }}>
              Needs Courier
            </Tag>
            {canManage && (
              <select
                className="ui-inline-select ui-inline-select--attention"
                value=""
                onChange={e => handleInlineDriverChange(order.id, e.target.value)}
                title="Assign driver now"
                aria-label={`Assign a courier to order ${order.code}`}
              >
                <option value="">Assign Driver…</option>
                {driverOptions}
              </select>
            )}
          </div>
        )}
      </td>

      <td>{order.area?.name || '—'}</td>

      <td>
        <strong>{formatUSD(Number(order.collection_usd))}</strong>
        <small>{formatLBP(usdToLbp(Number(order.collection_usd), r))}</small>
      </td>

      <td>{formatUSD(Number(order.delivery_fee_usd))}</td>

      {/* Status (asks for a courier first when one is needed) */}
      <td>
        <select
          value={order.status}
          onChange={e => handleStatusSelect(order, e.target.value as OrderStatus)}
          className={`badge badge-${order.status}`}
          style={{ border: 'none', cursor: 'pointer', outline: 'none' }}
          disabled={userRole === 'readonly'}
          aria-label={`Status of order ${order.code}`}
        >
          {STATUSES.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </td>

      <td>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {order.recipient_phone ? (
            <a
              href={getWhatsAppUrl(order.recipient_phone, buildCustomerOrderMessage(order))}
              target="_blank"
              rel="noopener noreferrer"
              className="whatsapp-btn"
              title="Send status update to Customer on WhatsApp"
            >
              <WhatsAppIcon size={13} color="#fff" />
              <span>Customer</span>
            </a>
          ) : (
            <span style={{ color: 'var(--muted)', fontSize: 11 }}>—</span>
          )}
          {order.driver?.phone && (
            <a
              href={getWhatsAppUrl(order.driver.phone, buildDriverDispatchMessage(order))}
              target="_blank"
              rel="noopener noreferrer"
              className="whatsapp-icon-btn"
              title="Dispatch job details to Driver on WhatsApp"
            >
              <WhatsAppIcon size={13} />
            </a>
          )}
        </div>
      </td>

      <td>
        <small suppressHydrationWarning>{new Date(order.created_at).toLocaleDateString('en-GB')}</small>
      </td>

      {/* Slip, edit, track, delete */}
      <td style={{ textAlign: 'right' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <button
            type="button"
            className="btn btn-ghost btn-compact"
            onClick={() => setReceiptOrder(order)}
            title="View / Print Barcode & QR Code Waybill Receipt"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
              <polyline points="6 9 6 2 18 2 18 9" />
              <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
              <rect x="6" y="14" width="12" height="8" />
            </svg>
            Slip
          </button>
          {canManage && (
            <button type="button" className="btn btn-secondary btn-compact" onClick={() => openEditOrderModal(order)} title="Edit order details and courier">
              Edit
            </button>
          )}
          <Link href={trackHref} target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-compact" title="Open public tracking">
            Track
          </Link>
          {isOwner && (
            <button
              type="button"
              className="btn btn-ghost btn-compact"
              onClick={() => handleDeleteOrders([order.id], '#' + order.code)}
              style={{ color: '#dc2626' }}
              title="Permanently delete record (Owner Only)"
              aria-label={`Delete order ${order.code}`}
            >
              <TrashIcon size={13} color="#dc2626" />
            </button>
          )}
        </div>
      </td>
    </tr>
  )
}
