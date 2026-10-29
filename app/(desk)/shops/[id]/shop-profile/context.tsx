'use client'

import React, { createContext, useContext, useState, useMemo, useRef, type ReactNode } from 'react'
import type {
  Shop,
  OrderItem,
  SettlementItem,
  Workspace,
  DeliveryAreaItem,
  ShopProfileClientProps,
} from './types'
import { isDateInPreset, usdToLbp, DateRangePreset } from '@/lib/utils'
import { syncShopify } from '@/lib/shopify-client'

interface ShopProfileContextType {
  shop: Shop
  setShop: React.Dispatch<React.SetStateAction<Shop>>
  orders: OrderItem[]
  settlements: SettlementItem[]
  setSettlements: React.Dispatch<React.SetStateAction<SettlementItem[]>>
  areas: DeliveryAreaItem[]
  workspace: Workspace
  userRole: string
  canManage: boolean

  activeTab: 'orders' | 'payouts' | 'statement' | 'prices'
  setActiveTab: (t: 'orders' | 'payouts' | 'statement' | 'prices') => void

  specialPriceMap: Record<string, string>
  setSpecialPriceMap: React.Dispatch<React.SetStateAction<Record<string, string>>>
  savingPrices: boolean
  pricesMessage: { text: string; type: 'success' | 'error' } | null
  handleSaveSpecialPrices: () => Promise<void>

  orderStatusFilter: 'all' | 'delivered' | 'active' | 'returned'
  setOrderStatusFilter: (f: 'all' | 'delivered' | 'active' | 'returned') => void
  searchQuery: string
  setSearchQuery: (q: string) => void

  datePreset: DateRangePreset
  setDatePreset: (p: DateRangePreset) => void
  customStart: string
  setCustomStart: (s: string) => void
  customEnd: string
  setCustomEnd: (e: string) => void
  sortBy: 'newest' | 'oldest' | 'collection_high' | 'net_high' | 'fee_high'
  setSortBy: (s: 'newest' | 'oldest' | 'collection_high' | 'net_high' | 'fee_high') => void

  // Modals & handlers
  isPayoutModalOpen: boolean
  setIsPayoutModalOpen: (o: boolean) => void
  openPayoutModal: (dir?: 'payout_to_shop' | 'collection_from_shop') => void
  settlementDirection: 'payout_to_shop' | 'collection_from_shop'
  setSettlementDirection: (d: 'payout_to_shop' | 'collection_from_shop') => void
  payoutAmount: string
  setPayoutAmount: (a: string) => void
  payoutNote: string
  setPayoutNote: (n: string) => void
  paying: boolean
  payoutError: string
  handleRecordPayout: (e: React.FormEvent) => Promise<void>

  isEditModalOpen: boolean
  setIsEditModalOpen: (o: boolean) => void
  editName: string
  setEditName: (n: string) => void
  editPhone: string
  setEditPhone: (p: string) => void
  editAddress: string
  setEditAddress: (a: string) => void
  editActive: boolean
  setEditActive: (a: boolean) => void
  savingEdit: boolean
  editError: string
  setEditError: (e: string) => void
  handleSaveEdit: (e: React.FormEvent) => Promise<void>

  isShopifyModalOpen: boolean
  setIsShopifyModalOpen: (o: boolean) => void
  syncingShopify: boolean
  handleSyncShopifyOrders: () => Promise<void>

  // Metrics
  dateScopedOrders: OrderItem[]
  deliveredOrders: OrderItem[]
  activeOrders: OrderItem[]
  returnedOrders: OrderItem[]
  totalOrdersCount: number
  deliveredCount: number
  activeCount: number
  returnedCount: number
  completionRate: number

  totalCodCollectedUSD: number
  totalCodCollectedLBP: number
  billableOrders: OrderItem[]
  totalDeliveryFeesUSD: number
  totalDeliveryFeesLBP: number
  totalNetShopCreditedUSD: number
  totalPayoutsUSD: number
  totalPayoutsLBP: number
  currentBalanceUSD: number
  currentBalanceLBP: number

  filteredOrders: OrderItem[]
  filteredCodTotal: number
  filteredFeesTotal: number
  filteredShopNetTotal: number
}

const ShopProfileContext = createContext<ShopProfileContextType | null>(null)

