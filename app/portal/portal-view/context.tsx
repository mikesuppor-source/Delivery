'use client'

import React, { createContext, useContext, useState, useMemo, useEffect, type ReactNode } from 'react'
import type { Shop, DeliveryArea, PortalOrder, PortalClientProps } from './types'
import { usdToLbp } from '@/lib/utils'
import { isValidLebanesePhone } from '@/lib/phone'

interface PortalContextType {
  shop: Shop
  orders: PortalOrder[]
  setOrders: React.Dispatch<React.SetStateAction<PortalOrder[]>>
  areas: DeliveryArea[]
  specialPrices: Array<{ area_id: string; fee_usd: number }>
  rate: number
  workspaceName: string

  search: string
  setSearch: (s: string) => void
  statusFilter: string
  setStatusFilter: (f: string) => void
  filteredOrders: PortalOrder[]

  selectedOrderIds: string[]
  setSelectedOrderIds: React.Dispatch<React.SetStateAction<string[]>>
  isAllSelected: boolean
  toggleSelectAll: () => void
  toggleSelectOrder: (id: string) => void
  handlePrintSelected: () => void
  handleExportCSV: () => void
  handleDownloadTemplate: () => void
  handleDeleteOrders: (targetIds: string[], codesLabel?: string) => Promise<void>
  isDeleting: boolean
  handleCancelOrder: (orderId: string) => Promise<void>
  isCancelling: boolean
  cancelError: string
  setCancelError: (e: string) => void

  // Modals
  isModalOpen: boolean
  setIsModalOpen: (o: boolean) => void
  isShopifyModalOpen: boolean
  setIsShopifyModalOpen: (o: boolean) => void
  isBulkImportModalOpen: boolean
  setIsBulkImportModalOpen: (o: boolean) => void
  isCashoutModalOpen: boolean
  setIsCashoutModalOpen: (o: boolean) => void
  openCashoutModal: () => void

  // Pickup Request Modal
  isPickupModalOpen: boolean
  setIsPickupModalOpen: (o: boolean) => void
  pickupCount: number
  setPickupCount: (n: number) => void
  pickupNote: string
  setPickupNote: (s: string) => void
  isSubmittingPickup: boolean
  pickupSuccess: string
  pickupError: string
  recentPickups: any[]
  handleRequestPickup: (e: React.FormEvent) => Promise<void>

  confirmedOrder: PortalOrder | null
  setConfirmedOrder: (o: PortalOrder | null) => void
  inspectingOrder: PortalOrder | null
  setInspectingOrder: (o: PortalOrder | null) => void

  // Order creation form
  recipientName: string
  setRecipientName: (n: string) => void
  recipientPhone: string
  setRecipientPhone: (p: string) => void
  recipientAddress: string
  setRecipientAddress: (a: string) => void
  areaId: string
  setAreaId: (id: string) => void
  selectedArea: DeliveryArea | undefined
  deliveryFeeUSD: number
  deliveryFeeLBP: number
  currencyMode: 'USD' | 'LBP'
  setCurrencyMode: (c: 'USD' | 'LBP') => void
  rawAmount: string
  setRawAmount: (a: string) => void
  feePayerMode: 'customer' | 'shop'
  setFeePayerMode: (m: 'customer' | 'shop') => void
  codUSD: number
  codLBP: number
  netPayoutUSD: number
  netPayoutLBP: number
  notes: string
  setNotes: (n: string) => void
  customCode: string
  setCustomCode: (c: string) => void
  serviceType: 'delivery' | 'replacement' | 'pickup'
  setServiceType: (s: 'delivery' | 'replacement' | 'pickup') => void
  weightKg: string
  setWeightKg: (w: string) => void
  isBreakable: boolean
  setIsBreakable: (b: boolean) => void
  phoneMatchedCustomer: {
    name: string
    address: string
    notes?: string | null
    orders_count?: number
  } | null
  setPhoneMatchedCustomer: React.Dispatch<React.SetStateAction<{
    name: string
    address: string
    notes?: string | null
    orders_count?: number
  } | null>>
  isPhoneValid: boolean | null
  isSubmitting: boolean
  formError: string
  setFormError: (e: string) => void
  handleCreateOrder: (e: React.FormEvent) => Promise<void>

