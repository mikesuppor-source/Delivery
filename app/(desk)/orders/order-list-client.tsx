'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { Modal } from '@/components/modal'
import { formatUSD, formatLBP, usdToLbp, isDateInPreset, getDateRangeLabel, type DateRangePreset } from '@/lib/utils'
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
  notes?: string | null
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
  phone?: string | null
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
  const [datePreset, setDatePreset] = useState<DateRangePreset>('all')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'collection_high' | 'fee_high'>('newest')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  // New Order Form state
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

  // Driver Required Alert Modal (when changing status without a driver)
  const [isDriverRequiredModalOpen, setIsDriverRequiredModalOpen] = useState(false)
  const [driverRequiredOrder, setDriverRequiredOrder] = useState<Order | null>(null)
  const [pendingTargetStatus, setPendingTargetStatus] = useState<OrderStatus>('assigned')
  const [promptDriverId, setPromptDriverId] = useState(drivers[0]?.id || '')
  const [promptSubmitting, setPromptSubmitting] = useState(false)

  // Edit Order Modal state
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [editingOrder, setEditingOrder] = useState<Order | null>(null)
  const [editDriverId, setEditDriverId] = useState('')
  const [editStatus, setEditStatus] = useState<OrderStatus>('pending')
  const [editAreaId, setEditAreaId] = useState('')
  const [editCollectionUsd, setEditCollectionUsd] = useState('')
  const [editDeliveryFeeUsd, setEditDeliveryFeeUsd] = useState('')
  const [editDriverPayUsd, setEditDriverPayUsd] = useState('')
  const [editRecipientName, setEditRecipientName] = useState('')
  const [editRecipientPhone, setEditRecipientPhone] = useState('')
  const [editRecipientAddress, setEditRecipientAddress] = useState('')
  const [editNotes, setEditNotes] = useState('')
  const [editingSubmitting, setEditingSubmitting] = useState(false)
  const [editError, setEditError] = useState('')

  const canManage = userRole === 'owner' || userRole === 'manager'

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

  // Quick Inline Driver Change
  async function handleInlineDriverChange(orderId: string, newDriverId: string) {
    try {
      const res = await fetch('/api/orders', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId,
          workspaceId,
          driverId: newDriverId || null,
        }),
      })

      if (res.ok) {
        const selectedDriver = drivers.find(d => d.id === newDriverId) || null
        setOrders(prev =>
          prev.map(o => {
            if (o.id !== orderId) return o
            return {
              ...o,
              driver: selectedDriver,
              status: selectedDriver && o.status === 'pending' ? 'assigned' : o.status,
            }
          })
        )
      }
    } catch (err) {
      console.error('Failed to assign driver', err)
    }
  }

  // Status Change with Driver Check
  function handleStatusSelect(order: Order, newStatus: OrderStatus) {
    // If order has no driver and user tries to move to assigned, picked_up, or delivered
    if (!order.driver && ['assigned', 'picked_up', 'delivered'].includes(newStatus)) {
      setDriverRequiredOrder(order)
      setPendingTargetStatus(newStatus)
      setPromptDriverId(drivers[0]?.id || '')
      setIsDriverRequiredModalOpen(true)
      return
    }

    handleStatusChange(order.id, newStatus)
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

      const data = await res.json()
      if (res.ok && data.order) {
        setOrders(prev =>
          prev.map(o => (o.id === orderId ? { ...o, ...data.order } : o))
        )
      }
    } catch (err) {
      console.error('Failed to update status', err)
    }
  }

  // Confirm Driver Assignment from Warning Modal
  async function handleConfirmDriverAndStatus(e: React.FormEvent) {
    e.preventDefault()
    if (!driverRequiredOrder) return
    setPromptSubmitting(true)

    try {
      const res = await fetch('/api/orders', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: driverRequiredOrder.id,
          workspaceId,
          driverId: promptDriverId || null,
          status: pendingTargetStatus,
        }),
      })

      if (res.ok) {
        const assignedDriver = drivers.find(d => d.id === promptDriverId) || null
        setOrders(prev =>
          prev.map(o =>
            o.id === driverRequiredOrder.id
              ? { ...o, driver: assignedDriver, status: pendingTargetStatus }
              : o
          )
        )
        setIsDriverRequiredModalOpen(false)
        setDriverRequiredOrder(null)
      }
    } catch (err) {
      console.error('Failed to assign driver and status', err)
    } finally {
      setPromptSubmitting(false)
    }
  }

  // Open Full Edit Order Modal
  function openEditOrderModal(order: Order) {
    setEditingOrder(order)
    setEditDriverId(order.driver?.id || '')
    setEditStatus(order.status)
    setEditAreaId(order.area?.id || '')
    setEditCollectionUsd(String(order.collection_usd))
    setEditDeliveryFeeUsd(String(order.delivery_fee_usd))
    setEditDriverPayUsd(String(order.driver_pay_usd))
    setEditRecipientName(order.recipient_name || '')
    setEditRecipientPhone(order.recipient_phone || '')
    setEditRecipientAddress(order.recipient_address || '')
    setEditNotes(order.notes || '')
    setEditError('')
    setIsEditModalOpen(true)
  }

  // Save Full Order Edits
  async function handleSaveEditOrder(e: React.FormEvent) {
    e.preventDefault()
    if (!editingOrder) return
    setEditingSubmitting(true)
    setEditError('')

    try {
      const res = await fetch('/api/orders', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: editingOrder.id,
          workspaceId,
          driverId: editDriverId || null,
          status: editStatus,
          areaId: editAreaId || null,
          collectionUsd: Number(editCollectionUsd),
          deliveryFeeUsd: Number(editDeliveryFeeUsd),
          driverPayUsd: Number(editDriverPayUsd),
          recipientName: editRecipientName,
          recipientPhone: editRecipientPhone,
          recipientAddress: editRecipientAddress,
          notes: editNotes,
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to update order')

      const updatedDriver = drivers.find(d => d.id === editDriverId) || null
      const updatedArea = areas.find(a => a.id === editAreaId) || null

      setOrders(prev =>
        prev.map(o => {
          if (o.id !== editingOrder.id) return o
          return {
            ...o,
            ...data.order,
            driver: updatedDriver,
            area: updatedArea,
          }
        })
      )

      setIsEditModalOpen(false)
      setEditingOrder(null)
    } catch (err: unknown) {
      setEditError(err instanceof Error ? err.message : 'Error updating order')
    } finally {
      setEditingSubmitting(false)
    }
  }

  const filteredOrders = useMemo(() => {
    return orders
      .filter(o => {
        if (filter !== 'all' && o.status !== filter) return false
        if (!isDateInPreset(o.created_at, datePreset, customStart, customEnd)) return false
        return true
      })
      .sort((a, b) => {
        if (sortBy === 'newest') return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        if (sortBy === 'oldest') return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        if (sortBy === 'collection_high') return (Number(b.collection_usd) || 0) - (Number(a.collection_usd) || 0)
        if (sortBy === 'fee_high') return (Number(b.delivery_fee_usd) || 0) - (Number(a.delivery_fee_usd) || 0)
        return 0
      })
  }, [orders, filter, datePreset, customStart, customEnd, sortBy])

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
        {canManage && (
          <button className="btn btn-primary" onClick={() => setIsModalOpen(true)}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19"/>
              <line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            New order
          </button>
        )}
      </div>

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

      {/* ─── Date Range & Timeframe Filter Toolbar (This Month, Last Month, Last Year, etc.) ─── */}
      <div
        className="panel"
        style={{
          padding: '12px 18px',
          marginBottom: 20,
          background: 'var(--surface)',
          border: '1.5px solid var(--line)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          {/* Preset Buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', marginRight: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
              📅 Timeframe:
            </span>
            {[
              { id: 'all', label: 'All Time' },
              { id: 'today', label: 'Today' },
              { id: 'this_month', label: 'This Month' },
              { id: 'last_month', label: 'Last Month' },
              { id: 'this_year', label: 'This Year' },
              { id: 'last_year', label: 'Last Year' },
              { id: 'custom', label: 'Custom Range ⚙️' },
            ].map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setDatePreset(tab.id as DateRangePreset)}
                style={{
                  padding: '4px 11px',
                  borderRadius: 99,
                  fontSize: 12,
                  fontWeight: 600,
                  border: '1px solid',
                  cursor: 'pointer',
                  background: datePreset === tab.id ? 'var(--brand)' : 'var(--bg)',
                  color: datePreset === tab.id ? '#fff' : 'var(--muted)',
                  borderColor: datePreset === tab.id ? 'var(--brand)' : 'var(--line)',
                  transition: 'all .12s',
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Sort Selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>Sort by:</span>
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value as any)}
              style={{
                fontSize: 12,
                padding: '4px 10px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--line)',
                background: 'var(--bg)',
                color: 'var(--text)',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <option value="newest">🕒 Newest Orders First</option>
              <option value="oldest">⏳ Oldest Orders First</option>
              <option value="collection_high">💵 Highest COD Collection ($)</option>
              <option value="fee_high">⚡ Highest Delivery Fee ($)</option>
            </select>
          </div>
        </div>

        {/* Custom Date Pickers if 'custom' is active */}
        {datePreset === 'custom' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--line)', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
              <label style={{ fontWeight: 600, color: 'var(--muted)' }}>From:</label>
              <input
                type="date"
                value={customStart}
                onChange={e => setCustomStart(e.target.value)}
                style={{ fontSize: 12, padding: '3px 8px', borderRadius: 4, border: '1px solid var(--line)', background: 'var(--bg)' }}
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
              <label style={{ fontWeight: 600, color: 'var(--muted)' }}>To:</label>
              <input
                type="date"
                value={customEnd}
                onChange={e => setCustomEnd(e.target.value)}
                style={{ fontSize: 12, padding: '3px 8px', borderRadius: 4, border: '1px solid var(--line)', background: 'var(--bg)' }}
              />
            </div>
          </div>
        )}

        {/* Period Active Helper Banner */}
        {datePreset !== 'all' && (
          <div style={{ marginTop: 8, fontSize: 11.5, color: 'var(--brand)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>Filtering orders for:</span>
            <span style={{ background: 'var(--brand-light)', padding: '2px 8px', borderRadius: 4 }}>
              {getDateRangeLabel(datePreset, customStart, customEnd)}
            </span>
            <button
              type="button"
              onClick={() => setDatePreset('all')}
              style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: 11, textDecoration: 'underline' }}
            >
              Reset to All Time
            </button>
          </div>
        )}
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
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredOrders.map(order => {
                const r = Number(order.usd_to_lbp_rate) || rate
                return (
                  <tr key={order.id}>
                    <td>
                      <Link
                        href={`/track/${order.code}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ fontWeight: 700, color: 'var(--brand)', textDecoration: 'none' }}
                        title="Open live customer tracking page"
                      >
                        {order.code} ↗
                      </Link>
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

                    {/* Shop */}
                    <td>{order.shop?.name || '—'}</td>

                    {/* Driver Column with Inline Quick Assignment & Edit */}
                    <td>
                      {order.driver ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            <Link
                              href={`/drivers/${order.driver.id}`}
                              style={{
                                fontWeight: 700,
                                color: 'var(--brand)',
                                textDecoration: 'none',
                                fontSize: 13,
                              }}
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

                          {/* Quick Change Driver select */}
                          {canManage && (
                            <select
                              value={order.driver.id}
                              onChange={e => handleInlineDriverChange(order.id, e.target.value)}
                              style={{
                                fontSize: 11,
                                padding: '2px 6px',
                                borderRadius: 4,
                                border: '1px solid var(--line)',
                                background: 'var(--bg)',
                                color: 'var(--muted)',
                                cursor: 'pointer',
                                maxWidth: 140,
                              }}
                              title="Change assigned courier"
                            >
                              <option value="">-- Unassign Driver --</option>
                              {drivers.map(d => (
                                <option key={d.id} value={d.id}>
                                  {d.name}
                                </option>
                              ))}
                            </select>
                          )}
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                              fontSize: 11,
                              fontWeight: 700,
                              color: '#b45309',
                              background: 'rgba(245, 158, 11, 0.12)',
                              border: '1px solid rgba(245, 158, 11, 0.35)',
                              padding: '2px 8px',
                              borderRadius: 99,
                              width: 'fit-content',
                            }}
                          >
                            ⚠️ Needs Driver
                          </span>

                          {canManage && (
                            <select
                              value=""
                              onChange={e => handleInlineDriverChange(order.id, e.target.value)}
                              style={{
                                fontSize: 11,
                                padding: '3px 8px',
                                borderRadius: 4,
                                border: '1.5px solid #f59e0b',
                                background: 'rgba(245, 158, 11, 0.08)',
                                color: '#b45309',
                                fontWeight: 600,
                                cursor: 'pointer',
                                maxWidth: 140,
                              }}
                              title="Assign driver now"
                            >
                              <option value="">👉 Assign Driver…</option>
                              {drivers.map(d => (
                                <option key={d.id} value={d.id}>
                                  {d.name}
                                </option>
                              ))}
                            </select>
                          )}
                        </div>
                      )}
                    </td>

                    {/* Area */}
                    <td>{order.area?.name || '—'}</td>

                    {/* Collection */}
                    <td>
                      <strong>{formatUSD(Number(order.collection_usd))}</strong>
                      <small>{formatLBP(usdToLbp(Number(order.collection_usd), r))}</small>
                    </td>

                    {/* Fee */}
                    <td>{formatUSD(Number(order.delivery_fee_usd))}</td>

                    {/* Status with validation */}
                    <td>
                      <select
                        value={order.status}
                        onChange={e => handleStatusSelect(order, e.target.value as OrderStatus)}
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

                    {/* WhatsApp */}
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

                    {/* Date */}
                    <td>
                      <small>{new Date(order.created_at).toLocaleDateString('en-GB')}</small>
                    </td>

                    {/* Actions: Edit & Track */}
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        {canManage && (
                          <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={() => openEditOrderModal(order)}
                            style={{ fontSize: 11, padding: '4px 8px' }}
                            title="Edit order details and courier"
                          >
                            Edit
                          </button>
                        )}
                        <Link
                          href={`/track/${order.code}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn btn-ghost"
                          style={{ fontSize: 11, padding: '4px 8px' }}
                          title="Open public tracking"
                        >
                          Track
                        </Link>
                      </div>
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

      {/* ─── MODAL: WARNING DRIVER REQUIRED ─── */}
      <Modal
        isOpen={isDriverRequiredModalOpen}
        onClose={() => {
          setIsDriverRequiredModalOpen(false)
          setDriverRequiredOrder(null)
        }}
        title="⚠️ Driver Assignment Required"
      >
        <form onSubmit={handleConfirmDriverAndStatus}>
          <div style={{ padding: '4px 0 16px' }}>
            <p style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.5 }}>
              Order <strong>#{driverRequiredOrder?.code}</strong> cannot be marked as{' '}
              <span className={`badge badge-${pendingTargetStatus}`} style={{ fontSize: 11, padding: '2px 8px' }}>
                {pendingTargetStatus.toUpperCase()}
              </span>{' '}
              without assigning a courier.
            </p>
            <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6 }}>
              Assigning the courier ensures their delivery pay and COD collections are accurately credited to their profile.
            </p>
          </div>

          <div className="form-grid">
            <div className="field full">
              <label>Select Courier for this Delivery</label>
              <select
                value={promptDriverId}
                onChange={e => setPromptDriverId(e.target.value)}
                required
                autoFocus
              >
                <option value="">-- Choose Driver --</option>
                {drivers.map(d => (
                  <option key={d.id} value={d.id}>
                    {d.name} {d.phone ? `(${d.phone})` : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-actions" style={{ marginTop: 20 }}>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                setIsDriverRequiredModalOpen(false)
                setDriverRequiredOrder(null)
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={promptSubmitting || !promptDriverId}
            >
              {promptSubmitting ? 'Assigning…' : 'Assign Courier & Update Status'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ─── MODAL: EDIT ORDER & DRIVER ─── */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={() => {
          setIsEditModalOpen(false)
          setEditingOrder(null)
        }}
        title={`Edit Order #${editingOrder?.code || ''}`}
      >
        <form onSubmit={handleSaveEditOrder}>
          <div className="form-grid">
            {/* Assign Driver */}
            <div className="field full" style={{ background: 'var(--bg)', padding: 12, borderRadius: 'var(--radius-sm)', border: '1px solid var(--line)' }}>
              <label style={{ color: 'var(--brand)', fontWeight: 700 }}>Courier / Driver Assignment</label>
              <select
                value={editDriverId}
                onChange={e => setEditDriverId(e.target.value)}
              >
                <option value="">-- Unassigned (No Courier) --</option>
                {drivers.map(d => (
                  <option key={d.id} value={d.id}>
                    {d.name} {d.phone ? `(${d.phone})` : ''}
                  </option>
                ))}
              </select>
              <small style={{ color: 'var(--muted)', marginTop: 4, display: 'block' }}>
                Change or assign the driver. Updating will re-attribute COD collection and driver pay accordingly.
              </small>
            </div>

            {/* Order Status */}
            <div className="field">
              <label>Order Status</label>
              <select
                value={editStatus}
                onChange={e => {
                  const newSt = e.target.value as OrderStatus
                  setEditStatus(newSt)
                  if (newSt === 'returned') {
                    setEditDeliveryFeeUsd('2')
                    setEditCollectionUsd('0')
                    setEditDriverPayUsd('1')
                  }
                }}
              >
                <option value="pending">Pending</option>
                <option value="assigned">Assigned</option>
                <option value="picked_up">Picked Up</option>
                <option value="delivered">Delivered</option>
                <option value="failed">Failed</option>
                <option value="returned">Returned / Retail Refund ($2 Fee)</option>
              </select>
            </div>

            {editStatus === 'returned' && (
              <div
                style={{
                  gridColumn: '1 / -1',
                  padding: '8px 12px',
                  background: 'rgba(2, 132, 199, 0.08)',
                  border: '1px solid #bae6fd',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: 12,
                  color: '#0369a1',
                }}
              >
                🔄 <strong>Retail Refund / Return:</strong> Delivery fee is automatically set to <strong>$2.00</strong> (charged as a payable delivery service to merchant), customer collection is set to <strong>$0.00</strong>, and driver pay is set to <strong>$1.00</strong>.
              </div>
            )}

            {/* Area */}
            <div className="field">
              <label>Delivery Area</label>
              <select
                value={editAreaId}
                onChange={e => setEditAreaId(e.target.value)}
              >
                <option value="">-- Choose area --</option>
                {areas.map(a => (
                  <option key={a.id} value={a.id}>{a.name} (${a.fee_usd})</option>
                ))}
              </select>
            </div>

            {/* Financials */}
            <div className="field">
              <label>Cash Collection (USD)</label>
              <input
                type="number"
                step="0.5"
                min="0"
                value={editCollectionUsd}
                onChange={e => setEditCollectionUsd(e.target.value)}
                required
              />
            </div>

            <div className="field">
              <label>Delivery Fee (USD)</label>
              <input
                type="number"
                step="0.5"
                min="0"
                value={editDeliveryFeeUsd}
                onChange={e => setEditDeliveryFeeUsd(e.target.value)}
                required
              />
            </div>

            <div className="field">
              <label>Driver Pay (USD)</label>
              <input
                type="number"
                step="0.5"
                min="0"
                value={editDriverPayUsd}
                onChange={e => setEditDriverPayUsd(e.target.value)}
                required
              />
            </div>

            {/* Customer info */}
            <div className="field full">
              <label>Recipient / Customer Name</label>
              <input
                type="text"
                value={editRecipientName}
                onChange={e => setEditRecipientName(e.target.value)}
                required
              />
            </div>

            <div className="field">
              <label>Recipient Phone</label>
              <input
                type="tel"
                value={editRecipientPhone}
                onChange={e => setEditRecipientPhone(e.target.value)}
              />
            </div>

            <div className="field">
              <label>Delivery Address</label>
              <input
                type="text"
                value={editRecipientAddress}
                onChange={e => setEditRecipientAddress(e.target.value)}
                required
              />
            </div>

            <div className="field full">
              <label>Notes / Instructions</label>
              <input
                type="text"
                value={editNotes}
                onChange={e => setEditNotes(e.target.value)}
              />
            </div>
          </div>

          {editError && <p className="error-msg" style={{ marginTop: 12 }}>{editError}</p>}

          <div className="form-actions">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                setIsEditModalOpen(false)
                setEditingOrder(null)
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={editingSubmitting}
            >
              {editingSubmitting ? 'Saving changes…' : 'Save Changes'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ─── MODAL: NEW ORDER ─── */}
      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Create New Delivery Order">
        <form onSubmit={handleCreateOrder}>
          <div className="form-grid">
            {/* Quick Preset for Retail Return / Refund */}
            <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: 'var(--bg)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--line)' }}>
              <div>
                <strong style={{ fontSize: 12, display: 'block' }}>🔄 Retail Return / Refund Pickup?</strong>
                <small style={{ color: 'var(--muted)', fontSize: 11 }}>Automatically set fee to $2.00, customer COD to $0.00, and courier pay to $1.00</small>
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  setCollectionUsd('0')
                  setDeliveryFeeUsd('2')
                  setDriverPayUsd('1')
                  setNotes('Retail return pickup ($2 fee)')
                }}
                style={{ fontSize: 11, padding: '4px 10px', borderColor: 'var(--brand)', color: 'var(--brand)', fontWeight: 600 }}
              >
                Apply $2 Refund Preset
              </button>
            </div>

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
              <label>
                Assign Driver <span style={{ fontWeight: 400, color: 'var(--muted)', fontSize: 11 }}>(Optional)</span>
              </label>
              <select value={driverId} onChange={e => setDriverId(e.target.value)}>
                <option value="">⚠️ Unassigned (Dispatch later)</option>
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