export function ShopProfileProvider({
  shop: initialShop,
  initialOrders,
  initialSettlements,
  areas = [],
  initialSpecialPrices = [],
  workspace,
  userRole,
  children,
}: ShopProfileClientProps & { children: ReactNode }) {
  const settlementRequestId = useRef<string | null>(null)
  const [shop, setShop] = useState<Shop>(initialShop)
  const [orders] = useState<OrderItem[]>(initialOrders)
  const [settlements, setSettlements] = useState<SettlementItem[]>(initialSettlements)

  const [activeTab, setActiveTab] = useState<'orders' | 'payouts' | 'statement' | 'prices'>('orders')
  const [specialPriceMap, setSpecialPriceMap] = useState<Record<string, string>>(() => {
    const map: Record<string, string> = {}
    for (const p of initialSpecialPrices) {
      map[p.area_id] = String(p.fee_usd)
    }
    return map
  })
  const [savingPrices, setSavingPrices] = useState(false)
  const [pricesMessage, setPricesMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null)

  async function handleSaveSpecialPrices() {
    setSavingPrices(true)
    setPricesMessage(null)
    try {
      const payload = {
        workspaceId: workspace.id,
        prices: areas.map(a => ({
          areaId: a.id,
          feeUsd:
            specialPriceMap[a.id] !== undefined && specialPriceMap[a.id].trim() !== ''
              ? Number(specialPriceMap[a.id])
              : null,
        })),
      }
      const res = await fetch(`/api/shops/${shop.id}/prices`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to save special prices')
      setPricesMessage({ text: 'Special prices updated successfully!', type: 'success' })
      setTimeout(() => setPricesMessage(null), 4000)
    } catch (err: unknown) {
      setPricesMessage({
        text: err instanceof Error ? err.message : 'Error saving special prices',
        type: 'error',
      })
    } finally {
      setSavingPrices(false)
    }
  }

  const [orderStatusFilter, setOrderStatusFilter] = useState<'all' | 'delivered' | 'active' | 'returned'>('all')
  const [searchQuery, setSearchQuery] = useState('')

  const [datePreset, setDatePreset] = useState<DateRangePreset>('all')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'collection_high' | 'net_high' | 'fee_high'>('newest')

  const [isPayoutModalOpen, setIsPayoutModalOpen] = useState(false)
  const [settlementDirection, setSettlementDirection] = useState<'payout_to_shop' | 'collection_from_shop'>('payout_to_shop')
  const [payoutAmount, setPayoutAmount] = useState('')
  const [payoutNote, setPayoutNote] = useState('')
  const [paying, setPaying] = useState(false)
  const [payoutError, setPayoutError] = useState('')

  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [isShopifyModalOpen, setIsShopifyModalOpen] = useState(false)
  const [editName, setEditName] = useState(shop.name)
  const [editPhone, setEditPhone] = useState(shop.phone || '')
  const [editAddress, setEditAddress] = useState(shop.address || '')
  const [editActive, setEditActive] = useState(shop.active)
  const [savingEdit, setSavingEdit] = useState(false)
  const [editError, setEditError] = useState('')
  const [syncingShopify, setSyncingShopify] = useState(false)

  async function handleSyncShopifyOrders() {
    setSyncingShopify(true)
    try {
      const data = await syncShopify(shop.id)
      alert(data.message || `Successfully synced ${data.importedCount || 0} order(s)!`)
      window.location.reload()
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Error syncing Shopify orders')
    } finally {
      setSyncingShopify(false)
    }
  }

  const canManage = userRole === 'owner' || userRole === 'manager'

  const dateScopedOrders = useMemo(() => {
    return orders.filter(o => isDateInPreset(o.created_at, datePreset, customStart, customEnd))
  }, [orders, datePreset, customStart, customEnd])

  const deliveredOrders = useMemo(() => dateScopedOrders.filter(o => o.status === 'delivered'), [dateScopedOrders])
  const activeOrders = useMemo(
    () => dateScopedOrders.filter(o => ['pending', 'assigned', 'picked_up'].includes(o.status)),
    [dateScopedOrders],
  )
  const returnedOrders = useMemo(
    () => dateScopedOrders.filter(o => ['returned', 'failed'].includes(o.status)),
    [dateScopedOrders],
  )

  const totalOrdersCount = dateScopedOrders.length
  const deliveredCount = deliveredOrders.length
  const activeCount = activeOrders.length
  const returnedCount = returnedOrders.length
  const completionRate = totalOrdersCount > 0 ? (deliveredCount / totalOrdersCount) * 100 : 0

  const totalCodCollectedUSD = useMemo(
    () => deliveredOrders.reduce((sum, o) => sum + (Number(o.collection_usd) || 0), 0),
    [deliveredOrders],
  )
  const totalCodCollectedLBP = usdToLbp(totalCodCollectedUSD, workspace.usd_to_lbp)

  const billableOrders = useMemo(
    () => dateScopedOrders.filter(o => o.status === 'delivered' || o.status === 'returned'),
    [dateScopedOrders],
  )

  const totalDeliveryFeesUSD = useMemo(
    () => billableOrders.reduce((sum, o) => sum + (Number(o.delivery_fee_usd) || 0), 0),
    [billableOrders],
  )
  const totalDeliveryFeesLBP = usdToLbp(totalDeliveryFeesUSD, workspace.usd_to_lbp)

  const totalNetShopCreditedUSD = totalCodCollectedUSD - totalDeliveryFeesUSD

  const totalPayoutsUSD = useMemo(
    () => settlements.reduce((sum, s) => sum + (Number(s.amount_usd) || 0), 0),
    [settlements],
  )
  const totalPayoutsLBP = usdToLbp(totalPayoutsUSD, workspace.usd_to_lbp)

  const currentBalanceUSD = Number(shop.balance_usd) || 0
  const currentBalanceLBP = usdToLbp(currentBalanceUSD, workspace.usd_to_lbp)

  const filteredOrders = useMemo(() => {
    const list = dateScopedOrders.filter(order => {
      if (orderStatusFilter === 'delivered' && order.status !== 'delivered') return false
      if (orderStatusFilter === 'active' && !['pending', 'assigned', 'picked_up'].includes(order.status)) return false
      if (orderStatusFilter === 'returned' && !['returned', 'failed'].includes(order.status)) return false

      if (!searchQuery.trim()) return true
      const q = searchQuery.toLowerCase()
      const codeMatch = order.code?.toLowerCase().includes(q)
      const recipientMatch = order.recipient_name?.toLowerCase().includes(q)
      const phoneMatch = order.recipient_phone?.toLowerCase().includes(q)
      const driverMatch = order.driver?.name?.toLowerCase().includes(q)
      const areaMatch = order.area?.name?.toLowerCase().includes(q)
      return codeMatch || recipientMatch || phoneMatch || driverMatch || areaMatch
    })

    return list.sort((a, b) => {
      if (sortBy === 'newest') return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      if (sortBy === 'oldest') return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      if (sortBy === 'collection_high') return (Number(b.collection_usd) || 0) - (Number(a.collection_usd) || 0)
      if (sortBy === 'net_high') {
        const netB = (Number(b.collection_usd) || 0) - (Number(b.delivery_fee_usd) || 0)
        const netA = (Number(a.collection_usd) || 0) - (Number(a.delivery_fee_usd) || 0)
        return netB - netA
      }
      if (sortBy === 'fee_high') return (Number(b.delivery_fee_usd) || 0) - (Number(a.delivery_fee_usd) || 0)
      return 0
    })
  }, [dateScopedOrders, orderStatusFilter, searchQuery, sortBy])

  const filteredCodTotal = useMemo(
    () => filteredOrders.reduce((sum, o) => sum + (Number(o.collection_usd) || 0), 0),
    [filteredOrders],
  )
  const filteredFeesTotal = useMemo(
    () => filteredOrders.reduce((sum, o) => sum + (Number(o.delivery_fee_usd) || 0), 0),
    [filteredOrders],
  )
  const filteredShopNetTotal = useMemo(
    () => filteredOrders.reduce((sum, o) => sum + (Number(o.shop_balance_usd) || 0), 0),
    [filteredOrders],
  )

  async function handleRecordPayout(e: React.FormEvent) {
    e.preventDefault()
    setPaying(true)
    setPayoutError('')

    const amount = parseFloat(payoutAmount)
    if (isNaN(amount) || amount <= 0) {
      setPayoutError('Please enter a valid payment amount')
      setPaying(false)
      return
    }

    try {
      const requestId = (settlementRequestId.current ||= crypto.randomUUID())
      const res = await fetch('/api/settle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idempotencyKey: requestId,
          workspaceId: workspace.id,
          type: 'shop_payment',
          direction: settlementDirection,
          amountUsd: amount,
          shopId: shop.id,
          note: payoutNote || null,
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to record shop settlement')
      settlementRequestId.current = null

      const delta = settlementDirection === 'collection_from_shop' ? amount : -amount
      setShop(prev => ({
        ...prev,
        balance_usd: Number(prev.balance_usd) + delta,
      }))

      setSettlements(prev => [data.settlement, ...prev])
      setIsPayoutModalOpen(false)
      setPayoutAmount('')
      setPayoutNote('')
    } catch (err: unknown) {
      setPayoutError(err instanceof Error ? err.message : 'Error recording settlement')
    } finally {
      setPaying(false)
    }
  }

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault()
    setSavingEdit(true)
    setEditError('')

    try {
      const res = await fetch(`/api/shops/${shop.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId: workspace.id,
          name: editName,
          phone: editPhone || null,
          address: editAddress || null,
          active: editActive,
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to update shop')

      setShop(prev => ({
        ...prev,
        name: data.shop.name,
        phone: data.shop.phone,
        address: data.shop.address,
        active: data.shop.active,
      }))
      setIsEditModalOpen(false)
    } catch (err: unknown) {
      setEditError(err instanceof Error ? err.message : 'Error updating shop')
    } finally {
      setSavingEdit(false)
    }
  }

  function openPayoutModal(dir?: 'payout_to_shop' | 'collection_from_shop') {
    const chosenDir = dir || (currentBalanceUSD < 0 ? 'collection_from_shop' : 'payout_to_shop')
    setSettlementDirection(chosenDir)
    setPayoutAmount(Math.abs(currentBalanceUSD) > 0 ? Math.abs(currentBalanceUSD).toString() : '')
    setPayoutNote(
      chosenDir === 'collection_from_shop'
        ? `Delivery fee / debt collection from ${shop.name}`
        : `Delivery proceeds payout to ${shop.name}`,
    )
    setPayoutError('')
    setIsPayoutModalOpen(true)
  }

  return (
    <ShopProfileContext.Provider
      value={{
        shop,
        setShop,
        orders,
        settlements,
        setSettlements,
        areas,
        workspace,
        userRole,
        canManage,
        activeTab,
        setActiveTab,
        specialPriceMap,
        setSpecialPriceMap,
        savingPrices,
        pricesMessage,
        handleSaveSpecialPrices,
        orderStatusFilter,
        setOrderStatusFilter,
        searchQuery,
        setSearchQuery,
        datePreset,
        setDatePreset,
        customStart,
        setCustomStart,
        customEnd,
        setCustomEnd,
        sortBy,
        setSortBy,
        isPayoutModalOpen,
        setIsPayoutModalOpen,
        openPayoutModal,
        settlementDirection,
        setSettlementDirection,
        payoutAmount,
        setPayoutAmount,
        payoutNote,
        setPayoutNote,
        paying,
        payoutError,
        handleRecordPayout,
        isEditModalOpen,
        setIsEditModalOpen,
        editName,
        setEditName,
        editPhone,
        setEditPhone,
        editAddress,
        setEditAddress,
        editActive,
        setEditActive,
        savingEdit,
        editError,
        setEditError,
        handleSaveEdit,
        isShopifyModalOpen,
        setIsShopifyModalOpen,
        syncingShopify,
        handleSyncShopifyOrders,
        dateScopedOrders,
        deliveredOrders,
        activeOrders,
        returnedOrders,
        totalOrdersCount,
        deliveredCount,
        activeCount,
        returnedCount,
        completionRate,
        totalCodCollectedUSD,
        totalCodCollectedLBP,
        billableOrders,
        totalDeliveryFeesUSD,
        totalDeliveryFeesLBP,
        totalNetShopCreditedUSD,
        totalPayoutsUSD,
        totalPayoutsLBP,
        currentBalanceUSD,
        currentBalanceLBP,
        filteredOrders,
        filteredCodTotal,
        filteredFeesTotal,
        filteredShopNetTotal,
      }}
    >
      {children}
    </ShopProfileContext.Provider>
  )
}

export function useShopProfile() {
  const ctx = useContext(ShopProfileContext)
  if (!ctx) throw new Error('useShopProfile must be used within ShopProfileProvider')
  return ctx
}
