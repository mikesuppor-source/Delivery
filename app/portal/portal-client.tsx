'use client'

import React, { useState, useMemo } from 'react'
import Link from 'next/link'
import { formatUSD, formatLBP, usdToLbp, formatDate, ORDER_STATUS_LABELS } from '@/lib/utils'
import { isValidLebanesePhone, formatLebanesePhone } from '@/lib/phone'
import { WhatsAppIcon } from '@/components/whatsapp-icon'
import { GoogleMapsIcon } from '@/components/google-maps-icon'
import { getGoogleMapsDirectionsUrl } from '@/lib/maps'
import { Modal } from '@/components/modal'

interface Shop {
  id: string
  name: string
  phone: string | null
  address: string | null
  balance_usd: number
  prefix: string | null
}

interface DeliveryArea {
  id: string
  name: string
  fee_usd: number
}

interface PortalOrder {
  id: string
  code: string
  status: 'pending' | 'assigned' | 'picked_up' | 'delivered' | 'failed' | 'returned'
  collection_usd: number
  delivery_fee_usd: number
  shop_balance_usd: number
  usd_to_lbp_rate: number
  created_at: string
  delivered_at?: string | null
  notes?: string | null
  recipient_name: string | null
  recipient_phone: string | null
  recipient_address: string | null
  area: { id: string; name: string; fee_usd: number } | null
  driver: { id: string; name: string; phone?: string | null } | null
}

interface PortalClientProps {
  shop: Shop
  initialOrders: PortalOrder[]
  areas: DeliveryArea[]
  rate: number
  workspaceName: string
}

