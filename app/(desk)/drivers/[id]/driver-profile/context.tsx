'use client'

import React, { createContext, useContext, useState, useMemo, useRef, type ReactNode } from 'react'
import type { Driver, OrderItem, SettlementItem, Workspace, DriverProfileClientProps } from './types'
import { isDateInPreset, usdToLbp, DateRangePreset } from '@/lib/utils'

interface DriverProfileContextType {
  driver: Driver
  setDriver: React.Dispatch<React.SetStateAction<Driver>>
  orders: OrderItem[]
  settlements: SettlementItem[]
  setSettlements: React.Dispatch<React.SetStateAction<SettlementItem[]>>
  workspace: Workspace
  userRole: string
  canManage: boolean

  activeTab: 'orders' | 'settlements'
  setActiveTab: (tab: 'orders' | 'settlements') => void
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
  sortBy: 'newest' | 'oldest' | 'pay_high' | 'profit_high' | 'collection_high'
  setSortBy: (s: 'newest' | 'oldest' | 'pay_high' | 'profit_high' | 'collection_high') => void

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
  totalDriverEarningsUSD: number
  totalDriverEarningsLBP: number
  avgDriverPay: number
  totalGrossDeliveryFeesUSD: number
  totalCompanyProfitUSD: number
  totalCompanyProfitLBP: number
  companyProfitMargin: number
  avgCompanyProfit: number
  totalCodCollectedUSD: number
  totalCodCollectedLBP: number

  filteredOrders: OrderItem[]
  filteredCodTotal: number
  filteredDriverPayTotal: number
  filteredCompanyProfitTotal: number

  // Modals & Handlers
  isSettlementModalOpen: boolean
  setIsSettlementModalOpen: (open: boolean) => void
  openSettlement: (type: 'driver_cash_remittance' | 'driver_pay') => void
  settlementType: 'driver_cash_remittance' | 'driver_pay'
  setSettlementType: (t: 'driver_cash_remittance' | 'driver_pay') => void
  settlementAmount: string
  setSettlementAmount: (a: string) => void
  settlementAmountLbp: string
  setSettlementAmountLbp: (a: string) => void
  settlementNote: string
  setSettlementNote: (n: string) => void
  settling: boolean
  settleError: string
  handleRecordSettlement: (e: React.FormEvent) => Promise<void>

  isShiftCloseModalOpen: boolean
  setIsShiftCloseModalOpen: (open: boolean) => void
  openShiftCloseModal: () => void
  shiftCloseMode: 'full' | 'net'
  setShiftCloseMode: (m: 'full' | 'net') => void
  shiftHandoverUsd: string
  setShiftHandoverUsd: (a: string) => void
  shiftHandoverLbp: string
  setShiftHandoverLbp: (a: string) => void
  shiftNotes: string
  setShiftNotes: (n: string) => void
  closingShift: boolean
  shiftCloseError: string
  handleExecuteShiftClosure: (e: React.FormEvent) => Promise<void>

  isEditModalOpen: boolean
  setIsEditModalOpen: (open: boolean) => void
  editName: string
  setEditName: (n: string) => void
  editPhone: string
  setEditPhone: (p: string) => void
  editActive: boolean
  setEditActive: (a: boolean) => void
  savingEdit: boolean
  editError: string
  setEditError: (e: string) => void
  handleSaveEdit: (e: React.FormEvent) => Promise<void>
}

const DriverProfileContext = createContext<DriverProfileContextType | null>(null)

