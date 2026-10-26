'use client'

import { useState, useMemo, useEffect, useRef } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Modal } from '@/components/modal'
import { formatUSD, formatLBP, usdToLbp, formatDate, isDateInPreset, getDateRangeLabel, type DateRangePreset, ORDER_STATUS_LABELS } from '@/lib/utils'
import type { UserRole, OrderStatus } from '@/lib/roles'
import { WhatsAppIcon } from '@/components/whatsapp-icon'
import { getWhatsAppUrl, buildCustomerOrderMessage, buildDriverDispatchMessage } from '@/lib/whatsapp'
import { OrderReceiptSlip } from '@/components/order-receipt-slip'
import { BarcodeScannerModal } from '@/components/barcode-scanner-modal'
import { GoogleMapsIcon } from '@/components/google-maps-icon'
import { getGoogleMapsDirectionsUrl, getWazeDirectionsUrl, formatDisplayAddress } from '@/lib/maps'
import { LocationHelper } from '@/components/location-helper'
import { TrashIcon, ScanIcon } from '@/components/icons'
import { ShopifyIcon } from '@/components/shopify-icon'
import { BulkOrderImportModal } from '@/components/bulk-order-import-modal'

interface Order {
  id: string
  code: string
  tracking_token?: string
  status: OrderStatus
  service_type?: 'delivery' | 'replacement' | 'pickup'
  weight_kg?: number
  is_breakable?: boolean
  carrier_name?: string | null
  carrier_tracking_code?: string | null
  destination_governorate?: string | null
  destination_caza?: string | null
  destination_town?: string | null
  collection_usd: number
  delivery_fee_usd: number
  driver_pay_usd: number
  shop_balance_usd: number
  usd_to_lbp_rate: number
  recipient_name: string | null
  recipient_phone: string | null
  recipient_address: string | null
  notes?: string | null
  shopify_order_id?: string | null
  shopify_order_number?: string | null
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
  const [soundEnabled, setSoundEnabled] = useState(true)
  const soundRef = useRef(soundEnabled)
  useEffect(() => {
    soundRef.current = soundEnabled
  }, [soundEnabled])

  function playChime() {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext
      if (!AudioCtx) return
      const ctx = new AudioCtx()
      const now = ctx.currentTime
      const osc1 = ctx.createOscillator()
      const gain1 = ctx.createGain()
      osc1.type = 'sine'
      osc1.frequency.setValueAtTime(587.33, now)
      gain1.gain.setValueAtTime(0.15, now)
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.3)
      osc1.connect(gain1)
      gain1.connect(ctx.destination)
      osc1.start(now)
      osc1.stop(now + 0.3)

