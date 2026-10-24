'use client'

import React, { useState, useMemo } from 'react'
import Link from 'next/link'
import {
  formatUSD,
  formatLBP,
  usdToLbp,
  formatDate,
  ORDER_STATUS_LABELS,
} from '@/lib/utils'
import { getGoogleMapsDirectionsUrl, getWazeDirectionsUrl, parseLocation, formatDisplayAddress } from '@/lib/maps'
import { WhatsAppIcon } from '@/components/whatsapp-icon'
import { GoogleMapsIcon } from '@/components/google-maps-icon'
import {
  TruckIcon,
  MapPinIcon,
  PackageIcon,
  CheckIcon,
  RefreshIcon,
  SearchIcon,
  PhoneIcon,
} from '@/components/icons'
import { DeliveryPodModal } from './delivery-pod-modal'
import { DeliveryFailModal } from './delivery-fail-modal'
import { DeliveryPodViewModal } from './delivery-pod-view-modal'

export interface DriverRunSheetOrder {
  id: string
  code: string
  status: 'pending' | 'assigned' | 'picked_up' | 'delivered' | 'failed' | 'returned'
  collection_usd: number
  delivery_fee_usd: number
  driver_pay_usd: number
  shop_balance_usd: number
  usd_to_lbp_rate: number
  created_at: string
  delivered_at?: string | null
  notes?: string | null
  recipient_name: string | null
  recipient_phone: string | null
  recipient_address: string | null
  shop?: { id: string; name: string; phone?: string | null } | null
  area?: { id: string; name: string } | null
  pod_signature?: string | null
  pod_photo?: string | null
  pod_collected_lbp?: number | null
}

export interface DriverInfo {
  id: string
  name: string
  phone?: string | null
  cash_held_usd?: number
  pay_owed_usd?: number
  active: boolean
}

interface DriverRunSheetClientProps {
  driver: DriverInfo
  initialOrders: DriverRunSheetOrder[]
  rate: number
  workspaceName: string
}