export function PortalClient({
  shop,
  initialOrders,
  areas,
  rate,
  workspaceName,
}: PortalClientProps) {
  const [orders, setOrders] = useState<PortalOrder[]>(initialOrders)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [isModalOpen, setIsModalOpen] = useState(false)

  // Order creation form state
  const [recipientName, setRecipientName] = useState('')
  const [recipientPhone, setRecipientPhone] = useState('')
  const [recipientAddress, setRecipientAddress] = useState('')
  const [areaId, setAreaId] = useState(areas[0]?.id || '')
  const [currencyMode, setCurrencyMode] = useState<'USD' | 'LBP'>('USD')
  const [rawAmount, setRawAmount] = useState('')
  const [notes, setNotes] = useState('')
  const [customCode, setCustomCode] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formError, setFormError] = useState('')

  // Newly placed order confirmation modal
  const [confirmedOrder, setConfirmedOrder] = useState<PortalOrder | null>(null)

  // Derived selected area & fee
  const selectedArea = areas.find(a => a.id === areaId) || areas[0]
  const deliveryFeeUSD = selectedArea ? Number(selectedArea.fee_usd) : 3.00
  const deliveryFeeLBP = usdToLbp(deliveryFeeUSD, rate)

  // Computed COD and Payout
  const numericAmount = Math.max(0, parseFloat(rawAmount) || 0)
  const codUSD = currencyMode === 'USD' ? numericAmount : (numericAmount / rate)
  const codLBP = currencyMode === 'LBP' ? Math.round(numericAmount) : usdToLbp(codUSD, rate)
  const netPayoutUSD = Math.max(-deliveryFeeUSD, codUSD - deliveryFeeUSD)
  const netPayoutLBP = usdToLbp(netPayoutUSD, rate)

  // Lebanese phone validation
  const isPhoneValid = recipientPhone ? isValidLebanesePhone(recipientPhone) : null

  // Portfolio metrics
  const totalOrdersCount = orders.length
  const pendingCount = orders.filter(o => o.status === 'pending').length
  const inTransitCount = orders.filter(o => o.status === 'assigned' || o.status === 'picked_up').length
  const deliveredCount = orders.filter(o => o.status === 'delivered').length
  const returnedCount = orders.filter(o => o.status === 'returned').length

  const totalCollectedUSD = orders
    .filter(o => o.status === 'delivered')
    .reduce((sum, o) => sum + Number(o.collection_usd), 0)

  // Filtered orders list
  const filteredOrders = useMemo(() => {
    return orders.filter(o => {
      // Status filter
      if (statusFilter === 'pending' && o.status !== 'pending') return false
      if (statusFilter === 'in_transit' && o.status !== 'assigned' && o.status !== 'picked_up') return false
      if (statusFilter === 'delivered' && o.status !== 'delivered') return false
      if (statusFilter === 'returned' && o.status !== 'returned') return false

      // Search query
      if (search.trim()) {
        const q = search.toLowerCase()
        const matchCode = o.code.toLowerCase().includes(q)
        const matchName = o.recipient_name?.toLowerCase().includes(q) || false
        const matchPhone = o.recipient_phone?.toLowerCase().includes(q) || false
        const matchAddr = o.recipient_address?.toLowerCase().includes(q) || false
        if (!matchCode && !matchName && !matchPhone && !matchAddr) return false
      }

      return true
    })
  }, [orders, statusFilter, search])

  async function handleCreateOrder(e: React.FormEvent) {
    e.preventDefault()
    setFormError('')

    if (!recipientName.trim()) {
      setFormError('Please enter the recipient personal full name.')
      return
    }

    if (!recipientPhone.trim() || !isValidLebanesePhone(recipientPhone)) {
      setFormError('Please provide a valid Lebanese mobile number (03, 70, 71, 76, 78, 79, 81).')
      return
    }

    if (!recipientAddress.trim()) {
      setFormError('Please specify the recipient delivery address (city, street, building).')
      return
    }

    if (!areaId) {
      setFormError('Please select a destination delivery area.')
      return
    }

    setIsSubmitting(true)

    try {
      const res = await fetch('/api/portal/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipientName,
          recipientPhone,
          recipientAddress,
          areaId,
          collectionUsd: codUSD,
          notes,
          code: customCode || null,
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Failed to place delivery order.')
      }

      // Add to orders list
      setOrders(prev => [data.order, ...prev])
      setConfirmedOrder(data.order)
      setIsModalOpen(false)

      // Reset form
      setRecipientName('')
      setRecipientPhone('')
      setRecipientAddress('')
      setRawAmount('')
      setNotes('')
      setCustomCode('')
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Error placing order')
    } finally {
      setIsSubmitting(false)
    }
  }

  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://delivery-five-roan.vercel.app'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Top Banner with Store Greeting and Quick Make Order Action */}
      <div
        style={{
          background: 'var(--surface)',
          border: '1.5px solid var(--line)',
          borderRadius: 14,
          padding: '24px 28px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 16,
          boxShadow: 'var(--shadow)',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--brand)' }}>
              Verified Store Portfolio
            </span>
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>• Daily Desk Rate: ${formatUSD(1)} = {formatLBP(rate)}</span>
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 900, color: 'var(--text)' }}>
            {shop.name}
          </h1>
          <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2 }}>
            Place delivery orders with guaranteed scannable barcodes, verified recipients, and upfront pricing.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setFormError('')
            setIsModalOpen(true)
          }}
          className="btn btn-primary"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '12px 22px',
            fontSize: 14,
            fontWeight: 700,
            borderRadius: 8,
            boxShadow: '0 2px 8px rgba(36,99,79,0.25)',
          }}
        >
          <span style={{ fontSize: 16 }}>＋</span>
          <span>Make New Delivery Order</span>
        </button>
      </div>

      {/* Portfolio Financial & Operational Metric Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
        <div style={{ background: 'var(--surface)', border: '1.5px solid var(--line)', borderRadius: 12, padding: '16px 18px' }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>
            Store Balance Owed
          </span>
          <div style={{ fontSize: 22, fontWeight: 900, color: Number(shop.balance_usd) >= 0 ? '#047857' : '#dc2626', marginTop: 4 }}>
            {formatUSD(Number(shop.balance_usd) || 0)}
          </div>
          <small style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginTop: 2 }}>
            {formatLBP(usdToLbp(Number(shop.balance_usd) || 0, rate))}
          </small>
        </div>

        <div style={{ background: 'var(--surface)', border: '1.5px solid var(--line)', borderRadius: 12, padding: '16px 18px' }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>
            Total Shipments
          </span>
          <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--text)', marginTop: 4 }}>
            {totalOrdersCount}
          </div>
          <small style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginTop: 2 }}>
            All-time placed packages
          </small>
        </div>

        <div style={{ background: 'var(--surface)', border: '1.5px solid var(--line)', borderRadius: 12, padding: '16px 18px' }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>
            In Transit / Courier
          </span>
          <div style={{ fontSize: 22, fontWeight: 900, color: '#2563eb', marginTop: 4 }}>
            {inTransitCount}
          </div>
          <small style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginTop: 2 }}>
            {pendingCount} waiting pickup at shop
          </small>
        </div>

        <div style={{ background: 'var(--surface)', border: '1.5px solid var(--line)', borderRadius: 12, padding: '16px 18px' }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>
            Delivered Successfully
          </span>
          <div style={{ fontSize: 22, fontWeight: 900, color: '#059669', marginTop: 4 }}>
            {deliveredCount}
          </div>
          <small style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginTop: 2 }}>
            Total COD: {formatUSD(totalCollectedUSD)}
          </small>
        </div>
      </div>

      {/* Orders Portfolio Filter & Table */}
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

          {/* Search Box */}
          <div style={{ minWidth: 260, maxWidth: 360, width: '100%' }}>
            <input
              type="text"
              placeholder="Search code, customer name, phone..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ fontSize: 12.5, padding: '8px 12px' }}
            />
          </div>
        </div>

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
                  const trackingUrl = `${origin}/track/${order.code}`
                  const whatsappMsg = `Hello ${order.recipient_name || 'Customer'}, your order from ${shop.name} has been registered! Tracking code: #${order.code}. Live tracking: ${trackingUrl}. Amount on delivery: $${Number(order.collection_usd).toFixed(2)} (${usdToLbp(Number(order.collection_usd), order.usd_to_lbp_rate || rate).toLocaleString()} L.L.).`
                  const whatsappUrl = `https://wa.me/${order.recipient_phone?.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(whatsappMsg)}`

                  return (
                    <tr key={order.id} style={{ borderBottom: '1px solid var(--line)' }}>
                      <td style={{ padding: '12px' }}>
                        <Link
                          href={`/track/${order.code}`}
                          target="_blank"
                          style={{
                            fontFamily: 'monospace',
                            fontWeight: 800,
                            color: 'var(--brand)',
                            fontSize: 13,
                            display: 'inline-block',
                          }}
                        >
                          #{order.code}
                        </Link>
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
                            📞 {order.recipient_phone}
                          </span>
                        )}
                        {order.recipient_address && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                            <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                              📍 {order.recipient_address}
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
                        <span className={`badge badge-${order.status}`} style={{ fontSize: 12, textTransform: 'capitalize' }}>
                          {ORDER_STATUS_LABELS[order.status] || order.status}
                        </span>
                      </td>

                      <td style={{ padding: '12px' }}>
                        {order.driver ? (
                          <div>
                            <span style={{ fontWeight: 600, fontSize: 12 }}>🛵 {order.driver.name}</span>
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
                            style={{ padding: '4px 8px', fontSize: 11, textDecoration: 'none' }}
                            title="Print scannable Waybill receipt"
                          >
                            🖨️ Slip
                          </Link>

                          <Link
                            href={`/track/${order.code}`}
                            target="_blank"
                            className="btn btn-ghost btn-sm"
                            style={{ padding: '4px 8px', fontSize: 11, textDecoration: 'none' }}
                            title="Open live customer tracking page"
                          >
                            Track ↗
                          </Link>
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

      {/* Make Order Modal */}
      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="📦 Place Delivery Order (With Price Transparency)">
        <form onSubmit={handleCreateOrder} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {formError && (
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', padding: '10px 14px', borderRadius: 8, fontSize: 12.5 }}>
              {formError}
            </div>
          )}

          {/* Recipient Full Name */}
          <div>
            <label htmlFor="modal-rec-name" style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>
              Recipient Full Name *
            </label>
            <input
              id="modal-rec-name"
              type="text"
              value={recipientName}
              onChange={e => setRecipientName(e.target.value)}
              placeholder="e.g. Maya Haddad"
              required
              style={{ fontSize: 13.5 }}
            />
          </div>

          {/* Recipient Lebanese Phone Number with Format Verification */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <label htmlFor="modal-rec-phone" style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)' }}>
                Recipient Lebanese Phone Number *
              </label>
              {isPhoneValid !== null && (
                <span style={{ fontSize: 11, fontWeight: 700, color: isPhoneValid ? '#059669' : '#dc2626' }}>
                  {isPhoneValid ? `✓ Valid (${formatLebanesePhone(recipientPhone)})` : '⚠️ Invalid number'}
                </span>
              )}
            </div>
            <input
              id="modal-rec-phone"
              type="tel"
              value={recipientPhone}
              onChange={e => setRecipientPhone(e.target.value)}
              placeholder="e.g. 70 123456 or +961 71 889900"
              required
              style={{
                fontSize: 13.5,
                borderColor: isPhoneValid === false ? '#f87171' : undefined,
              }}
            />
            <small style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginTop: 4 }}>
              Accepts Alfa & Touch mobile numbers (03, 70, 71, 76, 78, 79, 81) or Lebanese landlines.
            </small>
          </div>

          {/* Recipient Full Address */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <label htmlFor="modal-rec-addr" style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)' }}>
                Detailed Delivery Address *
              </label>
              {recipientAddress && (
                <a
                  href={getGoogleMapsDirectionsUrl(recipientAddress)}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ fontSize: 11, color: 'var(--brand)', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                >
                  <GoogleMapsIcon size={11} />
                  <span>Preview on Maps</span>
                </a>
              )}
            </div>
            <input
              id="modal-rec-addr"
              type="text"
              value={recipientAddress}
              onChange={e => setRecipientAddress(e.target.value)}
              placeholder="e.g. Achrafieh, Sassine Square, Bldg 12, 3rd floor"
              required
              style={{ fontSize: 13.5 }}
            />
          </div>

          {/* Destination Delivery Area Selection (Shows exact fee) */}
          <div>
            <label htmlFor="modal-rec-area" style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>
              Destination Delivery Area (Delivery Fee Upfront) *
            </label>
            <select
              id="modal-rec-area"
              value={areaId}
              onChange={e => setAreaId(e.target.value)}
              required
              style={{ fontSize: 13.5 }}
            >
              {areas.map(a => (
                <option key={a.id} value={a.id}>
                  {a.name} — {formatUSD(Number(a.fee_usd))} ({formatLBP(usdToLbp(Number(a.fee_usd), rate))})
                </option>
              ))}
            </select>
          </div>

          {/* COD Cash Amount to Collect */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <label htmlFor="modal-rec-cod" style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)' }}>
                Cash to Collect from Customer (COD)
              </label>
              <div style={{ display: 'flex', gap: 4 }}>
                <button
                  type="button"
                  onClick={() => setCurrencyMode('USD')}
                  className={`btn btn-sm ${currencyMode === 'USD' ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ fontSize: 11, padding: '2px 8px' }}
                >
                  USD ($)
                </button>
                <button
                  type="button"
                  onClick={() => setCurrencyMode('LBP')}
                  className={`btn btn-sm ${currencyMode === 'LBP' ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ fontSize: 11, padding: '2px 8px' }}
                >
                  LBP (L.L.)
                </button>
              </div>
            </div>
            <input
              id="modal-rec-cod"
              type="number"
              step={currencyMode === 'USD' ? '0.01' : '1000'}
              value={rawAmount}
              onChange={e => setRawAmount(e.target.value)}
              placeholder={currencyMode === 'USD' ? '0.00' : '0'}
              style={{ fontSize: 14, fontWeight: 700 }}
            />
          </div>

          {/* Price Transparency Breakdown Card */}
          <div
            style={{
              background: 'var(--brand-light)',
              border: '1.5px solid var(--brand)',
              borderRadius: 8,
              padding: '14px 16px',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              fontSize: 12.5,
            }}
          >
            <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', color: 'var(--brand)' }}>
              💰 Upfront Price & Payout Breakdown
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--muted)' }}>Customer Pays on Delivery:</span>
              <strong>{formatUSD(codUSD)} <small style={{ fontWeight: 400 }}>({formatLBP(codLBP)})</small></strong>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--muted)' }}>Cedar Delivery Fee:</span>
              <span style={{ color: '#dc2626', fontWeight: 600 }}>-{formatUSD(deliveryFeeUSD)} <small style={{ fontWeight: 400 }}>({formatLBP(deliveryFeeLBP)})</small></span>
            </div>

            <div style={{ borderTop: '1px solid var(--line)', paddingTop: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 700, color: 'var(--text)' }}>Net Money You Will Receive:</span>
              <strong style={{ fontSize: 15, color: '#047857' }}>
                {formatUSD(netPayoutUSD)}
                <small style={{ display: 'block', fontSize: 11, fontWeight: 500, color: 'var(--muted)', textAlign: 'right' }}>
                  ({formatLBP(netPayoutLBP)})
                </small>
              </strong>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label htmlFor="modal-rec-notes" style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>
              Notes / Instructions for Courier (Optional)
            </label>
            <textarea
              id="modal-rec-notes"
              rows={2}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="e.g. Fragile package, call 15 minutes before arrival..."
              style={{ fontSize: 12.5 }}
            />
          </div>

          {/* Custom Tracking Code (Optional) */}
          <div>
            <label htmlFor="modal-rec-code" style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>
              Custom Tracking Number / Invoice ID (Optional)
            </label>
            <input
              id="modal-rec-code"
              type="text"
              value={customCode}
              onChange={e => setCustomCode(e.target.value.toUpperCase())}
              placeholder={`Leave empty for auto-generated non-repeating ${shop.prefix || 'CD'}-XXXXXX`}
              style={{ fontSize: 12, fontFamily: 'monospace' }}
            />
            <small style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginTop: 3 }}>
              Guaranteed unique: will check database to prevent duplicates.
            </small>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="btn btn-secondary"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="btn btn-primary"
              style={{ padding: '10px 20px', fontWeight: 700 }}
            >
              {isSubmitting ? 'Placing Order & Generating Barcode…' : 'Confirm & Generate Waybill Slip'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Order Created Confirmation & Waybill Slip Modal */}
      {confirmedOrder && (
        <Modal
          isOpen={!!confirmedOrder}
          onClose={() => setConfirmedOrder(null)}
          title="🎉 Order Registered Successfully!"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18, textAlign: 'center' }}>
            <div
              style={{
                background: 'var(--bg)',
                border: '2px solid var(--brand)',
                borderRadius: 12,
                padding: '20px',
              }}
            >
              <span style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', color: 'var(--muted)' }}>
                Unique Waybill Tracking Code
              </span>
              <div style={{ fontSize: 26, fontWeight: 900, fontFamily: 'monospace', color: 'var(--brand)', marginTop: 2 }}>
                #{confirmedOrder.code}
              </div>
              <small style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginTop: 4 }}>
                This barcode ID is verified and guaranteed unique across Cedar Delivery.
              </small>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 14, textAlign: 'left', fontSize: 12.5 }}>
                <div style={{ background: 'var(--surface)', padding: '10px', borderRadius: 6, border: '1px solid var(--line)' }}>
                  <span style={{ color: 'var(--muted)', display: 'block', fontSize: 11 }}>Recipient:</span>
                  <strong>{confirmedOrder.recipient_name}</strong>
                  <span style={{ display: 'block', color: 'var(--muted)', fontSize: 11 }}>📞 {confirmedOrder.recipient_phone}</span>
                </div>
                <div style={{ background: 'var(--surface)', padding: '10px', borderRadius: 6, border: '1px solid var(--line)' }}>
                  <span style={{ color: 'var(--muted)', display: 'block', fontSize: 11 }}>Destination:</span>
                  <strong>{confirmedOrder.area?.name}</strong>
                  <span style={{ display: 'block', color: 'var(--muted)', fontSize: 11 }}>{confirmedOrder.recipient_address}</span>
                </div>
              </div>

              <div style={{ marginTop: 12, padding: '10px', background: '#ecfdf5', borderRadius: 6, border: '1px solid #86efac', textAlign: 'left', fontSize: 12.5 }}>
                <span style={{ color: '#065f46', fontWeight: 700, display: 'block' }}>
                  💰 Amount to Collect: {formatUSD(Number(confirmedOrder.collection_usd))} ({formatLBP(usdToLbp(Number(confirmedOrder.collection_usd), confirmedOrder.usd_to_lbp_rate || rate))})
                </span>
                <small style={{ color: '#065f46' }}>
                  Net payout to your store: {formatUSD(Number(confirmedOrder.shop_balance_usd))}
                </small>
              </div>
            </div>

            {/* Actions for store: Print Waybill Slip and WhatsApp customer */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <Link
                href={`/print/order/${confirmedOrder.code}?print=true`}
                target="_blank"
                className="btn btn-primary"
                style={{
                  padding: '12px 18px',
                  fontSize: 14,
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  textDecoration: 'none',
                }}
              >
                <span>🖨️</span>
                <span>Print Scannable Barcode & QR Slip</span>
              </Link>

              {confirmedOrder.recipient_phone && (
                <a
                  href={`https://wa.me/${confirmedOrder.recipient_phone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(
                    `Hello ${confirmedOrder.recipient_name}! Your delivery from ${shop.name} has been booked. Tracking code: #${confirmedOrder.code}. Track your package live: ${origin}/track/${confirmedOrder.code}. Total Cash on Delivery: $${Number(confirmedOrder.collection_usd).toFixed(2)} (${usdToLbp(Number(confirmedOrder.collection_usd), confirmedOrder.usd_to_lbp_rate || rate).toLocaleString()} L.L.). Thank you!`
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-secondary"
                  style={{
                    padding: '11px 18px',
                    fontSize: 13,
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    color: '#047857',
                  }}
                >
                  <WhatsAppIcon size={16} color="#047857" />
                  <span>Send WhatsApp Confirmation to Customer</span>
                </a>
              )}

              <button
                type="button"
                onClick={() => {
                  setConfirmedOrder(null)
                  setIsModalOpen(true)
                }}
                className="btn btn-ghost"
                style={{ fontSize: 13 }}
              >
                ＋ Make Another Order
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