export function DriverProfileProvider({
  driver: initialDriver,
  initialOrders,
  initialSettlements,
  workspace,
  userRole,
  children,
}: DriverProfileClientProps & { children: ReactNode }) {
  const settlementRequestId = useRef<string | null>(null)
  const [driver, setDriver] = useState<Driver>(initialDriver)
  const [orders] = useState<OrderItem[]>(initialOrders)
  const [settlements, setSettlements] = useState<SettlementItem[]>(initialSettlements)

  const [activeTab, setActiveTab] = useState<'orders' | 'settlements'>('orders')
  const [orderStatusFilter, setOrderStatusFilter] = useState<'all' | 'delivered' | 'active' | 'returned'>('all')
  const [searchQuery, setSearchQuery] = useState('')

  const [datePreset, setDatePreset] = useState<DateRangePreset>('all')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'pay_high' | 'profit_high' | 'collection_high'>('newest')

  // Modals state
  const [isSettlementModalOpen, setIsSettlementModalOpen] = useState(false)
  const [settlementType, setSettlementType] = useState<'driver_cash_remittance' | 'driver_pay'>('driver_cash_remittance')
  const [settlementAmount, setSettlementAmount] = useState('')
  const [settlementAmountLbp, setSettlementAmountLbp] = useState('')
  const [settlementNote, setSettlementNote] = useState('')
  const [settling, setSettling] = useState(false)
  const [settleError, setSettleError] = useState('')

  const [isShiftCloseModalOpen, setIsShiftCloseModalOpen] = useState(false)
  const [shiftCloseMode, setShiftCloseMode] = useState<'full' | 'net'>('full')
  const [shiftHandoverUsd, setShiftHandoverUsd] = useState('')
  const [shiftHandoverLbp, setShiftHandoverLbp] = useState('')
  const [shiftNotes, setShiftNotes] = useState('')
  const [closingShift, setClosingShift] = useState(false)
  const [shiftCloseError, setShiftCloseError] = useState('')

  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [editName, setEditName] = useState(driver.name)
  const [editPhone, setEditPhone] = useState(driver.phone || '')
  const [editActive, setEditActive] = useState(driver.active)
  const [savingEdit, setSavingEdit] = useState(false)
  const [editError, setEditError] = useState('')

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

  const totalDriverEarningsUSD = useMemo(
    () => deliveredOrders.reduce((sum, o) => sum + (Number(o.driver_pay_usd) || 0), 0),
    [deliveredOrders],
  )
  const totalDriverEarningsLBP = usdToLbp(totalDriverEarningsUSD, workspace.usd_to_lbp)
  const avgDriverPay = deliveredCount > 0 ? totalDriverEarningsUSD / deliveredCount : 0

  const totalGrossDeliveryFeesUSD = useMemo(
    () => deliveredOrders.reduce((sum, o) => sum + (Number(o.delivery_fee_usd) || 0), 0),
    [deliveredOrders],
  )
  const totalCompanyProfitUSD = useMemo(
    () =>
      deliveredOrders.reduce(
        (sum, o) => sum + ((Number(o.delivery_fee_usd) || 0) - (Number(o.driver_pay_usd) || 0)),
        0,
      ),
    [deliveredOrders],
  )
  const totalCompanyProfitLBP = usdToLbp(totalCompanyProfitUSD, workspace.usd_to_lbp)
  const companyProfitMargin =
    totalGrossDeliveryFeesUSD > 0 ? (totalCompanyProfitUSD / totalGrossDeliveryFeesUSD) * 100 : 0
  const avgCompanyProfit = deliveredCount > 0 ? totalCompanyProfitUSD / deliveredCount : 0

  const totalCodCollectedUSD = useMemo(
    () => deliveredOrders.reduce((sum, o) => sum + (Number(o.collection_usd) || 0), 0),
    [deliveredOrders],
  )
  const totalCodCollectedLBP = usdToLbp(totalCodCollectedUSD, workspace.usd_to_lbp)

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
      const shopMatch = order.shop?.name?.toLowerCase().includes(q)
      const areaMatch = order.area?.name?.toLowerCase().includes(q)
      return codeMatch || recipientMatch || phoneMatch || shopMatch || areaMatch
    })

    return list.sort((a, b) => {
      if (sortBy === 'newest') return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      if (sortBy === 'oldest') return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      if (sortBy === 'pay_high') return (Number(b.driver_pay_usd) || 0) - (Number(a.driver_pay_usd) || 0)
      if (sortBy === 'profit_high') {
        const profitB = (Number(b.delivery_fee_usd) || 0) - (Number(b.driver_pay_usd) || 0)
        const profitA = (Number(a.delivery_fee_usd) || 0) - (Number(a.driver_pay_usd) || 0)
        return profitB - profitA
      }
      if (sortBy === 'collection_high') return (Number(b.collection_usd) || 0) - (Number(a.collection_usd) || 0)
      return 0
    })
  }, [dateScopedOrders, orderStatusFilter, searchQuery, sortBy])

  const filteredCodTotal = useMemo(
    () => filteredOrders.reduce((sum, o) => sum + (Number(o.collection_usd) || 0), 0),
    [filteredOrders],
  )
  const filteredDriverPayTotal = useMemo(
    () => filteredOrders.reduce((sum, o) => sum + (Number(o.driver_pay_usd) || 0), 0),
    [filteredOrders],
  )
  const filteredCompanyProfitTotal = useMemo(
    () =>
      filteredOrders.reduce(
        (sum, o) =>
          sum + (o.status === 'delivered' ? (Number(o.delivery_fee_usd) || 0) - (Number(o.driver_pay_usd) || 0) : 0),
        0,
      ),
    [filteredOrders],
  )

  function openSettlement(type: 'driver_cash_remittance' | 'driver_pay') {
    setSettlementType(type)
    setSettlementAmount(
      type === 'driver_cash_remittance'
        ? Number(driver.cash_held_usd) > 0
          ? driver.cash_held_usd.toString()
          : ''
        : Number(driver.pay_owed_usd) > 0
        ? driver.pay_owed_usd.toString()
        : '',
    )
    setSettlementNote(
      type === 'driver_cash_remittance'
        ? `COD cash remittance by ${driver.name}`
        : `Commission payout to ${driver.name}`,
    )
    setSettleError('')
    setIsSettlementModalOpen(true)
  }

  async function handleRecordSettlement(e: React.FormEvent) {
    e.preventDefault()
    setSettling(true)
    setSettleError('')

    const amount = parseFloat(settlementAmount) || 0
    const amountLbp = parseFloat(settlementAmountLbp) || 0
    if (amount <= 0 && amountLbp <= 0) {
      setSettleError('Please enter a valid payment or remittance amount')
      setSettling(false)
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
          type: settlementType,
          amountUsd: amount,
          amountLbp: amountLbp,
          driverId: driver.id,
          note: settlementNote || null,
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to record settlement')
      settlementRequestId.current = null

      if (settlementType === 'driver_cash_remittance') {
        setDriver(prev => ({
          ...prev,
          cash_held_usd: Math.max(0, Number(prev.cash_held_usd) - amount),
          cash_held_lbp: Math.max(0, Number(prev.cash_held_lbp || 0) - amountLbp),
        }))
      } else if (settlementType === 'driver_pay') {
        setDriver(prev => ({
          ...prev,
          pay_owed_usd: Math.max(0, Number(prev.pay_owed_usd) - amount),
        }))
      }

      setSettlements(prev => [data.settlement, ...prev])
      setIsSettlementModalOpen(false)
      setSettlementAmount('')
      setSettlementAmountLbp('')
      setSettlementNote('')

      if (data.settlement?.id) {
        window.open(`/print/settlement/${data.settlement.id}?print=1`, '_blank')
      }
    } catch (err: unknown) {
      setSettleError(err instanceof Error ? err.message : 'Error recording settlement')
    } finally {
      setSettling(false)
    }
  }

  function openShiftCloseModal() {
    setShiftCloseMode('full')
    setShiftHandoverUsd(Number(driver.cash_held_usd) > 0 ? String(driver.cash_held_usd) : '')
    setShiftHandoverLbp(Number(driver.cash_held_lbp) > 0 ? String(driver.cash_held_lbp) : '')
    setShiftNotes(`End-of-day shift settlement for ${driver.name} — ${new Date().toLocaleDateString('en-GB')}`)
    setShiftCloseError('')
    setIsShiftCloseModalOpen(true)
  }

  async function handleExecuteShiftClosure(e: React.FormEvent) {
    e.preventDefault()
    setClosingShift(true)
    setShiftCloseError('')

    const cashHeld = Number(driver.cash_held_usd) || 0
    const payOwed = Number(driver.pay_owed_usd) || 0
    const amountUsd = parseFloat(shiftHandoverUsd) || 0
    const amountLbp = parseFloat(shiftHandoverLbp) || 0

    if (amountUsd <= 0 && amountLbp <= 0) {
      setShiftCloseError('Please enter a valid cash remittance amount.')
      setClosingShift(false)
      return
    }

    try {
      if (shiftCloseMode === 'full') {
        const res = await fetch('/api/settle', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            idempotencyKey: crypto.randomUUID(),
            workspaceId: workspace.id,
            type: 'driver_cash_remittance',
            amountUsd,
            amountLbp,
            driverId: driver.id,
            note: shiftNotes || `Shift closure: COD cash remittance for ${driver.name}`,
          }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Failed to record remittance')

        setDriver(prev => ({
          ...prev,
          cash_held_usd: Math.max(0, Number(prev.cash_held_usd) - amountUsd),
          cash_held_lbp: Math.max(0, Number(prev.cash_held_lbp || 0) - amountLbp),
        }))
        setSettlements(prev => [data.settlement, ...prev])
        setIsShiftCloseModalOpen(false)

        if (data.settlement?.id) {
          window.open(`/print/settlement/${data.settlement.id}?print=1`, '_blank')
        }
      } else {
        const remitRes = await fetch('/api/settle', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            idempotencyKey: crypto.randomUUID(),
            workspaceId: workspace.id,
            type: 'driver_cash_remittance',
            amountUsd: cashHeld,
            amountLbp,
            driverId: driver.id,
            note: `${shiftNotes} (COD Remitted: $${cashHeld})`,
          }),
        })
        const remitData = await remitRes.json()
        if (!remitRes.ok) throw new Error(remitData.error || 'Failed to record remittance')

        let paySettlement = null
        if (payOwed > 0) {
          const payRes = await fetch('/api/settle', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              idempotencyKey: crypto.randomUUID(),
              workspaceId: workspace.id,
              type: 'driver_pay',
              amountUsd: payOwed,
              amountLbp: 0,
              driverId: driver.id,
              note: `${shiftNotes} (Commission Deducted at Handover: $${payOwed})`,
            }),
          })
          const payData = await payRes.json()
          if (payRes.ok) {
            paySettlement = payData.settlement
          }
        }

        setDriver(prev => ({
          ...prev,
          cash_held_usd: 0,
          cash_held_lbp: 0,
          pay_owed_usd: 0,
        }))

        const newItems = [remitData.settlement]
        if (paySettlement) newItems.unshift(paySettlement)
        setSettlements(prev => [...newItems, ...prev])
        setIsShiftCloseModalOpen(false)

        if (remitData.settlement?.id) {
          window.open(`/print/settlement/${remitData.settlement.id}?print=1`, '_blank')
        }
      }
    } catch (err: unknown) {
      setShiftCloseError(err instanceof Error ? err.message : 'Error closing shift')
    } finally {
      setClosingShift(false)
    }
  }

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault()
    setSavingEdit(true)
    setEditError('')

    try {
      const res = await fetch(`/api/drivers/${driver.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId: workspace.id,
          name: editName,
          phone: editPhone || null,
          active: editActive,
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to update driver')

      setDriver(prev => ({
        ...prev,
        name: data.driver.name,
        phone: data.driver.phone,
        active: data.driver.active,
      }))
      setIsEditModalOpen(false)
    } catch (err: unknown) {
      setEditError(err instanceof Error ? err.message : 'Error updating driver')
    } finally {
      setSavingEdit(false)
    }
  }

  return (
    <DriverProfileContext.Provider
      value={{
        driver,
        setDriver,
        orders,
        settlements,
        setSettlements,
        workspace,
        userRole,
        canManage,
        activeTab,
        setActiveTab,
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
        dateScopedOrders,
        deliveredOrders,
        activeOrders,
        returnedOrders,
        totalOrdersCount,
        deliveredCount,
        activeCount,
        returnedCount,
        completionRate,
        totalDriverEarningsUSD,
        totalDriverEarningsLBP,
        avgDriverPay,
        totalGrossDeliveryFeesUSD,
        totalCompanyProfitUSD,
        totalCompanyProfitLBP,
        companyProfitMargin,
        avgCompanyProfit,
        totalCodCollectedUSD,
        totalCodCollectedLBP,
        filteredOrders,
        filteredCodTotal,
        filteredDriverPayTotal,
        filteredCompanyProfitTotal,
        isSettlementModalOpen,
        setIsSettlementModalOpen,
        openSettlement,
        settlementType,
        setSettlementType,
        settlementAmount,
        setSettlementAmount,
        settlementAmountLbp,
        setSettlementAmountLbp,
        settlementNote,
        setSettlementNote,
        settling,
        settleError,
        handleRecordSettlement,
        isShiftCloseModalOpen,
        setIsShiftCloseModalOpen,
        openShiftCloseModal,
        shiftCloseMode,
        setShiftCloseMode,
        shiftHandoverUsd,
        setShiftHandoverUsd,
        shiftHandoverLbp,
        setShiftHandoverLbp,
        shiftNotes,
        setShiftNotes,
        closingShift,
        shiftCloseError,
        handleExecuteShiftClosure,
        isEditModalOpen,
        setIsEditModalOpen,
        editName,
        setEditName,
        editPhone,
        setEditPhone,
        editActive,
        setEditActive,
        savingEdit,
        editError,
        setEditError,
        handleSaveEdit,
      }}
    >
      {children}
    </DriverProfileContext.Provider>
  )
}

export function useDriverProfile() {
  const ctx = useContext(DriverProfileContext)
  if (!ctx) throw new Error('useDriverProfile must be used within DriverProfileProvider')
  return ctx
}
