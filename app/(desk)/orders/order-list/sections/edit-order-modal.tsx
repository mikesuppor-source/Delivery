'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { Order } from '../types'
import { Modal } from '@/components/modal'
import { LocationHelper } from '@/components/location-helper'
import { formatDate } from '@/lib/utils'
import type { OrderStatus } from '@/lib/roles'
import { useOrderList } from '../context'

export function EditOrderModal({ editingOrder, onClose }: { editingOrder: Order; onClose: () => void }) {
  const { areas, canManage, drivers, handleDeleteOrders, setOrders, workspaceId } = useOrderList()
  const order = editingOrder
  const [editCode, setEditCode] = useState(order.code || '')
  const [editDriverId, setEditDriverId] = useState(order.driver?.id || '')
  const [editStatus, setEditStatus] = useState<OrderStatus>(order.status)
  const [editAreaId, setEditAreaId] = useState(order.area?.id || '')
  const [editCollectionUsd, setEditCollectionUsd] = useState(String(order.collection_usd))
  const [editDeliveryFeeUsd, setEditDeliveryFeeUsd] = useState(String(order.delivery_fee_usd))
  const [editDriverPayUsd, setEditDriverPayUsd] = useState(String(order.driver_pay_usd))
  const [editRecipientName, setEditRecipientName] = useState(order.recipient_name || '')
  const [editRecipientPhone, setEditRecipientPhone] = useState(order.recipient_phone || '')
  const [editRecipientAddress, setEditRecipientAddress] = useState(order.recipient_address || '')
  const [editNotes, setEditNotes] = useState(order.notes || '')
  const [editServiceType, setEditServiceType] = useState<'delivery' | 'replacement' | 'pickup'>(order.service_type || 'delivery')
  const [editWeightKg, setEditWeightKg] = useState(String(order.weight_kg || '1'))
  const [editIsBreakable, setEditIsBreakable] = useState(Boolean(order.is_breakable))
  const [editCarrierTrackingCode, setEditCarrierTrackingCode] = useState(order.carrier_tracking_code || '')
  const [editDestinationTown] = useState(order.destination_town || '')
  const [editingSubmitting, setEditingSubmitting] = useState(false)
  const [editError, setEditError] = useState('')
  const [orderEvents, setOrderEvents] = useState<Array<{ id: string; old_status?: string | null; new_status: string; created_at: string }>>([])

  // Status history for the timeline at the bottom of the dialog
  useEffect(() => {
    fetch(`/api/orders/${order.id}/events`)
      .then(r => r.json())
      .then(d => {
        if (d && Array.isArray(d.events)) setOrderEvents(d.events)
      })
      .catch(() => {})
  }, [order.id])

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
          code: editCode.trim() || undefined,
          driverId: editDriverId || null,
          status: editStatus,
          areaId: editAreaId || null,
          collectionUsd: Number(editCollectionUsd),
          deliveryFeeUsd: Number(editDeliveryFeeUsd),
          driverPayUsd: Number(editDriverPayUsd),
          recipientName: editRecipientName,
          recipientPhone: editRecipientPhone,
          recipientAddress: editRecipientAddress,
          serviceType: editServiceType,
          weightKg: Number(editWeightKg) || 1.0,
          isBreakable: editIsBreakable,
          carrierTrackingCode: editCarrierTrackingCode.trim() || undefined,
          destinationTown: editDestinationTown.trim() || undefined,
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

      onClose()
    } catch (err: unknown) {
      setEditError(err instanceof Error ? err.message : 'Error updating order')
    } finally {
      setEditingSubmitting(false)
    }
  }

  return (
    <>
      {/* ─── MODAL: EDIT ORDER & DRIVER ─── */}
      <Modal
        isOpen
        onClose={() => {
          onClose()
        }}
        title={`Edit Order #${editingOrder?.code || ''}`}
      >
        <form onSubmit={handleSaveEditOrder}>
          <div className="form-grid">
            {editingOrder?.is_held && (
              <div
                className="field full"
                style={{
                  background: 'var(--ui-warning-soft, #fef3c7)',
                  border: '1.5px solid var(--ui-warning, #f59e0b)',
                  borderRadius: 'var(--radius-sm)',
                  padding: 12,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div>
                  <div style={{ fontWeight: 800, color: 'var(--ui-warning-text, #92400e)', fontSize: 13 }}>
                    📦 Currently Held in Warehouse Hub
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--ui-warning-text, #92400e)', marginTop: 2 }}>
                    This parcel cannot be assigned to couriers until released.
                  </div>
                </div>
                <Link
                  href="/warehouse"
                  className="btn btn-sm btn-primary"
                  style={{ textDecoration: 'none' }}
                >
                  Manage in Warehouse
                </Link>
              </div>
            )}
            {/* Custom Tracking Code / Waybill # */}
            <div className="field full" style={{ background: 'var(--bg)', padding: 12, borderRadius: 'var(--radius-sm)', border: '1.5px solid var(--line)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                <label style={{ margin: 0, color: 'var(--brand)', fontWeight: 700, fontSize: 13 }}>
                  Tracking Code / Waybill #
                </label>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => {
                      const prefix = editingOrder?.shop?.name ? editingOrder.shop.name.replace(/[^a-zA-Z0-9]/g, '').slice(0, 4).toUpperCase() : 'ORD'
                      const randomNum = Math.floor(100 + Math.random() * 900)
                      setEditCode(`${prefix}-${randomNum}`)
                    }}
                    style={{ fontSize: 11, padding: '2px 8px' }}
                    title="Generate code with shop prefix"
                  >
                    Shop Prefix
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => {
                      const randomHex = Math.random().toString(16).substring(2, 10).toUpperCase()
                      setEditCode(`CD-${randomHex}`)
                    }}
                    style={{ fontSize: 11, padding: '2px 8px' }}
                    title="Generate standard Cedar CD-XXXX code"
                  >
                    Auto CD-XXXX
                  </button>
                </div>
              </div>
              <input
                type="text"
                value={editCode}
                onChange={e => setEditCode(e.target.value.toUpperCase())}
                placeholder="e.g. ZARA-101, CD-A1B2C3D4"
                required
                style={{ fontFamily: 'monospace', fontWeight: 700, letterSpacing: '0.5px' }}
              />
              <small style={{ color: 'var(--muted)', fontSize: 11, display: 'block', marginTop: 4 }}>
                The private customer tracking link is available after saving.
              </small>
            </div>

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
                  } else if (newSt === 'cancelled') {
                    setEditDeliveryFeeUsd('0')
                    setEditCollectionUsd('0')
                    setEditDriverPayUsd('0')
                  }
                }}
              >
                <option value="pending">Pending</option>
                <option value="assigned">Assigned</option>
                <option value="picked_up">Picked Up</option>
                <option value="delivered">Delivered</option>
                <option value="failed">Failed</option>
                <option value="returned">Returned / Retail Refund ($2 Fee)</option>
                <option value="cancelled">Cancelled (Void COD & Fees)</option>
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
                <strong>Retail Refund / Return:</strong> Delivery fee is automatically set to <strong>$2.00</strong> (charged as a payable delivery service to merchant), customer collection is set to <strong>$0.00</strong>, and driver pay is set to <strong>$1.00</strong>.
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
                step="0.01"
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
                step="0.01"
                min="0"
                value={editDeliveryFeeUsd}
                onChange={e => setEditDeliveryFeeUsd(e.target.value)}
                required
              />
            </div>

            <div className="field">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4, flexWrap: 'wrap', gap: 4 }}>
                <label style={{ margin: 0 }}>Driver Pay (USD)</label>
                <div style={{ display: 'flex', gap: 4 }}>
                  {['1.00', '1.50', '1.60', '2.00', '2.50'].map(val => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setEditDriverPayUsd(val)}
                      style={{
                        fontSize: 10.5,
                        padding: '1px 5px',
                        border: '1px solid',
                        borderColor: Number(editDriverPayUsd) === Number(val) ? 'var(--brand)' : 'var(--line)',
                        background: Number(editDriverPayUsd) === Number(val) ? 'var(--brand-light)' : 'var(--bg)',
                        color: Number(editDriverPayUsd) === Number(val) ? 'var(--brand)' : 'var(--muted)',
                        fontWeight: Number(editDriverPayUsd) === Number(val) ? 700 : 500,
                        borderRadius: 4,
                        cursor: 'pointer',
                      }}
                      title={`Set courier commission to $${val}`}
                    >
                      ${val}
                    </button>
                  ))}
                </div>
              </div>
              <input
                type="number"
                step="0.01"
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

            <div className="field full">
              <LocationHelper
                id="edit-recipient-address"
                address={editRecipientAddress}
                onAddressChange={setEditRecipientAddress}
                label="Delivery Address / Google Maps Pin"
                placeholder="e.g. Achrafieh, Sassine Square, Bldg 12 or paste Google Maps link"
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

            {/* Service Type & Package Attributes */}
            <div className="field">
              <label>Service Type</label>
              <select
                value={editServiceType}
                onChange={e => setEditServiceType(e.target.value as 'delivery' | 'replacement' | 'pickup')}
              >
                <option value="delivery">Standard Delivery</option>
                <option value="replacement">Replacement / Exchange (تبديل)</option>
                <option value="pickup">Return Pickup (استلام مرتجع)</option>
              </select>
            </div>

            <div className="field">
              <label>Weight (KG)</label>
              <input
                type="number"
                step="0.1"
                min="0.1"
                value={editWeightKg}
                onChange={e => setEditWeightKg(e.target.value)}
              />
            </div>

            <div className="field" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', margin: 0 }}>
                <input
                  type="checkbox"
                  checked={editIsBreakable}
                  onChange={e => setEditIsBreakable(e.target.checked)}
                  style={{ width: 18, height: 18, accentColor: '#dc2626' }}
                />
                <span style={{ fontWeight: 700, color: editIsBreakable ? '#dc2626' : 'var(--text)' }}>
                  Fragile / Breakable (قابل للكسر)
                </span>
              </label>
            </div>

            <div className="field">
              <label>Carrier Tracking Code (3PL / Octopus Code)</label>
              <input
                type="text"
                placeholder="e.g. 220222385920"
                value={editCarrierTrackingCode}
                onChange={e => setEditCarrierTrackingCode(e.target.value)}
              />
            </div>

            {orderEvents.length > 0 && (
              <div className="field full" style={{ marginTop: 8 }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>
                  Order Status Audit Timeline
                </label>
                <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 8, padding: '10px 14px', border: '1px solid var(--line)' }}>
                  {orderEvents.map((evt, idx) => (
                    <div key={evt.id || idx} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, padding: '4px 0', borderBottom: idx < orderEvents.length - 1 ? '1px dashed var(--line)' : 'none' }}>
                      <span style={{ color: 'var(--brand)', fontWeight: 700 }}>•</span>
                      <span style={{ color: 'var(--text)' }}>
                        {evt.old_status ? `${evt.old_status} -> ${evt.new_status}` : `Order created as ${evt.new_status}`}
                      </span>
                      <small style={{ color: 'var(--muted)', marginLeft: 'auto' }}>
                        {formatDate(evt.created_at)}
                      </small>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {editError && <p className="error-msg" style={{ marginTop: 12 }}>{editError}</p>}

          <div className="form-actions" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
            {canManage && editingOrder && editingOrder.status === 'pending' && (
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => handleDeleteOrders([editingOrder.id], '#' + editingOrder.code)}
                style={{
                  color: '#dc2626',
                  fontSize: 12,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '6px 10px',
                }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
                Cancel Order
              </button>
            )}
            <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  onClose()
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
          </div>
        </form>
      </Modal>
    </>
  )
}
