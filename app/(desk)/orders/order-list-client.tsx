'use client'

import { useState } from 'react'
import { Modal } from '@/components/modal'
import { formatUSD, formatLBP, usdToLbp } from '@/lib/utils'
import type { UserRole, OrderStatus } from '@/lib/roles'
import { WhatsAppIcon } from '@/components/whatsapp-icon'
import { getWhatsAppUrl, buildCustomerOrderMessage, buildDriverDispatchMessage } from '@/lib/whatsapp'

interface Order {
  id: string
  code: string
  status: OrderStatus
  collection_usd: number
  delivery_fee_usd: number
  driver_pay_usd: number
  shop_balance_usd: number
  usd_to_lbp_rate: number
  recipient_name: string | null
  recipient_phone: string | null
  recipient_address: string | null
  created_at: string
  shop: { id: string; name: string; phone?: string | null } | null
  driver: { id: string; name: string; phone?: string | null } | null
  area: { id: string; name: string } | null
}

interface Shop {
  id: string
  name: string
}

interface Driver {
  id: string
  name: string
}

interface DeliveryArea {
  id: string
  name: string
  fee_usd: number
}

interface OrderListClientProps {
  orders: Order[]
  shops: Shop[]
  drivers: Driver[]
  areas: DeliveryArea[]
  workspaceId: string
  userRole: UserRole
  rate: number
}