export function DriverRunSheetClient({
  driver,
  initialOrders,
  rate,
  workspaceName,
}: DriverRunSheetClientProps) {
  const [orders, setOrders] = useState<DriverRunSheetOrder[]>(initialOrders)
  const [filterTab, setFilterTab] = useState<'to_deliver' | 'all' | 'delivered' | 'failed'>('to_deliver')
  const [search, setSearch] = useState('')
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  // POD & Failure modals
  const [podModalOrder, setPodModalOrder] = useState<DriverRunSheetOrder | null>(null)
  const [failModalOrder, setFailModalOrder] = useState<DriverRunSheetOrder | null>(null)
  const [viewPodOrder, setViewPodOrder] = useState<DriverRunSheetOrder | null>(null)

  function showNotification(type: 'success' | 'error', message: string) {
    setNotification({ type, message })
    setTimeout(() => setNotification(null), 4000)
  }

  // Filter & Search Logic
  const filteredOrders = useMemo(() => {
    return orders.filter(order => {
      // Tab filter
      if (filterTab === 'to_deliver') {
        if (order.status !== 'assigned' && order.status !== 'picked_up') return false
      } else if (filterTab === 'delivered') {
        if (order.status !== 'delivered') return false
      } else if (filterTab === 'failed') {
        if (order.status !== 'failed' && order.status !== 'returned') return false
      }

      // Search filter
      if (search.trim()) {
        const q = search.toLowerCase()
        const matchCode = order.code.toLowerCase().includes(q)
        const matchName = order.recipient_name?.toLowerCase().includes(q)
        const matchPhone = order.recipient_phone?.toLowerCase().includes(q)
        const matchAddr = order.recipient_address?.toLowerCase().includes(q)
        const matchArea = order.area?.name.toLowerCase().includes(q)
        const matchShop = order.shop?.name.toLowerCase().includes(q)
        if (!matchCode && !matchName && !matchPhone && !matchAddr && !matchArea && !matchShop) {
          return false
        }
      }

      return true
    })
  }, [orders, filterTab, search])

  // Key KPI metrics
  const stats = useMemo(() => {
    const total = orders.length
    const toDeliver = orders.filter(o => o.status === 'assigned' || o.status === 'picked_up').length
    const delivered = orders.filter(o => o.status === 'delivered').length
    const failed = orders.filter(o => o.status === 'failed' || o.status === 'returned').length

    const cashCollectedUsd = orders
      .filter(o => o.status === 'delivered')
      .reduce((sum, o) => sum + Number(o.collection_usd || 0), 0)

    const pendingCashUsd = orders
      .filter(o => o.status === 'assigned' || o.status === 'picked_up')
      .reduce((sum, o) => sum + Number(o.collection_usd || 0), 0)

    const driverEarnedUsd = orders
      .filter(o => o.status === 'delivered')
      .reduce((sum, o) => sum + Number(o.driver_pay_usd || 0), 0)

    return {
      total,
      toDeliver,
      delivered,
      failed,
      cashCollectedUsd,
      pendingCashUsd,
      driverEarnedUsd,
    }
  }, [orders])

  // Handle status transitions
  async function handleUpdateStatus(
    orderId: string,
    newStatus: DriverRunSheetOrder['status'],
    extraData?: {
      notes?: string
      podSignature?: string | null
      podPhoto?: string | null
      podCollectedLbp?: number | null
      failureReason?: string
    }
  ) {
    setUpdatingId(orderId)
    try {
      const res = await fetch('/api/driver/orders', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId,
          driverId: driver.id,
          status: newStatus,
          ...extraData,
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Failed to update order status')
      }

      // Optimistically update order in state
      setOrders(prev =>
        prev.map(o => (o.id === orderId ? { ...o, ...data.order, status: newStatus } : o))
      )

      showNotification('success', `Order #${data.order.code} updated to ${ORDER_STATUS_LABELS[newStatus] || newStatus}!`)
    } catch (err: unknown) {
      showNotification('error', err instanceof Error ? err.message : 'Error updating status')
      throw err
    } finally {
      setUpdatingId(null)
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#0f172a',
        color: '#f8fafc',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        paddingBottom: 60,
      }}
    >
      {/* ─── TOP STICKY HEADER ─── */}
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 50,
          background: 'rgba(15, 23, 42, 0.95)',
          backdropFilter: 'blur(12px)',
          borderBottom: '1px solid #1e293b',
          padding: '12px 16px',
        }}
      >
        <div
          style={{
            maxWidth: 640,
            margin: '0 auto',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: 10,
                background: 'linear-gradient(135deg, #10b981 0%, #047857 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)',
              }}
            >
              <TruckIcon size={20} color="#ffffff" />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 15, fontWeight: 800, color: '#ffffff' }}>
                  {driver.name}
                </span>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    background: '#064e3b',
                    color: '#6ee7b7',
                    padding: '1px 6px',
                    borderRadius: 99,
                    border: '1px solid #059669',
                  }}
                >
                  Courier Active
                </span>
              </div>
              <div style={{ fontSize: 11, color: '#94a3b8' }}>
                {workspaceName} · {new Date().toLocaleDateString('en-GB', { weekday: 'short', month: 'short', day: 'numeric' })}
              </div>
            </div>
          </div>

          {/* Quick Help Link with Dispatch */}
          <a
            href={`https://wa.me/96170000000?text=${encodeURIComponent(
              `Hello Dispatch, this is courier ${driver.name}. I need assistance on my run sheet.`
            )}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              background: '#1e293b',
              color: '#38bdf8',
              border: '1px solid #334155',
              padding: '6px 10px',
              borderRadius: 8,
              fontSize: 11.5,
              fontWeight: 700,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              textDecoration: 'none',
            }}
          >
            <WhatsAppIcon size={13} color="#25D366" />
            <span>Dispatch</span>
          </a>
        </div>
      </header>

      {/* Notification Toast */}
      {notification && (
        <div
          style={{
            position: 'fixed',
            top: 70,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 100,
            background: notification.type === 'success' ? '#065f46' : '#991b1b',
            color: '#ffffff',
            padding: '10px 18px',
            borderRadius: 8,
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
            fontSize: 13,
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            maxWidth: '90%',
          }}
        >
          <span>{notification.type === 'success' ? '✓' : '⚠'}</span>
          <span>{notification.message}</span>
        </div>
      )}

      {/* ─── MAIN CONTENT CONTAINER (MOBILE OPTIMIZED) ─── */}
      <main style={{ maxWidth: 640, margin: '0 auto', padding: '16px' }}>
        {/* ─── METRIC CARDS ─── */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 10,
            marginBottom: 16,
          }}
        >
          {/* Card 1: Stops Pending */}
          <div
            style={{
              background: '#1e293b',
              border: '1px solid #334155',
              borderRadius: 12,
              padding: '12px 14px',
            }}
          >
            <span style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
              Pending Deliveries
            </span>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 4 }}>
              <span style={{ fontSize: 26, fontWeight: 900, color: '#f8fafc' }}>
                {stats.toDeliver}
              </span>
              <span style={{ fontSize: 12, color: '#64748b' }}>
                / {stats.total} Total
              </span>
            </div>
            <div style={{ fontSize: 11, color: '#38bdf8', marginTop: 2, fontWeight: 600 }}>
              {formatUSD(stats.pendingCashUsd)} COD to collect
            </div>
          </div>

          {/* Card 2: Cash Collected in Hand */}
          <div
            style={{
              background: 'linear-gradient(135deg, rgba(6, 78, 59, 0.4) 0%, rgba(15, 23, 42, 0.6) 100%)',
              border: '1.5px solid #059669',
              borderRadius: 12,
              padding: '12px 14px',
            }}
          >
            <span style={{ fontSize: 11, fontWeight: 700, color: '#6ee7b7', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
              Collected in Hand (COD)
            </span>
            <div style={{ fontSize: 24, fontWeight: 900, color: '#10b981', marginTop: 4 }}>
              {formatUSD(stats.cashCollectedUsd)}
            </div>
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 1 }}>
              ≈ {formatLBP(usdToLbp(stats.cashCollectedUsd, rate))}
            </div>
          </div>
        </div>

        {/* ─── SEARCH & FILTER TABS ─── */}
        <div style={{ marginBottom: 14 }}>
          {/* Search Box */}
          <div
            style={{
              position: 'relative',
              marginBottom: 10,
            }}
          >
            <input
              type="text"
              placeholder="Search by customer, phone, code, area…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{
                width: '100%',
                background: '#1e293b',
                border: '1.5px solid #334155',
                color: '#f8fafc',
                padding: '10px 14px 10px 36px',
                borderRadius: 10,
                fontSize: 13,
                outline: 'none',
              }}
            />
            <div style={{ position: 'absolute', left: 12, top: 12, color: '#94a3b8' }}>
              <SearchIcon size={14} />
            </div>
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                style={{
                  position: 'absolute',
                  right: 12,
                  top: 9,
                  background: 'none',
                  border: 'none',
                  color: '#94a3b8',
                  fontSize: 14,
                  cursor: 'pointer',
                }}
              >
                ✕
              </button>
            )}
          </div>

          {/* Quick Filter Tabs */}
          <div
            style={{
              display: 'flex',
              gap: 6,
              overflowX: 'auto',
              paddingBottom: 4,
            }}
          >
            <button
              type="button"
              onClick={() => setFilterTab('to_deliver')}
              style={{
                background: filterTab === 'to_deliver' ? '#2563eb' : '#1e293b',
                color: filterTab === 'to_deliver' ? '#ffffff' : '#94a3b8',
                border: '1px solid ' + (filterTab === 'to_deliver' ? '#3b82f6' : '#334155'),
                padding: '6px 12px',
                borderRadius: 99,
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              To Deliver ({stats.toDeliver})
            </button>
            <button
              type="button"
              onClick={() => setFilterTab('delivered')}
              style={{
                background: filterTab === 'delivered' ? '#059669' : '#1e293b',
                color: filterTab === 'delivered' ? '#ffffff' : '#94a3b8',
                border: '1px solid ' + (filterTab === 'delivered' ? '#10b981' : '#334155'),
                padding: '6px 12px',
                borderRadius: 99,
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              Delivered ({stats.delivered})
            </button>
            <button
              type="button"
              onClick={() => setFilterTab('all')}
              style={{
                background: filterTab === 'all' ? '#475569' : '#1e293b',
                color: filterTab === 'all' ? '#ffffff' : '#94a3b8',
                border: '1px solid ' + (filterTab === 'all' ? '#64748b' : '#334155'),
                padding: '6px 12px',
                borderRadius: 99,
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              All Stops ({stats.total})
            </button>
            {stats.failed > 0 && (
              <button
                type="button"
                onClick={() => setFilterTab('failed')}
                style={{
                  background: filterTab === 'failed' ? '#dc2626' : '#1e293b',
                  color: filterTab === 'failed' ? '#ffffff' : '#f87171',
                  border: '1px solid ' + (filterTab === 'failed' ? '#ef4444' : '#334155'),
                  padding: '6px 12px',
                  borderRadius: 99,
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                Failed ({stats.failed})
              </button>
            )}
          </div>
        </div>

        {/* ─── ORDER CARDS LIST ─── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {filteredOrders.length === 0 ? (
            <div
              style={{
                background: '#1e293b',
                border: '1px dashed #334155',
                borderRadius: 12,
                padding: '36px 20px',
                textAlign: 'center',
                color: '#94a3b8',
              }}
            >
              <PackageIcon size={36} color="#64748b" />
              <div style={{ fontSize: 15, fontWeight: 700, marginTop: 10, color: '#f8fafc' }}>
                No packages in this tab
              </div>
              <p style={{ fontSize: 12, marginTop: 4, color: '#94a3b8' }}>
                {filterTab === 'to_deliver'
                  ? 'All assigned deliveries have been completed or no orders are currently out for delivery.'
                  : 'Try selecting a different filter above.'}
              </p>
            </div>
          ) : (
            filteredOrders.map((order, idx) => {
              const isUpdating = updatingId === order.id
              const parsedLoc = parseLocation(order.recipient_address)
              const cleanAddr = formatDisplayAddress(order.recipient_address)
              const orderRate = order.usd_to_lbp_rate || rate
              const isDelivered = order.status === 'delivered'
              const isPickedUp = order.status === 'picked_up'
              const isAssigned = order.status === 'assigned'
              const isFailed = order.status === 'failed' || order.status === 'returned'

              return (
                <div
                  key={order.id}
                  style={{
                    background: isDelivered ? '#0f291e' : isFailed ? '#27171a' : '#1e293b',
                    border: '1.5px solid ' + (isDelivered ? '#059669' : isFailed ? '#dc2626' : '#334155'),
                    borderRadius: 12,
                    padding: '14px 16px',
                    boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
                  }}
                >
                  {/* Card Header: Stop # & Code & Status */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span
                        style={{
                          width: 26,
                          height: 26,
                          borderRadius: '50%',
                          background: isDelivered ? '#059669' : '#3b82f6',
                          color: '#ffffff',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 12,
                          fontWeight: 800,
                        }}
                      >
                        {isDelivered ? '✓' : idx + 1}
                      </span>
                      <Link
                        href={`/track/${order.code}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          fontFamily: 'monospace',
                          fontSize: 14,
                          fontWeight: 800,
                          color: '#38bdf8',
                          textDecoration: 'none',
                        }}
                        title="View live public tracking"
                      >
                        #{order.code} ↗
                      </Link>
                    </div>

                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 800,
                        padding: '3px 8px',
                        borderRadius: 99,
                        background:
                          order.status === 'delivered'
                            ? '#064e3b'
                            : order.status === 'picked_up'
                            ? '#1e3a8a'
                            : order.status === 'assigned'
                            ? '#3730a3'
                            : '#7f1d1d',
                        color:
                          order.status === 'delivered'
                            ? '#6ee7b7'
                            : order.status === 'picked_up'
                            ? '#93c5fd'
                            : order.status === 'assigned'
                            ? '#c7d2fe'
                            : '#fca5a5',
                      }}
                    >
                      {ORDER_STATUS_LABELS[order.status] || order.status}
                    </span>
                  </div>

                  {/* Customer & Merchant Info */}
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                      <strong style={{ fontSize: 15, color: '#f8fafc' }}>
                        {order.recipient_name || 'Customer'}
                      </strong>
                      <span style={{ fontSize: 12, color: '#94a3b8' }}>
                        {order.shop?.name || 'Store'}
                      </span>
                    </div>

                    {/* Area & Address */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                      {order.area && (
                        <span style={{ fontSize: 11, fontWeight: 700, color: '#60a5fa', background: '#172554', padding: '1px 6px', borderRadius: 4 }}>
                          {order.area.name}
                        </span>
                      )}
                      {parsedLoc.isCoords && (
                        <span style={{ fontSize: 10.5, fontWeight: 700, color: '#34d399', background: '#064e3b', padding: '1px 6px', borderRadius: 4 }}>
                          📍 GPS Pin
                        </span>
                      )}
                    </div>

                    <div style={{ fontSize: 12.5, color: '#cbd5e1', marginTop: 4, lineHeight: 1.4 }}>
                      {cleanAddr}
                    </div>

                    {order.notes && (
                      <div style={{ fontSize: 11, color: '#fde047', background: 'rgba(253, 224, 71, 0.1)', padding: '4px 8px', borderRadius: 6, marginTop: 6, border: '1px solid rgba(253, 224, 71, 0.2)' }}>
                        📝 Note: {order.notes}
                      </div>
                    )}
                  </div>

                  {/* COD Cash Amount Box */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      background: 'rgba(0,0,0,0.3)',
                      padding: '8px 12px',
                      borderRadius: 8,
                      marginBottom: 12,
                    }}
                  >
                    <div>
                      <span style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>
                        Cash to Collect (COD)
                      </span>
                      <div style={{ fontSize: 18, fontWeight: 900, color: '#10b981' }}>
                        {formatUSD(Number(order.collection_usd || 0))}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>
                        In Lebanese Pounds
                      </span>
                      <div style={{ fontSize: 13, fontWeight: 800, color: '#cbd5e1' }}>
                        {formatLBP(usdToLbp(Number(order.collection_usd || 0), orderRate))}
                      </div>
                    </div>
                  </div>

                  {/* Quick Action Navigation & Contact Grid */}
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr 1fr 1fr',
                      gap: 6,
                      marginBottom: 12,
                    }}
                  >
                    {/* Waze Turn-by-Turn Navigation */}
                    <a
                      href={getWazeDirectionsUrl(order.recipient_address)}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        background: '#0369a1',
                        color: '#ffffff',
                        padding: '8px 4px',
                        borderRadius: 8,
                        fontSize: 11,
                        fontWeight: 700,
                        textAlign: 'center',
                        textDecoration: 'none',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: 2,
                      }}
                      title="Navigate with Waze"
                    >
                      <span>🚙</span>
                      <span>Waze</span>
                    </a>

                    {/* Google Maps Directions */}
                    <a
                      href={getGoogleMapsDirectionsUrl(order.recipient_address)}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        background: '#1d4ed8',
                        color: '#ffffff',
                        padding: '8px 4px',
                        borderRadius: 8,
                        fontSize: 11,
                        fontWeight: 700,
                        textAlign: 'center',
                        textDecoration: 'none',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: 2,
                      }}
                      title="Navigate with Google Maps"
                    >
                      <GoogleMapsIcon size={12} />
                      <span>Maps</span>
                    </a>

                    {/* WhatsApp Customer */}
                    {order.recipient_phone ? (
                      <a
                        href={`https://wa.me/${order.recipient_phone.replace(/\D/g, '')}?text=${encodeURIComponent(
                          `Hello ${order.recipient_name || 'Customer'}! I am your Cedar courier with delivery #${order.code}. I am heading to your location.`
                        )}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          background: '#047857',
                          color: '#ffffff',
                          padding: '8px 4px',
                          borderRadius: 8,
                          fontSize: 11,
                          fontWeight: 700,
                          textAlign: 'center',
                          textDecoration: 'none',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          gap: 2,
                        }}
                        title="Chat on WhatsApp"
                      >
                        <WhatsAppIcon size={12} color="#ffffff" />
                        <span>Chat</span>
                      </a>
                    ) : (
                      <div
                        style={{
                          background: '#334155',
                          color: '#64748b',
                          padding: '8px 4px',
                          borderRadius: 8,
                          fontSize: 11,
                          fontWeight: 700,
                          textAlign: 'center',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          gap: 2,
                        }}
                      >
                        <span>💬</span>
                        <span>No Tel</span>
                      </div>
                    )}

                    {/* Direct Call Customer */}
                    {order.recipient_phone ? (
                      <a
                        href={`tel:${order.recipient_phone}`}
                        style={{
                          background: '#334155',
                          color: '#f8fafc',
                          padding: '8px 4px',
                          borderRadius: 8,
                          fontSize: 11,
                          fontWeight: 700,
                          textAlign: 'center',
                          textDecoration: 'none',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          gap: 2,
                        }}
                        title="Call Customer"
                      >
                        <PhoneIcon size={12} color="#f8fafc" />
                        <span>Call</span>
                      </a>
                    ) : (
                      <div
                        style={{
                          background: '#334155',
                          color: '#64748b',
                          padding: '8px 4px',
                          borderRadius: 8,
                          fontSize: 11,
                          fontWeight: 700,
                          textAlign: 'center',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          gap: 2,
                        }}
                      >
                        <span>📞</span>
                        <span>No Tel</span>
                      </div>
                    )}
                  </div>

                  {/* ─── COURIER DISPATCH WORKFLOW BUTTONS ─── */}
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {/* Step 1: Pick Up from Store */}
                    {isAssigned && (
                      <button
                        type="button"
                        disabled={isUpdating}
                        onClick={() => handleUpdateStatus(order.id, 'picked_up')}
                        style={{
                          flex: 1,
                          background: '#2563eb',
                          color: '#ffffff',
                          border: 'none',
                          padding: '10px 14px',
                          borderRadius: 8,
                          fontSize: 13,
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 6,
                        }}
                      >
                        <PackageIcon size={14} color="#fff" />
                        <span>{isUpdating ? 'Updating…' : 'Pick Up from Store'}</span>
                      </button>
                    )}

                    {/* Step 2: Out for Delivery -> Mark Delivered */}
                    {isPickedUp && (
                      <>
                        <button
                          type="button"
                          disabled={isUpdating}
                          onClick={() => setPodModalOrder(order)}
                          style={{
                            flex: 2,
                            background: '#059669',
                            color: '#ffffff',
                            border: 'none',
                            padding: '10px 14px',
                            borderRadius: 8,
                            fontSize: 13,
                            fontWeight: 800,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 6,
                          }}
                        >
                          <CheckIcon size={14} color="#fff" />
                          <span>{isUpdating ? 'Saving…' : `Delivered & POD ($${Number(order.collection_usd).toFixed(2)})`}</span>
                        </button>

                        <button
                          type="button"
                          disabled={isUpdating}
                          onClick={() => setFailModalOrder(order)}
                          style={{
                            flex: 1,
                            background: '#334155',
                            color: '#f87171',
                            border: '1px solid #475569',
                            padding: '10px 10px',
                            borderRadius: 8,
                            fontSize: 12,
                            fontWeight: 700,
                            cursor: 'pointer',
                          }}
                        >
                          ✕ Reschedule
                        </button>
                      </>
                    )}

                    {/* Step 3: Already Delivered (Allow Revert if clicked by accident & View POD) */}
                    {isDelivered && (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', flexWrap: 'wrap', gap: 6 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 12, color: '#6ee7b7', fontWeight: 700 }}>
                            ✓ Delivered on {order.delivered_at ? formatDate(order.delivered_at) : 'Today'}
                          </span>
                          {(order.pod_signature || order.pod_photo) && (
                            <button
                              type="button"
                              onClick={() => setViewPodOrder(order)}
                              style={{
                                background: '#064e3b',
                                color: '#6ee7b7',
                                border: '1px solid #059669',
                                padding: '2px 8px',
                                borderRadius: 6,
                                fontSize: 11,
                                fontWeight: 700,
                                cursor: 'pointer',
                              }}
                            >
                              ✍️ View POD
                            </button>
                          )}
                        </div>

                        <button
                          type="button"
                          disabled={isUpdating}
                          onClick={() => handleUpdateStatus(order.id, 'picked_up')}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: '#94a3b8',
                            fontSize: 11,
                            textDecoration: 'underline',
                            cursor: 'pointer',
                          }}
                        >
                          Revert to in-transit
                        </button>
                      </div>
                    )}

                    {/* Step 4: Failed / Returned (Allow Retry) */}
                    {isFailed && (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                        <span style={{ fontSize: 12, color: '#fca5a5', fontWeight: 700 }}>
                          Attempted / Postponed
                        </span>
                        <button
                          type="button"
                          disabled={isUpdating}
                          onClick={() => handleUpdateStatus(order.id, 'picked_up')}
                          style={{
                            background: '#2563eb',
                            color: '#fff',
                            border: 'none',
                            padding: '6px 12px',
                            borderRadius: 6,
                            fontSize: 11,
                            fontWeight: 700,
                            cursor: 'pointer',
                          }}
                        >
                          Retry Delivery
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )
            })
          )}
        </div>
      </main>

      {/* ─── PROOF OF DELIVERY MODAL ─── */}
      {podModalOrder && (
        <DeliveryPodModal
          order={podModalOrder}
          rate={rate}
          onClose={() => setPodModalOrder(null)}
          onConfirm={async podData => {
            await handleUpdateStatus(podModalOrder.id, 'delivered', podData)
          }}
        />
      )}

      {/* ─── DELIVERY FAILURE / POSTPONE MODAL ─── */}
      {failModalOrder && (
        <DeliveryFailModal
          order={failModalOrder}
          onClose={() => setFailModalOrder(null)}
          onConfirm={async failData => {
            await handleUpdateStatus(failModalOrder.id, failData.status, {
              failureReason: failData.failureReason,
              notes: failData.notes,
            })
          }}
        />
      )}

      {/* ─── DIGITAL POD VIEWER MODAL ─── */}
      {viewPodOrder && (
        <DeliveryPodViewModal
          order={viewPodOrder}
          onClose={() => setViewPodOrder(null)}
        />
      )}
    </div>
  )
}