      const osc2 = ctx.createOscillator()
      const gain2 = ctx.createGain()
      osc2.type = 'sine'
      osc2.frequency.setValueAtTime(880, now + 0.12)
      gain2.gain.setValueAtTime(0.18, now + 0.12)
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.45)
      osc2.connect(gain2)
      gain2.connect(ctx.destination)
      osc2.start(now + 0.12)
      osc2.stop(now + 0.45)
    } catch {
      // AudioContext unavailable or requires interaction
    }
  }

  // Real-time synchronization: listen for inserts and updates to orders
  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel('desk-orders-' + workspaceId)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders', filter: `workspace_id=eq.${workspaceId}` },
        payload => {
          if (payload.eventType === 'INSERT') {
            const newRow = payload.new as any
            const shopObj = shops.find(s => s.id === newRow.shop_id) || null
            const driverObj = drivers.find(d => d.id === newRow.driver_id) || null
            const areaObj = areas.find(a => a.id === newRow.area_id) || null
            const enriched: Order = { ...newRow, shop: shopObj, driver: driverObj, area: areaObj }
            setOrders(prev => (prev.some(o => o.id === enriched.id) ? prev : [enriched, ...prev]))
            if (soundRef.current) {
              playChime()
            }
          } else if (payload.eventType === 'UPDATE') {
            const updatedRow = payload.new as any
            const shopObj = shops.find(s => s.id === updatedRow.shop_id) || null
            const driverObj = drivers.find(d => d.id === updatedRow.driver_id) || null
            const areaObj = areas.find(a => a.id === updatedRow.area_id) || null
            setOrders(prev =>
              prev.map(o =>
                o.id === updatedRow.id
                  ? {
                      ...o,
                      ...updatedRow,
                      shop: shopObj || o.shop,
                      driver: driverObj || o.driver,
                      area: areaObj || o.area,
                    }
                  : o
              )
            )
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [workspaceId, shops, drivers, areas])
  const [filter, setFilter] = useState<string>('all')
  const [datePreset, setDatePreset] = useState<DateRangePreset>('all')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'collection_high' | 'fee_high'>('newest')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [receiptOrder, setReceiptOrder] = useState<Order | null>(null)
  const [isBulkImportOpen, setIsBulkImportOpen] = useState(false)

  // New Order Form state
  const [customCode, setCustomCode] = useState('')
  const [shopId, setShopId] = useState(shops[0]?.id || '')
  const [driverId, setDriverId] = useState('')
  const [areaId, setAreaId] = useState(areas[0]?.id || '')
  const [netItemUsd, setNetItemUsd] = useState('25')
  const [deliveryFeeUsd, setDeliveryFeeUsd] = useState(String(areas[0]?.fee_usd || '3'))
  const [driverPayUsd, setDriverPayUsd] = useState('2')
  const [pricingMode, setPricingMode] = useState<'added' | 'free_delivery'>('added')
  const [recipientName, setRecipientName] = useState('')
  const [recipientPhone, setRecipientPhone] = useState('')
  const [recipientAddress, setRecipientAddress] = useState('')
  const [notes, setNotes] = useState('')
  const [serviceType, setServiceType] = useState<'delivery' | 'replacement' | 'pickup'>('delivery')
  const [weightKg, setWeightKg] = useState('1')
  const [isBreakable, setIsBreakable] = useState(false)
  const [carrierTrackingCode, setCarrierTrackingCode] = useState('')
  const [destinationTown, setDestinationTown] = useState('')
  const [phoneMatchedCustomer, setPhoneMatchedCustomer] = useState<{
    name: string
    address: string
    notes?: string | null
    orders_count?: number
    town?: string | null
  } | null>(null)

  // Driver Required Alert Modal (when changing status without a driver)
  const [isDriverRequiredModalOpen, setIsDriverRequiredModalOpen] = useState(false)
  const [driverRequiredOrder, setDriverRequiredOrder] = useState<Order | null>(null)
  const [pendingTargetStatus, setPendingTargetStatus] = useState<OrderStatus>('assigned')
  const [promptDriverId, setPromptDriverId] = useState(drivers[0]?.id || '')
  const [promptSubmitting, setPromptSubmitting] = useState(false)

  // Edit Order Modal state
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [editingOrder, setEditingOrder] = useState<Order | null>(null)
  const [editCode, setEditCode] = useState('')
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
  const [editServiceType, setEditServiceType] = useState<'delivery' | 'replacement' | 'pickup'>('delivery')
  const [editWeightKg, setEditWeightKg] = useState('1')
  const [editIsBreakable, setEditIsBreakable] = useState(false)
  const [editCarrierTrackingCode, setEditCarrierTrackingCode] = useState('')
  const [editDestinationTown, setEditDestinationTown] = useState('')
  const [editingSubmitting, setEditingSubmitting] = useState(false)
  const [editError, setEditError] = useState('')
  const [orderEvents, setOrderEvents] = useState<Array<{ id: string; old_status?: string | null; new_status: string; created_at: string }>>([])

  // Live Phone CRM Customer Lookup
  useEffect(() => {
    const clean = recipientPhone.replace(/[^0-9+]/g, '')
    if (clean.length < 6) {
      setPhoneMatchedCustomer(null)
      return
    }
    const timer = setTimeout(() => {
      fetch(`/api/customers/lookup?phone=${encodeURIComponent(clean)}`)
        .then(r => r.json())
        .then(d => {
          if (d && d.customer) {
            setPhoneMatchedCustomer(d.customer)
          } else {
            setPhoneMatchedCustomer(null)
          }
        })
        .catch(() => setPhoneMatchedCustomer(null))
    }, 350)
    return () => clearTimeout(timer)
  }, [recipientPhone])

  const canManage = userRole === 'owner' || userRole === 'manager'
  const isOwner = userRole === 'owner'

  // Bulk Selection & Batch Actions
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([])
  const [bulkDriverId, setBulkDriverId] = useState('')
  const [bulkLoading, setBulkLoading] = useState(false)
  const [bulkMessage, setBulkMessage] = useState('')

  // Warehouse Barcode Scanner Modal
  const [isScannerOpen, setIsScannerOpen] = useState(false)

  function handleToggleSelectAll() {
    if (selectedOrderIds.length === filteredOrders.length && filteredOrders.length > 0) {
      setSelectedOrderIds([])
    } else {
      setSelectedOrderIds(filteredOrders.map(o => o.id))
    }
  }

  function handleToggleSelectOrder(id: string) {
    setSelectedOrderIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  async function handleBulkExecute(action: 'assign_driver' | 'update_status', payload: { driverId?: string; status?: OrderStatus }) {
    if (selectedOrderIds.length === 0) return
    setBulkLoading(true)
    setBulkMessage('')
    try {
      const res = await fetch('/api/orders/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId,
          orderIds: selectedOrderIds,
          action,
          driverId: payload.driverId,
          status: payload.status,
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to execute bulk operation')

      const updatedMap = new Map((data.orders as any[]).map(o => [o.id, o]))
      setOrders(prev =>
        prev.map(o => {
          const upd = updatedMap.get(o.id)
          if (!upd) return o
          return {
            ...o,
            ...upd,
            driver: payload.driverId
              ? drivers.find(d => d.id === payload.driverId) || o.driver
              : o.driver,
          }
        })
      )

      setBulkMessage(`Updated ${data.count} orders successfully!`)
      setSelectedOrderIds([])
      setBulkDriverId('')
      setTimeout(() => setBulkMessage(''), 4000)
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Bulk update failed')
    } finally {
      setBulkLoading(false)
    }
  }

  async function handleDeleteOrders(targetIds: string[], codesLabel?: string) {
    if (targetIds.length === 0) return
    if (!isOwner) {
      alert('Only the workspace owner has permission to permanently delete order records.')
      return
    }
    const msg = targetIds.length === 1
      ? `Are you sure you want to permanently delete order ${codesLabel || ''}? This action is exclusive to the workspace owner and cannot be undone.`
      : `Are you sure you want to permanently delete these ${targetIds.length} order records? This action is exclusive to the workspace owner and cannot be undone.`

    if (!window.confirm(msg)) {
      return
    }

    setBulkLoading(true)
    try {
      const res = await fetch('/api/orders', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, orderIds: targetIds }),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Failed to delete orders')
      }

      // Remove permanently deleted records from UI state
      setOrders(prev => prev.filter(o => !targetIds.includes(o.id)))
      setSelectedOrderIds(prev => prev.filter(id => !targetIds.includes(id)))
      if (editingOrder && targetIds.includes(editingOrder.id)) {
        setEditingOrder(null)
      }
      setBulkMessage(data.message || `Deleted ${targetIds.length} order(s) permanently.`)
      setTimeout(() => setBulkMessage(''), 4000)
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Error deleting orders')
    } finally {
      setBulkLoading(false)
    }
  }

  const [autoAssigning, setAutoAssigning] = useState(false)

  async function handleAutoAssign() {
    setAutoAssigning(true)
    try {
      const res = await fetch('/api/orders/auto-assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Auto-assign failed')
      alert(data.message)
      if (data.count > 0) {
        window.location.reload()
      }
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Error running auto-dispatch')
    } finally {
      setAutoAssigning(false)
    }
  }

  function handleExportCsv() {
    if (filteredOrders.length === 0) {
      alert('No orders to export with current filters.')
      return
    }

    const headers = [
      'Order Code',
      'Date',
      'Status',
      'Shop',
      'Recipient Name',
      'Recipient Phone',
      'Recipient Address',
      'Destination Zone',
      'COD Collection USD',
      'Delivery Fee USD',
      'Courier Pay USD',
      'Company Margin USD',
      'Assigned Courier',
      'Notes',
    ]

    const rows = filteredOrders.map(o => [
      `"${o.code}"`,
      `"${new Date(o.created_at).toLocaleDateString('en-GB')}"`,
      `"${ORDER_STATUS_LABELS[o.status] || o.status}"`,
      `"${(o.shop?.name || '').replace(/"/g, '""')}"`,
      `"${(o.recipient_name || '').replace(/"/g, '""')}"`,
      `"${(o.recipient_phone || '').replace(/"/g, '""')}"`,
      `"${(o.recipient_address || '').replace(/"/g, '""')}"`,
      `"${(o.area?.name || '').replace(/"/g, '""')}"`,
      Number(o.collection_usd) || 0,
      Number(o.delivery_fee_usd) || 0,
      Number(o.driver_pay_usd) || 0,
      (Number(o.delivery_fee_usd) || 0) - (Number(o.driver_pay_usd) || 0),
      `"${(o.driver?.name || 'Unassigned').replace(/"/g, '""')}"`,
      `"${(o.notes || '').replace(/"/g, '""')}"`,
    ])

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', `cedar_orders_export_${new Date().toISOString().slice(0, 10)}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }



  // When area changes, update suggested delivery fee
  function handleAreaChange(newAreaId: string) {
    setAreaId(newAreaId)
    const sel = areas.find(a => a.id === newAreaId)
    if (sel) {
      setDeliveryFeeUsd(String(sel.fee_usd))
      setDriverPayUsd(String(Math.max(1, Number(sel.fee_usd) - 1)))
    }
  }

  // Modal Financial Computations
  const modalNetItemNum = Number(netItemUsd) || 0
  const modalFeeUsdNum = Number(deliveryFeeUsd) || 0
  const modalDriverPayNum = Number(driverPayUsd) || 0
  const modalCodUsd = pricingMode === 'added' ? modalNetItemNum + modalFeeUsdNum : modalNetItemNum
  const modalCodLbpApprox = modalCodUsd * rate
  const modalShopNetUsd = modalCodUsd - modalFeeUsdNum
  const modalCompanyMarginUsd = modalFeeUsdNum - modalDriverPayNum

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
          code: customCode.trim() || undefined,
          shopId: shopId || null,
          driverId: driverId || null,
          areaId: areaId || null,
          collectionUsd: modalCodUsd,
          deliveryFeeUsd: modalFeeUsdNum,
          driverPayUsd: modalDriverPayNum,
          recipientName,
          recipientPhone,
          recipientAddress,
          serviceType,
          weightKg: Number(weightKg) || 1.0,
          isBreakable,
          carrierTrackingCode: carrierTrackingCode.trim() || undefined,
          destinationTown: destinationTown.trim() || undefined,
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
      setCustomCode('')
      setRecipientName('')
      setRecipientPhone('')
      setRecipientAddress('')
      setNotes('')
      setServiceType('delivery')
      setWeightKg('1')
      setIsBreakable(false)
      setCarrierTrackingCode('')
      setDestinationTown('')
      setPhoneMatchedCustomer(null)
      setNetItemUsd('25')
      setPricingMode('added')
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
    setOrderEvents([])
    setEditCode(order.code || '')
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
    setEditServiceType(order.service_type || 'delivery')
    setEditWeightKg(String(order.weight_kg || '1'))
    setEditIsBreakable(Boolean(order.is_breakable))
    setEditCarrierTrackingCode(order.carrier_tracking_code || '')
    setEditDestinationTown(order.destination_town || '')
    setEditError('')
    setIsEditModalOpen(true)

    fetch(`/api/orders/${order.id}/events`)
      .then(r => r.json())
      .then(d => {
        if (d && Array.isArray(d.events)) {
          setOrderEvents(d.events)
        }
      })
      .catch(() => {})
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
        if (filter !== 'all') {
          if (filter === 'assigned') {
            if (o.status !== 'assigned' && o.status !== 'picked_up') return false
          } else if (filter === 'failed') {
            if (o.status !== 'failed' && o.status !== 'returned') return false
          } else if (o.status !== filter) {
            return false
          }
        }
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {canManage && (
            <button
              type="button"
              className="btn btn-secondary"
              disabled={autoAssigning}
              onClick={handleAutoAssign}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
              title="Automatically assign unassigned pending orders to their designated area courier"
            >
              <span>⚡</span>
              <span>{autoAssigning ? 'Auto-Dispatching…' : 'Auto-Assign by Area'}</span>
            </button>
          )}

          {canManage && (
            <button
              className="btn btn-secondary"
              onClick={() => setIsScannerOpen(true)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
              title="Open Barcode & QR Code Warehouse Scanner"
            >
              <ScanIcon size={14} />
              <span>Scan Barcode / QR</span>
            </button>
          )}
          {canManage && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleExportCsv}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
              title="Download current filtered orders as CSV for Excel"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              <span>Export CSV</span>
            </button>
          )}

          {canManage && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setIsBulkImportOpen(true)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
              title="Bulk Import Orders from CSV or Shopify Export"
            >
              <ShopifyIcon size={14} />
              <span>Import CSV / Shopify</span>
            </button>
          )}

          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              setSoundEnabled(prev => {
                const next = !prev
                if (next) playChime()
                return next
              })
            }}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13 }}
            title={soundEnabled ? 'Live Order Audio Alerts: Active (Click to mute)' : 'Live Order Audio Alerts: Muted (Click to enable)'}
          >
            <span>{soundEnabled ? '🔔 Sound On' : '🔕 Muted'}</span>
          </button>

          {canManage && (
            <Link href="/orders/new" className="btn btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="12" y1="5" x2="12" y2="19"/>
                <line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              New order
            </Link>
          )}
        </div>
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
          Pending ({orders.filter(o => o.status === 'pending').length})
        </button>
        <button
          className={`tab-btn ${filter === 'assigned' ? 'active' : ''}`}
          onClick={() => setFilter('assigned')}
        >
          Assigned ({orders.filter(o => o.status === 'assigned' || o.status === 'picked_up').length})
        </button>
        <button
          className={`tab-btn ${filter === 'delivered' ? 'active' : ''}`}
          onClick={() => setFilter('delivered')}
        >
          Delivered ({orders.filter(o => o.status === 'delivered').length})
        </button>
        <button
          className={`tab-btn ${filter === 'failed' ? 'active' : ''}`}
          onClick={() => setFilter('failed')}
        >
          Failed / Returned ({orders.filter(o => o.status === 'failed' || o.status === 'returned').length})
        </button>
        <button
          className={`tab-btn ${filter === 'cancelled' ? 'active' : ''}`}
          onClick={() => setFilter('cancelled')}
        >
          Cancelled ({orders.filter(o => o.status === 'cancelled').length})
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
              { id: 'custom', label: 'Custom Range' },
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
              <option value="newest">Newest First</option>
              <option value="oldest">Oldest First</option>
              <option value="collection_high">Highest COD Collection ($)</option>
              <option value="fee_high">Highest Delivery Fee ($)</option>
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
                {canManage && (
                  <th style={{ width: 36, textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={filteredOrders.length > 0 && selectedOrderIds.length === filteredOrders.length}
                      onChange={handleToggleSelectAll}
                      title="Select all orders in current filter"
                    />
                  </th>
                )}
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
                    {canManage && (
                      <td style={{ width: 36, textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={selectedOrderIds.includes(order.id)}
                          onChange={() => handleToggleSelectOrder(order.id)}
                        />
                      </td>
                    )}
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <Link
                          href={`/track/${order.tracking_token || order.code}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ fontWeight: 700, color: 'var(--brand)', textDecoration: 'none' }}
                          title="Open live customer tracking page"
                        >
                          {order.code} ↗
                        </Link>
                        {order.service_type === 'replacement' && (
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 2,
                              fontSize: 10,
                              fontWeight: 700,
                              background: 'rgba(217, 119, 6, 0.15)',
                              color: '#b45309',
                              padding: '1px 6px',
                              borderRadius: 4,
                              border: '1px solid rgba(217, 119, 6, 0.3)',
                            }}
                            title="Replacement / Exchange Item (Driver collects old item)"
                          >
                            🔄 Swap
                          </span>
                        )}
                        {order.service_type === 'pickup' && (
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 2,
                              fontSize: 10,
                              fontWeight: 700,
                              background: 'rgba(124, 58, 237, 0.15)',
                              color: '#7c3aed',
                              padding: '1px 6px',
                              borderRadius: 4,
                              border: '1px solid rgba(124, 58, 237, 0.3)',
                            }}
                            title="Return Pickup from Customer"
                          >
                            📦 Pickup
                          </span>
                        )}
                        {order.is_breakable && (
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 2,
                              fontSize: 10,
                              fontWeight: 700,
                              background: 'rgba(220, 38, 38, 0.12)',
                              color: '#dc2626',
                              padding: '1px 5px',
                              borderRadius: 4,
                              border: '1px solid rgba(220, 38, 38, 0.25)',
                            }}
                            title="Fragile / Breakable Content"
                          >
                            ⚠️ Fragile
                          </span>
                        )}
                        {order.weight_kg && order.weight_kg > 1 && (
                          <span
                            style={{
                              fontSize: 10,
                              fontWeight: 600,
                              color: 'var(--muted)',
                              padding: '1px 4px',
                              background: 'var(--bg)',
                              borderRadius: 4,
                              border: '1px solid var(--line)',
                            }}
                            title="Package Weight"
                          >
                            ⚖️ {order.weight_kg}kg
                          </span>
                        )}
                        {order.carrier_tracking_code && (
                          <span
                            style={{
                              fontSize: 10,
                              fontWeight: 700,
                              color: '#2563eb',
                              background: 'rgba(37, 99, 235, 0.1)',
                              padding: '1px 6px',
                              borderRadius: 4,
                              border: '1px solid rgba(37, 99, 235, 0.25)',
                            }}
                            title={`External Carrier Tracking: ${order.carrier_name || 'Octopus'}`}
                          >
                            🚚 {order.carrier_tracking_code}
                          </span>
                        )}
                        {order.shopify_order_number && (
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 3,
                              fontSize: 10,
                              fontWeight: 700,
                              background: 'rgba(150, 191, 54, 0.15)',
                              color: '#5e8e3e',
                              padding: '1px 6px',
                              borderRadius: 4,
                              border: '1px solid rgba(150, 191, 54, 0.3)',
                            }}
                            title={`Shopify Order #${order.shopify_order_number}`}
                          >
                            <ShopifyIcon size={10} />
                            <span>#{order.shopify_order_number}</span>
                          </span>
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
                          <a
                            href={getGoogleMapsDirectionsUrl(order.recipient_address)}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                              color: '#2563eb',
                              textDecoration: 'none',
                              background: '#eff6ff',
                              padding: '1px 6px',
                              borderRadius: 4,
                              border: '1px solid #bfdbfe',
                              fontSize: 10.5,
                              fontWeight: 600,
                              maxWidth: 220,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                            title="Open 1-Tap Google Maps Directions"
                          >
                            <GoogleMapsIcon size={11} />
                            <span>{formatDisplayAddress(order.recipient_address)}</span>
                          </a>
                          <a
                            href={getWazeDirectionsUrl(order.recipient_address)}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 2,
                              color: '#0284c7',
                              textDecoration: 'none',
                              background: '#f0f9ff',
                              padding: '1px 5px',
                              borderRadius: 4,
                              border: '1px solid #bae6fd',
                              fontSize: 10,
                              fontWeight: 700,
                            }}
                            title="Open Waze Turn-by-Turn Navigation"
                          >
                            Waze
                          </a>
                        </div>
                      )}
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
                            Needs Courier
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
                        <option value="cancelled">Cancelled</option>
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
                      <small suppressHydrationWarning>{new Date(order.created_at).toLocaleDateString('en-GB')}</small>
                    </td>

                    {/* Actions: Slip, Edit & Track */}
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <button
                          type="button"
                          className="btn btn-ghost"
                          onClick={() => setReceiptOrder(order)}
                          style={{ fontSize: 11, padding: '4px 8px', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                          title="View / Print Barcode & QR Code Waybill Receipt"
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                            <polyline points="6 9 6 2 18 2 18 9" />
                            <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                            <rect x="6" y="14" width="12" height="8" />
                          </svg>
                          Slip
                        </button>
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
                          href={`/track/${order.tracking_token || order.code}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn btn-ghost"
                          style={{ fontSize: 11, padding: '4px 8px' }}
                          title="Open public tracking"
                        >
                          Track
                        </Link>
                        {isOwner && (
                          <button
                            type="button"
                            className="btn btn-ghost"
                            onClick={() => handleDeleteOrders([order.id], '#' + order.code)}
                            style={{ fontSize: 11, padding: '4px 8px', color: '#dc2626' }}
                            title="Permanently delete record (Owner Only)"
                          >
                            <TrashIcon size={13} color="#dc2626" />
                          </button>
                        )}
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

      {/* ─── FLOATING BATCH ACTIONS TOOLBAR (WHEN ORDERS SELECTED) ─── */}
      {selectedOrderIds.length > 0 && canManage && (
        <div
          style={{
            position: 'sticky',
            bottom: 24,
            zIndex: 40,
            background: '#111827',
            color: '#ffffff',
            padding: '12px 20px',
            borderRadius: 10,
            boxShadow: '0 12px 36px rgba(0,0,0,0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
            flexWrap: 'wrap',
            margin: '0 0 20px',
            border: '1px solid rgba(255,255,255,0.1)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span
              style={{
                fontWeight: 800,
                fontSize: 12.5,
                background: 'var(--brand)',
                color: '#fff',
                padding: '3px 10px',
                borderRadius: 99,
              }}
            >
              {selectedOrderIds.length} Orders Selected
            </span>
            <button
              type="button"
              onClick={() => setSelectedOrderIds([])}
              style={{
                background: 'none',
                border: 'none',
                color: '#9ca3af',
                fontSize: 12,
                cursor: 'pointer',
                textDecoration: 'underline',
              }}
            >
              Deselect All
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            {/* Bulk Assign Driver */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <select
                value={bulkDriverId}
                onChange={e => setBulkDriverId(e.target.value)}
                style={{
                  fontSize: 12,
                  padding: '6px 10px',
                  borderRadius: 6,
                  border: '1px solid #374151',
                  background: '#1f2937',
                  color: '#fff',
                }}
              >
                <option value="">Assign Courier…</option>
                {drivers.map(d => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={!bulkDriverId || bulkLoading}
                onClick={() => handleBulkExecute('assign_driver', { driverId: bulkDriverId })}
                className="btn btn-secondary btn-sm"
                style={{ fontSize: 12 }}
              >
                Assign
              </button>
            </div>

            {/* Bulk Status Updates */}
            <button
              type="button"
              disabled={bulkLoading}
              onClick={() => handleBulkExecute('update_status', { status: 'picked_up' })}
              className="btn btn-secondary btn-sm"
              style={{ fontSize: 12 }}
            >
              Mark Picked Up
            </button>

            <button
              type="button"
              disabled={bulkLoading}
              onClick={() => handleBulkExecute('update_status', { status: 'delivered' })}
              className="btn btn-primary btn-sm"
              style={{ fontSize: 12 }}
            >
              Mark Delivered
            </button>

            <button
              type="button"
              disabled={bulkLoading}
              onClick={() => handleBulkExecute('update_status', { status: 'returned' })}
              className="btn btn-ghost btn-sm"
              style={{ fontSize: 12, color: '#f87171' }}
            >
              Mark Returned
            </button>

            {/* Batch Waybills Print */}
            <Link
              href={`/print/bulk?ids=${selectedOrderIds.join(',')}`}
              target="_blank"
              className="btn btn-secondary btn-sm"
              style={{
                fontSize: 12,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                textDecoration: 'none',
                color: '#fff',
                background: '#374151',
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="6 9 6 2 18 2 18 9" />
                <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                <rect x="6" y="14" width="12" height="8" />
              </svg>
              Print All ({selectedOrderIds.length}) Waybills
            </Link>

            {/* Batch Delete Orders */}
            {isOwner && (
              <button
                type="button"
                disabled={bulkLoading}
                onClick={() => handleDeleteOrders(selectedOrderIds)}
                className="btn btn-ghost btn-sm"
                style={{
                  fontSize: 12,
                  color: '#fca5a5',
                  background: 'rgba(239, 68, 68, 0.18)',
                  border: '1px solid rgba(239, 68, 68, 0.35)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                }}
                title="Permanently delete selected records (Owner Only)"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
                <span>Delete Selected ({selectedOrderIds.length})</span>
              </button>
            )}
          </div>
        </div>
      )}

      {bulkMessage && (
        <div
          style={{
            background: '#ecfdf5',
            color: '#065f46',
            border: '1px solid #86efac',
            padding: '10px 16px',
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 600,
            marginBottom: 20,
          }}
        >
          {bulkMessage}
        </div>
      )}

      {/* ─── MODAL: WAREHOUSE BARCODE & QR SCANNER ─── */}
      <BarcodeScannerModal
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        orders={orders}
        drivers={drivers}
        workspaceId={workspaceId}
        onOrderUpdated={updated => {
          setOrders(prev => prev.map(o => (o.id === updated.id ? { ...o, ...updated } : o)))
        }}
      />

      {/* ─── MODAL: WARNING DRIVER REQUIRED ─── */}
      <Modal
        isOpen={isDriverRequiredModalOpen}
        onClose={() => {
          setIsDriverRequiredModalOpen(false)
          setDriverRequiredOrder(null)
        }}
        title="Driver Assignment Required"
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
                <option value="delivery">🚚 Standard Delivery</option>
                <option value="replacement">🔄 Replacement / Exchange (تبديل)</option>
                <option value="pickup">📦 Return Pickup (استلام مرتجع)</option>
              </select>
            </div>

            <div className="field">
              <label>Weight (KG)</label>
              <input
                type="number"
                step="0.5"
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
                  ⚠️ Fragile / Breakable (قابل للكسر)
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
                        {evt.old_status ? `${evt.old_status} ➔ ${evt.new_status}` : `Order created as ${evt.new_status}`}
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
                <strong style={{ fontSize: 12, display: 'block' }}>Retail Return / Refund Pickup?</strong>
                <small style={{ color: 'var(--muted)', fontSize: 11 }}>Automatically set fee to $2.00, customer COD to $0.00, and courier pay to $1.00</small>
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  setNetItemUsd('0')
                  setDeliveryFeeUsd('2')
                  setDriverPayUsd('1')
                  setPricingMode('added')
                  setNotes('Retail return pickup ($2 fee)')
                }}
                style={{ fontSize: 11, padding: '4px 10px', borderColor: 'var(--brand)', color: 'var(--brand)', fontWeight: 600 }}
              >
                Apply $2 Refund Preset
              </button>
            </div>

            {/* Custom Tracking Code / Waybill # */}
            <div className="field full" style={{ background: 'var(--bg)', padding: 12, borderRadius: 'var(--radius-sm)', border: '1.5px solid var(--line)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <label style={{ margin: 0, fontWeight: 700, fontSize: 13, color: 'var(--text)' }}>
                  Custom Tracking Code / Waybill # <span style={{ fontWeight: 400, color: 'var(--muted)', fontSize: 11 }}>(Optional)</span>
                </label>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => {
                      const selectedShop = shops.find(s => s.id === shopId)
                      const prefix = selectedShop ? selectedShop.name.replace(/[^a-zA-Z0-9]/g, '').slice(0, 4).toUpperCase() : 'ORD'
                      const randomNum = Math.floor(100 + Math.random() * 900)
                      setCustomCode(`${prefix}-${randomNum}`)
                    }}
                    style={{ fontSize: 11, padding: '2px 8px' }}
                    title="Generate code with shop prefix (e.g. ZARA-101)"
                  >
                    Shop Prefix
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => {
                      const randomHex = Math.random().toString(16).substring(2, 10).toUpperCase()
                      setCustomCode(`CD-${randomHex}`)
                    }}
                    style={{ fontSize: 11, padding: '2px 8px' }}
                    title="Generate standard Cedar CD-XXXX code"
                  >
                    Auto CD-XXXX
                  </button>
                  {customCode && (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => setCustomCode('')}
                      style={{ fontSize: 11, padding: '2px 8px', color: '#dc2626' }}
                      title="Clear custom code (auto-generate upon creation)"
                    >
                      ✕ Clear
                    </button>
                  )}
                </div>
              </div>
              <input
                type="text"
                placeholder="Leave empty for auto CD-XXXX, or enter custom code (e.g. ZARA-101, INV-4022)"
                value={customCode}
                onChange={e => setCustomCode(e.target.value.toUpperCase())}
                style={{ fontFamily: 'monospace', fontWeight: 600, letterSpacing: '0.5px' }}
              />
              <small style={{ color: 'var(--muted)', fontSize: 11, display: 'block', marginTop: 4 }}>
                A private customer tracking link will be generated after creation.
              </small>
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
                <option value="">Unassigned (Dispatch later)</option>
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

            {/* Pricing Mode Selector */}
            <div style={{ gridColumn: '1 / -1', background: 'var(--bg)', padding: 10, borderRadius: 8, border: '1px solid var(--line)' }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--brand)', marginBottom: 6 }}>
                Delivery Fee Allocation / احتساب كلفة التوصيل
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8 }}>
                <button
                  type="button"
                  onClick={() => setPricingMode('added')}
                  style={{
                    padding: '8px 10px',
                    borderRadius: 6,
                    border: '1.5px solid',
                    borderColor: pricingMode === 'added' ? '#2563eb' : 'var(--line)',
                    background: pricingMode === 'added' ? 'rgba(37, 99, 235, 0.08)' : 'var(--surface)',
                    color: pricingMode === 'added' ? '#1d4ed8' : 'var(--text)',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  🚚 Fee Added to Customer (كلفة التوصيل على الزبون)
                  <div style={{ fontSize: 10.5, fontWeight: 400, color: 'var(--muted)', marginTop: 2 }}>
                    Customer pays Net (${modalNetItemNum}) + Fee (${modalFeeUsdNum}) = <strong>${modalCodUsd} COD</strong>. Shop gets full <strong>${modalNetItemNum}</strong>.
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setPricingMode('free_delivery')}
                  style={{
                    padding: '8px 10px',
                    borderRadius: 6,
                    border: '1.5px solid',
                    borderColor: pricingMode === 'free_delivery' ? '#059669' : 'var(--line)',
                    background: pricingMode === 'free_delivery' ? 'rgba(5, 150, 105, 0.08)' : 'var(--surface)',
                    color: pricingMode === 'free_delivery' ? '#047857' : 'var(--text)',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  🎁 Free Delivery / Shop Pays (توصيل مجاني - على المتجر)
                  <div style={{ fontSize: 10.5, fontWeight: 400, color: 'var(--muted)', marginTop: 2 }}>
                    Customer pays only goods (${modalNetItemNum}). Fee deducted from shop payout (Shop gets <strong>${modalShopNetUsd}</strong>).
                  </div>
                </button>
              </div>
            </div>

            <div className="field">
              <label style={{ fontWeight: 700, color: '#0f172a' }}>
                📦 Net Item Price / سعر البضاعة (USD) <span style={{ color: 'var(--danger)' }}>*</span>
              </label>
              <input
                type="number"
                step="0.5"
                min="0"
                value={netItemUsd}
                onChange={e => setNetItemUsd(e.target.value)}
                required
                style={{ fontWeight: 700 }}
              />
              <span style={{ fontSize: 11, color: '#0284c7', marginTop: 4 }}>
                Shop payout: {formatUSD(modalNetItemNum)}
              </span>
            </div>

            <div className="field">
              <label style={{ fontWeight: 700, color: '#0f172a' }}>
                🚚 Delivery Fee / كلفة التوصيل (USD) <span style={{ color: 'var(--danger)' }}>*</span>
              </label>
              <input
                type="number"
                step="0.5"
                min="0"
                value={deliveryFeeUsd}
                onChange={e => setDeliveryFeeUsd(e.target.value)}
                required
                style={{ fontWeight: 700 }}
              />
              <span style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
                Zone tariff: ${deliveryFeeUsd}
              </span>
            </div>

            <div className="field">
              <label style={{ fontWeight: 700, color: '#166534' }}>
                💵 Total COD to Collect (USD) <span style={{ color: 'var(--danger)' }}>*</span>
              </label>
              <div style={{ padding: '8px 12px', background: '#ecfdf5', border: '1.5px solid #86efac', borderRadius: 6 }}>
                <span style={{ fontSize: 16, fontWeight: 800, color: '#166534' }}>{formatUSD(modalCodUsd)}</span>
                <span style={{ fontSize: 11, color: '#0284c7', marginLeft: 8 }}>
                  ≈ L.L. {modalCodLbpApprox.toLocaleString()}
                </span>
              </div>
            </div>

            <div className="field">
              <label style={{ fontWeight: 700, color: '#0f172a' }}>
                🚴 Courier Pay / Driver Commission (USD) <span style={{ color: 'var(--danger)' }}>*</span>
              </label>
              <input
                type="number"
                step="0.5"
                min="0"
                value={driverPayUsd}
                onChange={e => setDriverPayUsd(e.target.value)}
                required
                style={{ fontWeight: 700 }}
              />
              <span style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
                Courier run-sheet earning
              </span>
            </div>

            {/* Live Settlement Breakdown */}
            <div
              className="field full"
              style={{
                background: '#0f172a',
                color: '#ffffff',
                padding: '12px 16px',
                borderRadius: 10,
                fontSize: 12,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 8,
              }}
            >
              <div>
                <span style={{ color: '#94a3b8' }}>Net Goods:</span> <strong>{formatUSD(modalNetItemNum)}</strong>
                <span style={{ margin: '0 8px', color: '#64748b' }}>•</span>
                <span style={{ color: '#94a3b8' }}>Fee ({pricingMode === 'added' ? 'Customer' : 'Shop'}):</span> <strong style={{ color: pricingMode === 'added' ? '#38bdf8' : '#f87171' }}>{pricingMode === 'added' ? `+${formatUSD(modalFeeUsdNum)}` : `-${formatUSD(modalFeeUsdNum)}`}</strong>
                <span style={{ margin: '0 8px', color: '#64748b' }}>•</span>
                <span style={{ color: '#4ade80' }}>Total COD:</span> <strong style={{ color: '#4ade80' }}>{formatUSD(modalCodUsd)}</strong>
              </div>
              <div>
                <span style={{ color: '#38bdf8' }}>🏪 Shop Net:</span> <strong style={{ color: '#4ade80' }}>{formatUSD(modalShopNetUsd)}</strong>
                <span style={{ margin: '0 8px', color: '#64748b' }}>•</span>
                <span style={{ color: '#94a3b8' }}>🚴 Courier:</span> <strong style={{ color: '#facc15' }}>{formatUSD(modalDriverPayNum)}</strong>
                <span style={{ margin: '0 8px', color: '#64748b' }}>•</span>
                <span style={{ color: '#94a3b8' }}>📈 Margin:</span> <strong style={{ color: '#60a5fa' }}>{formatUSD(modalCompanyMarginUsd)}</strong>
              </div>
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

            {phoneMatchedCustomer && (
              <div
                className="field full"
                style={{
                  background: 'rgba(37, 99, 235, 0.08)',
                  border: '1.5px solid rgba(37, 99, 235, 0.3)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '8px 12px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                  marginTop: -4,
                }}
              >
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#1d4ed8' }}>
                    👥 Repeat Customer Detected: {phoneMatchedCustomer.name}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                    {phoneMatchedCustomer.orders_count || 1} past orders · {phoneMatchedCustomer.address || 'Address on file'}
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  style={{ fontSize: 11, padding: '4px 10px', whiteSpace: 'nowrap' }}
                  onClick={() => {
                    if (phoneMatchedCustomer.name) setRecipientName(phoneMatchedCustomer.name)
                    if (phoneMatchedCustomer.address) setRecipientAddress(phoneMatchedCustomer.address)
                    if (phoneMatchedCustomer.notes && !notes) setNotes(phoneMatchedCustomer.notes)
                    setPhoneMatchedCustomer(null)
                  }}
                >
                  ⚡ Auto-Fill Details
                </button>
              </div>
            )}

            {/* Service Type Selector */}
            <div className="field full" style={{ background: 'var(--bg)', padding: 12, borderRadius: 'var(--radius-sm)', border: '1px solid var(--line)' }}>
              <label style={{ fontWeight: 700, color: 'var(--brand)', marginBottom: 6, display: 'block' }}>
                Service Type / نوع الطلب
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                <button
                  type="button"
                  onClick={() => setServiceType('delivery')}
                  style={{
                    padding: '8px 10px',
                    borderRadius: 6,
                    border: '1.5px solid',
                    borderColor: serviceType === 'delivery' ? 'var(--brand)' : 'var(--line)',
                    background: serviceType === 'delivery' ? 'var(--brand-light)' : 'var(--surface)',
                    color: serviceType === 'delivery' ? 'var(--brand)' : 'var(--text)',
                    fontWeight: serviceType === 'delivery' ? 700 : 500,
                    fontSize: 12,
                    cursor: 'pointer',
                    textAlign: 'center',
                  }}
                >
                  🚚 Delivery
                </button>
                <button
                  type="button"
                  onClick={() => setServiceType('replacement')}
                  style={{
                    padding: '8px 10px',
                    borderRadius: 6,
                    border: '1.5px solid',
                    borderColor: serviceType === 'replacement' ? '#d97706' : 'var(--line)',
                    background: serviceType === 'replacement' ? 'rgba(217, 119, 6, 0.15)' : 'var(--surface)',
                    color: serviceType === 'replacement' ? '#b45309' : 'var(--text)',
                    fontWeight: serviceType === 'replacement' ? 700 : 500,
                    fontSize: 12,
                    cursor: 'pointer',
                    textAlign: 'center',
                  }}
                >
                  🔄 Replacement (تبديل)
                </button>
                <button
                  type="button"
                  onClick={() => setServiceType('pickup')}
                  style={{
                    padding: '8px 10px',
                    borderRadius: 6,
                    border: '1.5px solid',
                    borderColor: serviceType === 'pickup' ? '#7c3aed' : 'var(--line)',
                    background: serviceType === 'pickup' ? 'rgba(124, 58, 237, 0.15)' : 'var(--surface)',
                    color: serviceType === 'pickup' ? '#7c3aed' : 'var(--text)',
                    fontWeight: serviceType === 'pickup' ? 700 : 500,
                    fontSize: 12,
                    cursor: 'pointer',
                    textAlign: 'center',
                  }}
                >
                  📦 Return Pickup (مرتجع)
                </button>
              </div>
            </div>

            <div className="field">
              <label>Package Weight (KG)</label>
              <input
                type="number"
                step="0.5"
                min="0.1"
                value={weightKg}
                onChange={e => setWeightKg(e.target.value)}
              />
            </div>

            <div className="field" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', margin: 0 }}>
                <input
                  type="checkbox"
                  checked={isBreakable}
                  onChange={e => setIsBreakable(e.target.checked)}
                  style={{ width: 18, height: 18, accentColor: '#dc2626' }}
                />
                <span style={{ fontWeight: 700, color: isBreakable ? '#dc2626' : 'var(--text)' }}>
                  ⚠️ Fragile / Breakable (قابل للكسر)
                </span>
              </label>
              <small style={{ color: 'var(--muted)', fontSize: 11, marginTop: 4 }}>
                Prints a bold fragile warning banner on the thermal AWB label.
              </small>
            </div>

            <div className="field full">
              <label>Carrier Tracking Code (3PL / Octopus Code)</label>
              <input
                type="text"
                placeholder="e.g. 220222385920 (Optional external courier tracking code)"
                value={carrierTrackingCode}
                onChange={e => setCarrierTrackingCode(e.target.value)}
              />
            </div>

            <div className="field full">
              <LocationHelper
                id="new-recipient-address"
                address={recipientAddress}
                onAddressChange={setRecipientAddress}
                label="Delivery Address / Google Maps Pin"
                placeholder="e.g. Achrafieh, Sassine Square, Bldg 12 or paste Google Maps link"
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

      {/* ─── MODAL: ORDER WAYBILL RECEIPT SLIP (BARCODE & QR CODE) ─── */}
      {receiptOrder && (
        <Modal
          isOpen={!!receiptOrder}
          onClose={() => setReceiptOrder(null)}
          title={`Waybill Receipt #${receiptOrder.code}`}
        >
          <div style={{ maxHeight: '82vh', overflowY: 'auto', padding: '6px 2px' }}>
            <OrderReceiptSlip
              order={receiptOrder}
              workspaceRate={rate}
              workspaceName="Cedar Delivery Desk"
            />
          </div>
        </Modal>
      )}

      {/* ─── MODAL: BULK CSV / SHOPIFY ORDER IMPORT ─── */}
      <BulkOrderImportModal
        isOpen={isBulkImportOpen}
        onClose={() => setIsBulkImportOpen(false)}
        workspaceId={workspaceId}
        shops={shops}
        onImportComplete={() => window.location.reload()}
      />
    </>
  )
}
