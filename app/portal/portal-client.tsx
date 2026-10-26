'use client'

import React, { useState, useMemo } from 'react'
import Link from 'next/link'
import { formatUSD, formatLBP, usdToLbp, formatDate, ORDER_STATUS_LABELS } from '@/lib/utils'
import type { OrderStatus } from '@/lib/roles'
import { isValidLebanesePhone, formatLebanesePhone } from '@/lib/phone'
import { WhatsAppIcon } from '@/components/whatsapp-icon'
import { GoogleMapsIcon } from '@/components/google-maps-icon'
import { getGoogleMapsDirectionsUrl, getWazeDirectionsUrl } from '@/lib/maps'
import { LocationHelper } from '@/components/location-helper'
import { Modal } from '@/components/modal'
import { TrashIcon, PrinterIcon, MapPinIcon } from '@/components/icons'
import { ShopifyIcon } from '@/components/shopify-icon'
import { ShopifyIntegrationModal } from '@/components/shopify-integration-modal'
import { BulkOrderImportModal } from '@/components/bulk-order-import-modal'

interface Shop {
  id: string
  name: string
  phone: string | null
  address: string | null
  balance_usd: number
  prefix: string | null
  api_key?: string | null
  shopify_domain?: string | null
  workspace_id?: string | null
}

interface DeliveryArea {
  id: string
  name: string
  fee_usd: number
}

interface PortalOrder {
  id: string
  code: string
  tracking_token?: string
  status: OrderStatus
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
  shopify_order_id?: string | null
  shopify_order_number?: string | null
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
  const [isShopifyModalOpen, setIsShopifyModalOpen] = useState(false)
  const [isBulkImportModalOpen, setIsBulkImportModalOpen] = useState(false)

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

  // Order Details & Live Status Modal
  const [inspectingOrder, setInspectingOrder] = useState<PortalOrder | null>(null)
  const [isCancelling, setIsCancelling] = useState(false)
  const [cancelError, setCancelError] = useState('')