export function OrderListClient({
  orders: initialOrders,
  shops,
  drivers,
  areas,
  workspaceId,
  userRole,
  rate,
}: OrderListClientProps) {
  const [orders, setOrders] = useState<Order[]>(initialOrders)
  const [filter, setFilter] = useState<string>('all')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  // Form state
  const [shopId, setShopId] = useState(shops[0]?.id || '')
  const [driverId, setDriverId] = useState('')
  const [areaId, setAreaId] = useState(areas[0]?.id || '')
  const [collectionUsd, setCollectionUsd] = useState('25')
  const [deliveryFeeUsd, setDeliveryFeeUsd] = useState(String(areas[0]?.fee_usd || '3'))
  const [driverPayUsd, setDriverPayUsd] = useState('2')
  const [recipientName, setRecipientName] = useState('')
  const [recipientPhone, setRecipientPhone] = useState('')
  const [recipientAddress, setRecipientAddress] = useState('')
  const [notes, setNotes] = useState('')

  const canCreate = userRole === 'owner' || userRole === 'manager'

  // When area changes, update suggested delivery fee
  function handleAreaChange(newAreaId: string) {
    setAreaId(newAreaId)
    const sel = areas.find(a => a.id === newAreaId)
    if (sel) {
      setDeliveryFeeUsd(String(sel.fee_usd))
      setDriverPayUsd(String(Math.max(1, Number(sel.fee_usd) - 1)))
    }
  }

  async function handleCreateOrder(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError('')

    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId,
          shopId: shopId || null,
          driverId: driverId || null,
          areaId: areaId || null,
          collectionUsd: Number(collectionUsd),
          deliveryFeeUsd: Number(deliveryFeeUsd),
          driverPayUsd: Number(driverPayUsd),
          recipientName,
          recipientPhone,
          recipientAddress,
          notes,
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to create order')

      // Append populated relationships for client display
      const newOrderWithRels: Order = {
        ...data.order,
        shop: shops.find(s => s.id === shopId) || null,
        driver: drivers.find(d => d.id === driverId) || null,
        area: areas.find(a => a.id === areaId) || null,
      }

      setOrders(prev => [newOrderWithRels, ...prev])
      setIsModalOpen(false)
      // Reset form
      setRecipientName('')
      setRecipientPhone('')
      setRecipientAddress('')
      setNotes('')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error creating order')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleStatusChange(orderId: string, newStatus: OrderStatus) {
    try {
      const res = await fetch('/api/orders', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId,
          workspaceId,
          status: newStatus,
        }),
      })

      if (res.ok) {
        setOrders(prev =>
          prev.map(o => (o.id === orderId ? { ...o, status: newStatus } : o))
        )
      }
    } catch (err) {
      console.error('Failed to update status', err)
    }
  }

  const filteredOrders = orders.filter(o => {
    if (filter === 'all') return true
    return o.status === filter
  })

  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Orders</h1>
          <p>{orders.length} orders total · {filteredOrders.length} displayed</p>
        </div>
        {canCreate && (
          <button className="btn btn-primary" onClick={() => setIsModalOpen(true)}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19"/>
              <line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            New order
          </button>
        )}
      </div>

      <div className="toolbar">
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
          Pending
        </button>
        <button
          className={`tab-btn ${filter === 'assigned' ? 'active' : ''}`}
          onClick={() => setFilter('assigned')}
        >
          Assigned
        </button>
        <button
          className={`tab-btn ${filter === 'delivered' ? 'active' : ''}`}
          onClick={() => setFilter('delivered')}
        >
          Delivered
        </button>
        <button
          className={`tab-btn ${filter === 'failed' ? 'active' : ''}`}
          onClick={() => setFilter('failed')}
        >
          Failed / Returned
        </button>
      </div>

      <div className="panel">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Code & Customer</th>
                <th>Shop</th>
                <th>Driver</th>
                <th>Area</th>
                <th>Collection</th>
                <th>Fee</th>
                <th>Status</th>
                <th>WhatsApp</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {filteredOrders.map(order => {
                const r = Number(order.usd_to_lbp_rate) || rate
                return (
                  <tr key={order.id}>
                    <td>
                      <strong>{order.code}</strong>
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
                      {order.recipient_address && <small style={{ color: 'var(--muted)' }}>{order.recipient_address}</small>}
                    </td>
                    <td>{order.shop?.name || '—'}</td>
                    <td>
                      {order.driver ? (
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          <span>{order.driver.name}</span>
                          {order.driver.phone && (
                            <a
                              href={getWhatsAppUrl(order.driver.phone, buildDriverDispatchMessage(order))}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="whatsapp-icon-btn"
                              title={`Dispatch to ${order.driver.name} on WhatsApp`}
                            >
                              <WhatsAppIcon size={13} />
                            </a>
                          )}
                        </div>
                      ) : (
                        <span style={{ color: 'var(--muted)' }}>Unassigned</span>
                      )}
                    </td>
                    <td>{order.area?.name || '—'}</td>
                    <td>
                      <strong>{formatUSD(Number(order.collection_usd))}</strong>
                      <small>{formatLBP(usdToLbp(Number(order.collection_usd), r))}</small>
                    </td>
                    <td>{formatUSD(Number(order.delivery_fee_usd))}</td>
                    <td>
                      <select
                        value={order.status}
                        onChange={e => handleStatusChange(order.id, e.target.value as OrderStatus)}
                        className={`badge badge-${order.status}`}
                        style={{ border: 'none', cursor: 'pointer', outline: 'none' }}
                        disabled={userRole === 'readonly'}
                      >
                        <option value="pending">Pending</option>
                        <option value="assigned">Assigned</option>
                        <option value="picked_up">Picked Up</option>
                        <option value="delivered">Delivered</option>
                        <option value="failed">Failed</option>
                        <option value="returned">Returned</option>
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
                      <small>{new Date(order.created_at).toLocaleDateString('en-GB')}</small>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          {filteredOrders.length === 0 && (
            <div className="empty">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
              </svg>
              <h3>No orders in this view</h3>
              <p>Create a new order or select a different filter.</p>
            </div>
          )}
        </div>
      </div>

      {/* New Order Modal */}
      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Create New Delivery Order">
        <form onSubmit={handleCreateOrder}>
          <div className="form-grid">
            <div className="field">
              <label>Select Shop</label>
              <select value={shopId} onChange={e => setShopId(e.target.value)} required>
                <option value="">-- Choose shop --</option>
                {shops.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>

            <div className="field">
              <label>Assign Driver</label>
              <select value={driverId} onChange={e => setDriverId(e.target.value)}>
                <option value="">-- Unassigned (Assign later) --</option>
                {drivers.map(d => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>

            <div className="field">
              <label>Delivery Area</label>
              <select value={areaId} onChange={e => handleAreaChange(e.target.value)} required>
                <option value="">-- Choose area --</option>
                {areas.map(a => (
                  <option key={a.id} value={a.id}>{a.name} (${a.fee_usd})</option>
                ))}
              </select>
            </div>

            <div className="field">
              <label>Cash Collection (USD)</label>
              <input
                type="number"
                step="0.5"
                min="0"
                value={collectionUsd}
                onChange={e => setCollectionUsd(e.target.value)}
                required
              />
            </div>

            <div className="field">
              <label>Delivery Fee (USD)</label>
              <input
                type="number"
                step="0.5"
                min="0"
                value={deliveryFeeUsd}
                onChange={e => setDeliveryFeeUsd(e.target.value)}
                required
              />
            </div>

            <div className="field">
              <label>Driver Pay (USD)</label>
              <input
                type="number"
                step="0.5"
                min="0"
                value={driverPayUsd}
                onChange={e => setDriverPayUsd(e.target.value)}
                required
              />
            </div>

            <div className="field full">
              <label>Customer / Recipient Name</label>
              <input
                type="text"
                placeholder="e.g. Maya Haddad"
                value={recipientName}
                onChange={e => setRecipientName(e.target.value)}
                required
              />
            </div>

            <div className="field">
              <label>Phone Number</label>
              <input
                type="tel"
                placeholder="e.g. +961 70 123456"
                value={recipientPhone}
                onChange={e => setRecipientPhone(e.target.value)}
              />
            </div>

            <div className="field">
              <label>Delivery Address</label>
              <input
                type="text"
                placeholder="Street, Building, Floor"
                value={recipientAddress}
                onChange={e => setRecipientAddress(e.target.value)}
                required
              />
            </div>

            <div className="field full">
              <label>Order Notes / Package details</label>
              <input
                type="text"
                placeholder="Fragile, call on arrival, etc."
                value={notes}
                onChange={e => setNotes(e.target.value)}
              />
            </div>
          </div>

          {error && <p className="error-msg" style={{ marginTop: 12 }}>{error}</p>}

          <div className="form-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setIsModalOpen(false)}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? 'Creating order…' : 'Create Order'}
            </button>
          </div>
        </form>
      </Modal>
    </>
  )
}