  // Cashout
  cashoutAmountUsd: string
  setCashoutAmountUsd: React.Dispatch<React.SetStateAction<string>>
  cashoutMethod: 'whish' | 'omt' | 'cash_office' | 'bank_transfer'
  setCashoutMethod: (m: 'whish' | 'omt' | 'cash_office' | 'bank_transfer') => void
  cashoutAccountDetails: string
  setCashoutAccountDetails: (d: string) => void
  cashoutNotes: string
  setCashoutNotes: (n: string) => void
  cashoutAvailableUsd: number
  cashoutAvailableLbp: number
  cashoutSubmitting: boolean
  cashoutError: string
  cashoutSuccess: string
  cashoutHistory: Array<{
    id: string
    amount_usd: number
    amount_lbp: number
    method: string
    status: string
    created_at: string
    account_details: string
  }>
  handleRequestCashout: (e: React.FormEvent) => Promise<void>

  // Metrics
  totalOrdersCount: number
  pendingCount: number
  inTransitCount: number
  deliveredCount: number
  returnedCount: number
  returnedWaitingCount: number
  returnedThisMonthCount: number
  totalCollectedUSD: number
}

const PortalContext = createContext<PortalContextType | null>(null)

export function PortalProvider({
  shop,
  initialOrders,
  areas,
  specialPrices = [],
  rate,
  workspaceName,
  children,
}: PortalClientProps & { children: ReactNode }) {
  const [orders, setOrders] = useState<PortalOrder[]>(initialOrders)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isShopifyModalOpen, setIsShopifyModalOpen] = useState(false)
  const [isBulkImportModalOpen, setIsBulkImportModalOpen] = useState(false)

  // Pickup Request Modal State
  const [isPickupModalOpen, setIsPickupModalOpen] = useState(false)
  const [pickupCount, setPickupCount] = useState<number>(1)
  const [pickupNote, setPickupNote] = useState('')
  const [isSubmittingPickup, setIsSubmittingPickup] = useState(false)
  const [pickupSuccess, setPickupSuccess] = useState('')
  const [pickupError, setPickupError] = useState('')
  const [recentPickups, setRecentPickups] = useState<any[]>([])

  const fetchPickups = React.useCallback(async () => {
    try {
      const res = await fetch(`/api/pickups?shopId=${shop.id}&workspaceId=${shop.workspace_id}`)
      const data = await res.json()
      if (data.pickups) setRecentPickups(data.pickups)
    } catch (_err) {
      void _err
    }
  }, [shop.id, shop.workspace_id])

  useEffect(() => {
    fetchPickups()
  }, [fetchPickups])

  async function handleRequestPickup(e: React.FormEvent) {
    e.preventDefault()
    setIsSubmittingPickup(true)
    setPickupError('')
    setPickupSuccess('')
    try {
      const res = await fetch('/api/pickups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId: shop.workspace_id,
          shopId: shop.id,
          parcelCount: Number(pickupCount) || 1,
          note: pickupNote.trim() || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to request pickup')
      setPickupSuccess(`Pickup requested for ${pickupCount} parcel${Number(pickupCount) === 1 ? '' : 's'}! A courier will be assigned.`)
      fetchPickups()
      setTimeout(() => {
        setIsPickupModalOpen(false)
        setPickupSuccess('')
        setPickupNote('')
      }, 2000)
    } catch (err: unknown) {
      setPickupError(err instanceof Error ? err.message : 'Error requesting pickup')
    } finally {
      setIsSubmittingPickup(false)
    }
  }

  // Order creation state
  const [recipientName, setRecipientName] = useState('')
  const [recipientPhone, setRecipientPhone] = useState('')
  const [recipientAddress, setRecipientAddress] = useState('')
  const [areaId, setAreaId] = useState(areas[0]?.id || '')
  const [currencyMode, setCurrencyMode] = useState<'USD' | 'LBP'>('USD')
  const [rawAmount, setRawAmount] = useState('')
  const [feePayerMode, setFeePayerMode] = useState<'customer' | 'shop'>('customer')
  const [notes, setNotes] = useState('')
  const [customCode, setCustomCode] = useState('')
  const [serviceType, setServiceType] = useState<'delivery' | 'replacement' | 'pickup'>('delivery')
  const [weightKg, setWeightKg] = useState('')
  const [isBreakable, setIsBreakable] = useState(false)
  const [phoneMatchedCustomer, setPhoneMatchedCustomer] = useState<{
    name: string
    address: string
    notes?: string | null
    orders_count?: number
  } | null>(null)

  // Cash-Out state
  const [isCashoutModalOpen, setIsCashoutModalOpen] = useState(false)
  const [cashoutAmountUsd, setCashoutAmountUsd] = useState('')
  const [cashoutMethod, setCashoutMethod] = useState<'whish' | 'omt' | 'cash_office' | 'bank_transfer'>('whish')
  const [cashoutAccountDetails, setCashoutAccountDetails] = useState('')
  const [cashoutNotes, setCashoutNotes] = useState('')
  const [cashoutAvailableUsd, setCashoutAvailableUsd] = useState(0)
  const [cashoutAvailableLbp, setCashoutAvailableLbp] = useState(0)
  const [cashoutSubmitting, setCashoutSubmitting] = useState(false)
  const [cashoutError, setCashoutError] = useState('')
  const [cashoutSuccess, setCashoutSuccess] = useState('')
  const [cashoutHistory, setCashoutHistory] = useState<
    Array<{
      id: string
      amount_usd: number
      amount_lbp: number
      method: string
      status: string
      created_at: string
      account_details: string
    }>
  >([])

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

  function openCashoutModal() {
    setCashoutError('')
    setCashoutSuccess('')
    setIsCashoutModalOpen(true)
    fetch('/api/portal/cashout')
      .then(r => r.json())
      .then(d => {
        if (d) {
          setCashoutAvailableUsd(d.availableUsd || 0)
          setCashoutAvailableLbp(d.availableLbp || 0)
          setCashoutHistory(d.requests || [])
          if (d.availableUsd > 0) {
            setCashoutAmountUsd(current => current || String(d.availableUsd))
          }
        }
      })
      .catch(() => {})
  }

  async function handleRequestCashout(e: React.FormEvent) {
    e.preventDefault()
    setCashoutError('')
    setCashoutSuccess('')
    const amt = parseFloat(cashoutAmountUsd) || 0
    if (amt <= 0) {
      setCashoutError('Please enter a valid payout amount greater than $0.00.')
      return
    }
    if (!cashoutAccountDetails.trim()) {
      setCashoutError('Please enter your transfer account details or recipient phone number.')
      return
    }

    setCashoutSubmitting(true)
    try {
      const res = await fetch('/api/portal/cashout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amountUsd: amt,
          method: cashoutMethod,
          accountDetails: cashoutAccountDetails,
          notes: cashoutNotes,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to submit payout request')
      setCashoutSuccess(data.message || 'Payout request submitted!')
      setCashoutNotes('')
      openCashoutModal()
    } catch (err: unknown) {
      setCashoutError(err instanceof Error ? err.message : 'Error submitting payout request')
    } finally {
      setCashoutSubmitting(false)
    }
  }

  function handleDownloadTemplate() {
    const csvContent =
      '\uFEFF' +
      'Recipient Name,Recipient Phone,City or Town,Full Address,COD Amount USD,Service Type,Fragile (1 or 0),Weight KG,Notes\n' +
      'Maya Haddad,70123456,Achrafieh,"Sassine Square, Bldg 12, 3rd Floor",35,delivery,0,1,"Ring bell twice"\n' +
      'Karim Zein,03987654,Zahle,"Main Highway near Hospital",50,replacement,1,2,"Exchange size M for L - collect old item"\n' +
      'Sami Khoury,76554433,Tripoli,"Mina Port street, Bldg 4",0,pickup,0,1.5,"Return pickup from customer"'

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.setAttribute('download', 'cedar_orders_import_template.csv')
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formError, setFormError] = useState('')

  const [confirmedOrder, setConfirmedOrder] = useState<PortalOrder | null>(null)
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
      setOrders(prev => prev.map(o => (o.id === orderId ? data.order : o)))
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
    const pendingOrders = orders.filter(o => targetIds.includes(o.id) && o.status === 'pending')
    if (pendingOrders.length === 0) {
      alert('Only pending orders can be cancelled. Dispatched, delivered, or already cancelled orders cannot be cancelled.')
      return
    }
    const finalTargetIds = pendingOrders.map(o => o.id)
    const msg =
      finalTargetIds.length === 1
        ? `Are you sure you want to cancel order ${codesLabel || ''}? The order will be cancelled with balances voided.`
        : targetIds.length > finalTargetIds.length
        ? `Notice: Only ${finalTargetIds.length} of the ${targetIds.length} selected orders are pending. Are you sure you want to cancel these ${finalTargetIds.length} pending orders?`
        : `Are you sure you want to cancel these ${finalTargetIds.length} pending orders?`

    if (!window.confirm(msg)) {
      return
    }

    setIsDeleting(true)
    try {
      const res = await fetch('/api/portal/orders', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderIds: finalTargetIds }),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Failed to cancel orders')
      }

      setOrders(prev =>
        prev.map(o =>
          finalTargetIds.includes(o.id) ? { ...o, status: 'cancelled', collection_usd: 0 } : o,
        ),
      )
      setSelectedOrderIds(prev => prev.filter(id => !finalTargetIds.includes(id)))
      if (inspectingOrder && finalTargetIds.includes(inspectingOrder.id)) {
        setInspectingOrder(prev => (prev ? { ...prev, status: 'cancelled', collection_usd: 0 } : null))
      }
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Error cancelling orders')
    } finally {
      setIsDeleting(false)
    }
  }

  const specialMap = useMemo(() => {
    const map = new Map<string, number>()
    for (const sp of specialPrices) {
      map.set(sp.area_id, Number(sp.fee_usd))
    }
    return map
  }, [specialPrices])

  const selectedArea = areas.find(a => a.id === areaId) || areas[0]
  const specialFee = selectedArea ? specialMap.get(selectedArea.id) : undefined
  const deliveryFeeUSD = specialFee !== undefined ? specialFee : selectedArea ? Number(selectedArea.fee_usd) : 3.0
  const deliveryFeeLBP = usdToLbp(deliveryFeeUSD, rate)

  const numericAmount = Math.max(0, parseFloat(rawAmount) || 0)
  const netGoodsUSD = currencyMode === 'USD' ? numericAmount : numericAmount / rate
  const codUSD = feePayerMode === 'customer' ? netGoodsUSD + deliveryFeeUSD : netGoodsUSD
  const codLBP = usdToLbp(codUSD, rate)
  const netPayoutUSD = feePayerMode === 'customer' ? netGoodsUSD : Math.max(-deliveryFeeUSD, netGoodsUSD - deliveryFeeUSD)
  const netPayoutLBP = usdToLbp(netPayoutUSD, rate)

  const isPhoneValid = recipientPhone ? isValidLebanesePhone(recipientPhone) : null

  const totalOrdersCount = orders.length
  const pendingCount = orders.filter(o => o.status === 'pending').length
  const inTransitCount = orders.filter(o => o.status === 'assigned' || o.status === 'picked_up').length
  const deliveredCount = orders.filter(o => o.status === 'delivered').length
  const returnedCount = orders.filter(o => o.status === 'returned').length
  const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()
  const returnedWaitingCount = orders.filter(o => o.status === 'returned' && !o.returns_handed_at).length
  const returnedThisMonthCount = orders.filter(o => o.status === 'returned' && o.returns_handed_at && o.returns_handed_at >= startOfMonth).length

  const totalCollectedUSD = orders
    .filter(o => o.status === 'delivered')
    .reduce((sum, o) => sum + Number(o.collection_usd), 0)

  const filteredOrders = useMemo(() => {
    return orders.filter(o => {
      if (statusFilter === 'pending' && o.status !== 'pending') return false
      if (statusFilter === 'in_transit' && o.status !== 'assigned' && o.status !== 'picked_up') return false
      if (statusFilter === 'delivered' && o.status !== 'delivered') return false
      if (statusFilter === 'returned' && o.status !== 'returned') return false

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
    setSelectedOrderIds(prev => (prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]))
  }

  function handlePrintSelected() {
    const selectedCodes = orders.filter(o => selectedOrderIds.includes(o.id)).map(o => o.code)
    if (selectedCodes.length > 0) {
      window.open(`/print/bulk?codes=${encodeURIComponent(selectedCodes.join(','))}&print=true`, '_blank')
    }
  }

  function handleExportCSV() {
    const exportList = selectedOrderIds.length > 0 ? orders.filter(o => selectedOrderIds.includes(o.id)) : filteredOrders

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
      const cUSD = Number(o.collection_usd) || 0
      const cLBP = usdToLbp(cUSD, o.usd_to_lbp_rate || rate)
      const fUSD = Number(o.delivery_fee_usd) || 0
      const nUSD = Number(o.shop_balance_usd) || 0
      return [
        o.code,
        o.created_at,
        o.status,
        o.recipient_name || '',
        o.recipient_phone || '',
        o.recipient_address || '',
        o.area?.name || '',
        cUSD.toFixed(2),
        cLBP.toString(),
        fUSD.toFixed(2),
        nUSD.toFixed(2),
        o.driver?.name || 'Unassigned',
        (o.notes || '').replace(/"/g, '""'),
      ]
    })

    const csvContent = [headers.map(h => `"${h}"`).join(','), ...rows.map(row => row.map(col => `"${col}"`).join(','))].join('\r\n')

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
          serviceType,
          weightKg: weightKg.trim() ? Number(weightKg) : null,
          isBreakable,
          notes,
          code: customCode || null,
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Failed to place delivery order.')
      }

      setOrders(prev => [data.order, ...prev])
      setConfirmedOrder(data.order)
      setIsModalOpen(false)

      setRecipientName('')
      setRecipientPhone('')
      setRecipientAddress('')
      setRawAmount('')
      setFeePayerMode('customer')
      setNotes('')
      setCustomCode('')
      setServiceType('delivery')
      setWeightKg('')
      setIsBreakable(false)
      setPhoneMatchedCustomer(null)
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Error placing order')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <PortalContext.Provider
      value={{
        shop,
        orders,
        setOrders,
        areas,
        specialPrices,
        rate,
        workspaceName,
        search,
        setSearch,
        statusFilter,
        setStatusFilter,
        filteredOrders,
        selectedOrderIds,
        setSelectedOrderIds,
        isAllSelected,
        toggleSelectAll,
        toggleSelectOrder,
        handlePrintSelected,
        handleExportCSV,
        handleDownloadTemplate,
        handleDeleteOrders,
        isDeleting,
        handleCancelOrder,
        isCancelling,
        cancelError,
        setCancelError,
        isModalOpen,
        setIsModalOpen,
        isShopifyModalOpen,
        setIsShopifyModalOpen,
        isBulkImportModalOpen,
        setIsBulkImportModalOpen,
        isCashoutModalOpen,
        setIsCashoutModalOpen,
        openCashoutModal,
        confirmedOrder,
        setConfirmedOrder,
        inspectingOrder,
        setInspectingOrder,
        recipientName,
        setRecipientName,
        recipientPhone,
        setRecipientPhone,
        recipientAddress,
        setRecipientAddress,
        areaId,
        setAreaId,
        selectedArea,
        deliveryFeeUSD,
        deliveryFeeLBP,
        currencyMode,
        setCurrencyMode,
        rawAmount,
        setRawAmount,
        feePayerMode,
        setFeePayerMode,
        codUSD,
        codLBP,
        netPayoutUSD,
        netPayoutLBP,
        notes,
        setNotes,
        customCode,
        setCustomCode,
        serviceType,
        setServiceType,
        weightKg,
        setWeightKg,
        isBreakable,
        setIsBreakable,
        phoneMatchedCustomer,
        setPhoneMatchedCustomer,
        isPhoneValid,
        isSubmitting,
        formError,
        setFormError,
        handleCreateOrder,
        cashoutAmountUsd,
        setCashoutAmountUsd,
        cashoutMethod,
        setCashoutMethod,
        cashoutAccountDetails,
        setCashoutAccountDetails,
        cashoutNotes,
        setCashoutNotes,
        cashoutAvailableUsd,
        cashoutAvailableLbp,
        cashoutSubmitting,
        cashoutError,
        cashoutSuccess,
        cashoutHistory,
        handleRequestCashout,
        isPickupModalOpen,
        setIsPickupModalOpen,
        pickupCount,
        setPickupCount,
        pickupNote,
        setPickupNote,
        isSubmittingPickup,
        pickupSuccess,
        pickupError,
        recentPickups,
        handleRequestPickup,
        totalOrdersCount,
        pendingCount,
        inTransitCount,
        deliveredCount,
        returnedCount,
        returnedWaitingCount,
        returnedThisMonthCount,
        totalCollectedUSD,
      }}
    >
      {children}
    </PortalContext.Provider>
  )
}

export function usePortal() {
  const ctx = useContext(PortalContext)
  if (!ctx) throw new Error('usePortal must be used within PortalProvider')
  return ctx
}