  async function handleCancelOrder(orderId: string) {
    if (!window.confirm('Are you sure you want to cancel this pending delivery order?')) {
      return
    }
    setIsCancelling(true)
    setCancelError('')
    try {
      const res = await fetch('/api/portal/orders', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, action: 'cancel' }),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Failed to cancel order')
      }
      setOrders(prev => prev.map(o => o.id === orderId ? data.order : o))
      setInspectingOrder(data.order)
    } catch (err: unknown) {
      setCancelError(err instanceof Error ? err.message : 'Error cancelling order')
    } finally {
      setIsCancelling(false)
    }
  }

  const [isDeleting, setIsDeleting] = useState(false)

  async function handleDeleteOrders(targetIds: string[], codesLabel?: string) {
    if (targetIds.length === 0) return
    const msg = targetIds.length === 1
      ? `Are you sure you want to cancel order ${codesLabel || ''}? The order will be cancelled with balances voided.`
      : `Are you sure you want to cancel these ${targetIds.length} pending orders?`

    if (!window.confirm(msg)) {
      return
    }

    setIsDeleting(true)
    try {
      const res = await fetch('/api/portal/orders', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderIds: targetIds }),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Failed to cancel orders')
      }

      setOrders(prev =>
        prev.map(o =>
          targetIds.includes(o.id)
            ? { ...o, status: 'cancelled', collection_usd: 0 }
            : o
        )
      )
      setSelectedOrderIds(prev => prev.filter(id => !targetIds.includes(id)))
      if (inspectingOrder && targetIds.includes(inspectingOrder.id)) {
        setInspectingOrder(prev => (prev ? { ...prev, status: 'cancelled', collection_usd: 0 } : null))
      }
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Error cancelling orders')
    } finally {
      setIsDeleting(false)
    }
  }

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

  // Batch selection state for bulk actions
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([])

  const isAllSelected = filteredOrders.length > 0 && filteredOrders.every(o => selectedOrderIds.includes(o.id))

  function toggleSelectAll() {
    if (isAllSelected) {
      setSelectedOrderIds([])
    } else {
      setSelectedOrderIds(filteredOrders.map(o => o.id))
    }
  }

  function toggleSelectOrder(id: string) {
    setSelectedOrderIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    )
  }

  function handlePrintSelected() {
    const selectedCodes = orders
      .filter(o => selectedOrderIds.includes(o.id))
      .map(o => o.code)
    if (selectedCodes.length > 0) {
      window.open(`/print/bulk?codes=${encodeURIComponent(selectedCodes.join(','))}&print=true`, '_blank')
    }
  }

  function handleExportCSV() {
    const exportList = selectedOrderIds.length > 0
      ? orders.filter(o => selectedOrderIds.includes(o.id))
      : filteredOrders

    if (exportList.length === 0) return

    const headers = [
      'Tracking Code',
      'Created Date',
      'Status',
      'Recipient Name',
      'Recipient Phone',
      'Recipient Address',
      'Destination Area',
      'COD Amount (USD)',
      'COD Amount (LBP)',
      'Delivery Fee (USD)',
      'Net Store Balance (USD)',
      'Assigned Courier',
      'Notes',
    ]

    const rows = exportList.map(o => {
      const codUSD = Number(o.collection_usd) || 0
      const codLBP = usdToLbp(codUSD, o.usd_to_lbp_rate || rate)
      const feeUSD = Number(o.delivery_fee_usd) || 0
      const netUSD = Number(o.shop_balance_usd) || 0
      return [
        o.code,
        formatDate(o.created_at),
        ORDER_STATUS_LABELS[o.status] || o.status,
        o.recipient_name || '',
        o.recipient_phone || '',
        o.recipient_address || '',
        o.area?.name || '',
        codUSD.toFixed(2),
        codLBP.toString(),
        feeUSD.toFixed(2),
        netUSD.toFixed(2),
        o.driver?.name || 'Unassigned',
        (o.notes || '').replace(/"/g, '""'),
      ]
    })

    const csvContent = [
      headers.map(h => `"${h}"`).join(','),
      ...rows.map(row => row.map(col => `"${col}"`).join(',')),
    ].join('\r\n')

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.setAttribute('href', url)
    const dateStr = new Date().toISOString().split('T')[0]
    link.setAttribute('download', `cedar-orders-${(shop.name || 'merchant').toLowerCase().replace(/[^a-z0-9]/g, '-')}-${dateStr}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

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

  const origin = typeof window !== 'undefined' ? window.location.origin : (process.env.NEXT_PUBLIC_SITE_URL || '')

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

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <button
            type="button"
            onClick={() => setIsShopifyModalOpen(true)}
            className="btn btn-secondary"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '11px 16px',
              fontSize: 13,
              fontWeight: 700,
              borderRadius: 8,
              border: '1.5px solid #95BF47',
              color: 'var(--text)',
            }}
            title="Automate order sync from your Shopify store"
          >
            <ShopifyIcon size={18} />
            <span>Connect Shopify</span>
          </button>

          <button
            type="button"
            onClick={() => setIsBulkImportModalOpen(true)}
            className="btn btn-secondary"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '11px 16px',
              fontSize: 13,
              fontWeight: 700,
              borderRadius: 8,
            }}
            title="Import orders from Shopify CSV or Excel export"
          >
            <span>📥 Bulk Import CSV</span>
          </button>

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
              padding: '11px 20px',
              fontSize: 13.5,
              fontWeight: 700,
              borderRadius: 8,
              boxShadow: '0 2px 8px rgba(36,99,79,0.25)',
            }}
          >
            <span style={{ fontSize: 16 }}>＋</span>
            <span>Make New Delivery Order</span>
          </button>
        </div>
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

          {/* Search Box & Quick Export */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={handleExportCSV}
              className="btn btn-secondary btn-sm"
              style={{ fontSize: 12, padding: '7px 12px', display: 'inline-flex', alignItems: 'center', gap: 6 }}
              title="Download orders as CSV spreadsheet"
            >
              <span>📥 Export CSV</span>
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
                ✓ {selectedOrderIds.length} {selectedOrderIds.length === 1 ? 'order' : 'orders'} selected
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
                📥 Export Selected ({selectedOrderIds.length})
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
                            <span>🔍</span>
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
      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Place Delivery Order — Transparent Pricing">
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
                  {isPhoneValid ? `Valid (${formatLebanesePhone(recipientPhone)})` : 'Invalid format'}
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

          {/* Recipient Full Address with GPS Detection & Verification */}
          <LocationHelper
            id="modal-rec-addr"
            address={recipientAddress}
            onAddressChange={setRecipientAddress}
            label="Detailed Delivery Address / Google Maps Pin"
            placeholder="e.g. Achrafieh, Sassine Square, Bldg 12 or paste Google Maps link"
            required
          />

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
              Upfront Price & Payout Breakdown
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
                  Amount to Collect: {formatUSD(Number(confirmedOrder.collection_usd))} ({formatLBP(usdToLbp(Number(confirmedOrder.collection_usd), confirmedOrder.usd_to_lbp_rate || rate))})
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
                <PrinterIcon size={16} />
                <span>Print Scannable Barcode & QR Slip</span>
              </Link>

              {confirmedOrder.recipient_phone && (
                <a
                  href={`https://wa.me/${confirmedOrder.recipient_phone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(
                    `Hello ${confirmedOrder.recipient_name}! Your delivery from ${shop.name} has been booked. Tracking code: #${confirmedOrder.code}. Track your package live: ${origin}/track/${confirmedOrder.tracking_token || confirmedOrder.code}. Total Cash on Delivery: $${Number(confirmedOrder.collection_usd).toFixed(2)} (${usdToLbp(Number(confirmedOrder.collection_usd), confirmedOrder.usd_to_lbp_rate || rate).toLocaleString()} L.L.). Thank you!`
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

      {/* ─── Order Status & Details Modal ─── */}
      {inspectingOrder && (
        <Modal
          isOpen={!!inspectingOrder}
          onClose={() => {
            setInspectingOrder(null)
            setCancelError('')
          }}
          title={`Order Details & Live Status — #${inspectingOrder.code}`}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Header Status Bar */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 10,
                padding: '12px 16px',
                background: 'var(--bg)',
                borderRadius: 10,
                border: '1.5px solid var(--line)',
              }}
            >
              <div>
                <span style={{ fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', color: 'var(--muted)', letterSpacing: '0.5px' }}>
                  Waybill Barcode ID
                </span>
                <div style={{ fontSize: 20, fontWeight: 900, fontFamily: 'monospace', color: 'var(--brand)' }}>
                  #{inspectingOrder.code}
                </div>
                <small style={{ fontSize: 11, color: 'var(--muted)' }}>
                  Registered on {formatDate(inspectingOrder.created_at)}
                </small>
              </div>

              <div style={{ textAlign: 'right' }}>
                <span style={{ fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', color: 'var(--muted)', letterSpacing: '0.5px', display: 'block', marginBottom: 2 }}>
                  Current Status
                </span>
                <span
                  className={`badge badge-${inspectingOrder.status}`}
                  style={{ fontSize: 12.5, padding: '4px 12px', fontWeight: 800 }}
                >
                  {ORDER_STATUS_LABELS[inspectingOrder.status] || inspectingOrder.status}
                </span>
              </div>
            </div>

            {cancelError && (
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', padding: '8px 12px', borderRadius: 6, fontSize: 12 }}>
                {cancelError}
              </div>
            )}

            {/* Visual 4-Step Stepper Timeline */}
            <div
              style={{
                background: 'var(--surface)',
                border: '1.5px solid var(--line)',
                borderRadius: 10,
                padding: '16px',
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', color: 'var(--muted)', letterSpacing: '0.5px', marginBottom: 12 }}>
                Live Delivery Milestones
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {/* Step 1: Placed */}
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  <div
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: '50%',
                      background: '#10b981',
                      color: '#ffffff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 12,
                      fontWeight: 800,
                      flexShrink: 0,
                    }}
                  >
                    ✓
                  </div>
                  <div>
                    <strong style={{ fontSize: 13, color: 'var(--text)' }}>
                      1. Order Registered at Store
                    </strong>
                    <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>
                      Waybill created on {formatDate(inspectingOrder.created_at)}
                    </div>
                  </div>
                </div>

                {/* Step 2: Courier Assigned */}
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  <div
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: '50%',
                      background: inspectingOrder.status !== 'pending' ? '#10b981' : '#e5e7eb',
                      color: inspectingOrder.status !== 'pending' ? '#ffffff' : '#9ca3af',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 12,
                      fontWeight: 800,
                      flexShrink: 0,
                    }}
                  >
                    {inspectingOrder.status !== 'pending' ? '✓' : '2'}
                  </div>
                  <div>
                    <strong style={{ fontSize: 13, color: inspectingOrder.status !== 'pending' ? 'var(--text)' : 'var(--muted)' }}>
                      2. Courier Assigned
                    </strong>
                    <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>
                      {inspectingOrder.driver
                        ? `Assigned to ${inspectingOrder.driver.name}${inspectingOrder.driver.phone ? ` (${inspectingOrder.driver.phone})` : ''}`
                        : 'Waiting for dispatch manager to assign courier'}
                    </div>
                  </div>
                </div>

                {/* Step 3: Out for Delivery */}
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  <div
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: '50%',
                      background: (inspectingOrder.status === 'picked_up' || inspectingOrder.status === 'delivered') ? '#10b981' : '#e5e7eb',
                      color: (inspectingOrder.status === 'picked_up' || inspectingOrder.status === 'delivered') ? '#ffffff' : '#9ca3af',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 12,
                      fontWeight: 800,
                      flexShrink: 0,
                    }}
                  >
                    {(inspectingOrder.status === 'picked_up' || inspectingOrder.status === 'delivered') ? '✓' : '3'}
                  </div>
                  <div>
                    <strong style={{ fontSize: 13, color: (inspectingOrder.status === 'picked_up' || inspectingOrder.status === 'delivered') ? 'var(--text)' : 'var(--muted)' }}>
                      3. Picked Up & Out for Delivery
                    </strong>
                    <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>
                      {inspectingOrder.status === 'picked_up' || inspectingOrder.status === 'delivered'
                        ? 'Package in transit with courier to customer address'
                        : 'Package awaiting courier pickup from store'}
                    </div>
                  </div>
                </div>

                {/* Step 4: Delivered or Returned */}
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  <div
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: '50%',
                      background: inspectingOrder.status === 'delivered' ? '#10b981' : inspectingOrder.status === 'returned' ? '#ef4444' : '#e5e7eb',
                      color: (inspectingOrder.status === 'delivered' || inspectingOrder.status === 'returned') ? '#ffffff' : '#9ca3af',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 12,
                      fontWeight: 800,
                      flexShrink: 0,
                    }}
                  >
                    {inspectingOrder.status === 'delivered' ? '✓' : inspectingOrder.status === 'returned' ? '✕' : '4'}
                  </div>
                  <div>
                    <strong style={{ fontSize: 13, color: inspectingOrder.status === 'delivered' ? '#047857' : inspectingOrder.status === 'returned' ? '#b91c1c' : 'var(--muted)' }}>
                      {inspectingOrder.status === 'returned' ? 'Cancelled / Returned to Store' : '4. Delivered (COD Cleared)'}
                    </strong>
                    <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>
                      {inspectingOrder.status === 'delivered'
                        ? `Successfully delivered${inspectingOrder.delivered_at ? ` on ${formatDate(inspectingOrder.delivered_at)}` : ''} and cash collected.`
                        : inspectingOrder.status === 'returned'
                        ? 'Order was cancelled or returned to store.'
                        : 'Customer payment collection upon physical handover'}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Recipient & Location Info Card */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 12,
                fontSize: 12.5,
              }}
            >
              <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 8, padding: '12px' }}>
                <span style={{ fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', color: 'var(--muted)', display: 'block' }}>
                  Customer Details
                </span>
                <strong style={{ fontSize: 13, color: 'var(--text)', display: 'block', marginTop: 2 }}>
                  {inspectingOrder.recipient_name || 'Customer'}
                </strong>
                {inspectingOrder.recipient_phone && (
                  <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ color: 'var(--muted)' }}>{inspectingOrder.recipient_phone}</span>
                    <a
                      href={`https://wa.me/${inspectingOrder.recipient_phone.replace(/[^0-9]/g, '')}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: '#059669', display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11, fontWeight: 700 }}
                    >
                      <WhatsAppIcon size={12} color="#059669" />
                      <span>Chat</span>
                    </a>
                  </div>
                )}
              </div>

              <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 8, padding: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', color: 'var(--muted)', display: 'block' }}>
                    Delivery Destination
                  </span>
                  {inspectingOrder.recipient_address && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <a
                        href={getGoogleMapsDirectionsUrl(inspectingOrder.recipient_address)}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11, color: 'var(--brand)', fontWeight: 600, textDecoration: 'none' }}
                        title="Open Google Maps Directions"
                      >
                        <GoogleMapsIcon size={11} />
                        <span>Maps</span>
                      </a>
                      <a
                        href={getWazeDirectionsUrl(inspectingOrder.recipient_address)}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11, color: '#0284c7', fontWeight: 600, textDecoration: 'none' }}
                        title="Open in Waze Navigation"
                      >
                        <span>Waze</span>
                      </a>
                    </div>
                  )}
                </div>
                <strong style={{ fontSize: 13, color: 'var(--text)', display: 'block', marginTop: 2 }}>
                  {inspectingOrder.area?.name || 'Standard Area'}
                </strong>
                <span style={{ fontSize: 11.5, color: 'var(--muted)', display: 'block', marginTop: 2 }}>
                  {inspectingOrder.recipient_address || 'Address on file'}
                </span>
              </div>
            </div>

            {/* Financial Settlement Breakdown */}
            <div
              style={{
                background: 'var(--brand-light)',
                border: '1.5px solid var(--brand)',
                borderRadius: 8,
                padding: '12px 16px',
                fontSize: 12.5,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ color: 'var(--muted)' }}>Cash to Collect from Customer (COD):</span>
                <strong>
                  {formatUSD(Number(inspectingOrder.collection_usd))} ({formatLBP(usdToLbp(Number(inspectingOrder.collection_usd), inspectingOrder.usd_to_lbp_rate || rate))})
                </strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ color: 'var(--muted)' }}>Delivery Service Fee:</span>
                <span style={{ color: '#dc2626', fontWeight: 600 }}>
                  -{formatUSD(Number(inspectingOrder.delivery_fee_usd))} ({formatLBP(usdToLbp(Number(inspectingOrder.delivery_fee_usd), inspectingOrder.usd_to_lbp_rate || rate))})
                </span>
              </div>
              <div style={{ borderTop: '1px solid var(--line)', paddingTop: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <strong style={{ color: 'var(--text)' }}>Net Store Payout:</strong>
                <strong style={{ fontSize: 15, color: '#047857' }}>
                  {formatUSD(Number(inspectingOrder.shop_balance_usd))}
                  <small style={{ display: 'block', fontSize: 11, fontWeight: 500, color: 'var(--muted)', textAlign: 'right' }}>
                    ({formatLBP(usdToLbp(Number(inspectingOrder.shop_balance_usd), inspectingOrder.usd_to_lbp_rate || rate))})
                  </small>
                </strong>
              </div>
            </div>

            {/* Special Instructions */}
            {inspectingOrder.notes && (
              <div style={{ background: '#fef3c7', border: '1px solid #fde68a', color: '#92400e', padding: '10px 14px', borderRadius: 8, fontSize: 12 }}>
                <strong>Handling Notes:</strong> {inspectingOrder.notes}
              </div>
            )}

            {/* Modal Actions */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginTop: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {inspectingOrder.status === 'pending' && (
                  <button
                    type="button"
                    disabled={isCancelling}
                    onClick={() => handleCancelOrder(inspectingOrder.id)}
                    className="btn btn-ghost btn-sm"
                    style={{ color: '#d97706', border: '1px solid #fde68a', fontSize: 12 }}
                  >
                    {isCancelling ? 'Cancelling…' : '✕ Cancel Pickup'}
                  </button>
                )}

                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={() => handleDeleteOrders([inspectingOrder.id], `#${inspectingOrder.code}`)}
                  className="btn btn-ghost btn-sm"
                  style={{ color: '#dc2626', border: '1px solid #fecaca', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 5 }}
                  title="Cancel this pending order and void fees"
                >
                  <TrashIcon size={13} color="#dc2626" />
                  <span>{isDeleting ? 'Cancelling…' : 'Cancel Order'}</span>
                </button>
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <Link
                  href={`/print/order/${inspectingOrder.code}?print=true`}
                  target="_blank"
                  className="btn btn-secondary btn-sm"
                  style={{ fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }}
                >
                  <PrinterIcon size={13} />
                  <span>Print Slip</span>
                </Link>

                <Link
                  href={`/track/${inspectingOrder.tracking_token || inspectingOrder.code}`}
                  target="_blank"
                  className="btn btn-primary btn-sm"
                  style={{ fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 5 }}
                >
                  <span>Track ↗</span>
                </Link>
              </div>
            </div>
          </div>
        </Modal>
      )}

      {/* ─── SHOPIFY INTEGRATION MODAL ─── */}
      <ShopifyIntegrationModal
        isOpen={isShopifyModalOpen}
        onClose={() => setIsShopifyModalOpen(false)}
        shop={shop}
        onOrderCreated={newOrder => {
          setOrders(prev => [newOrder as any, ...prev])
        }}
      />

      {/* ─── BULK ORDER IMPORT MODAL (SHOPIFY / EXCEL CSV) ─── */}
      <BulkOrderImportModal
        isOpen={isBulkImportModalOpen}
        onClose={() => setIsBulkImportModalOpen(false)}
        workspaceId={shop.workspace_id || ''}
        shopId={shop.id}
        shopName={shop.name}
        onImportComplete={() => {
          window.location.reload()
        }}
      />
    </div>
  )
}
