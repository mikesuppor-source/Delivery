'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import QRCode from 'qrcode'
import { calculateDistanceKm } from '@/lib/maps'
import { resolveOrderCoordinates, type DriverRunSheetOrder, type DriverPickup, type RunSheetProps } from './shared'
import { useDriverLanguage } from './use-driver-language'
import { useToast } from './use-toast'
import { useInstallPrompt } from './use-install-prompt'
import { useDriverGps } from './use-driver-gps'
import { useOrderAlerts } from './use-order-alerts'
import { useDriverOrders } from './use-driver-orders'

/** Everything the run sheet shows and does, composed from the focused hooks above. */
export function useRunSheetState({ driver, initialOrders, initialPickups, rate, workspaceName }: RunSheetProps) {
  const language = useDriverLanguage()
  const { lang, t } = language
  const toast = useToast()
  const install = useInstallPrompt()
  const gps = useDriverGps(driver)
  const { driverGps, sortByNearest } = gps
  const alerts = useOrderAlerts({
    driver,
    lang,
    t,
    isStandaloneApp: install.isStandaloneApp,
    setShowIosInstallModal: install.setShowIosInstallModal,
    showNotification: toast.showNotification,
  })
  const ordersState = useDriverOrders({
    driver,
    initialOrders,
    lang,
    showNotification: toast.showNotification,
    playOrderChime: alerts.playOrderChime,
    triggerVibration: alerts.triggerVibration,
    triggerPushNotification: alerts.triggerPushNotification,
  })
  const { orders } = ordersState

  const [filterTab, setFilterTab] = useState<'to_deliver' | 'all' | 'delivered' | 'failed' | 'pickups' | 'earnings'>('to_deliver')
  const [search, setSearch] = useState('')

  // Pickups State
  const [pickups, setPickups] = useState<DriverPickup[]>(initialPickups || [])
  const [loadingPickups, setLoadingPickups] = useState(false)
  const [collectingPickup, setCollectingPickup] = useState<DriverPickup | null>(null)

  const fetchPickups = useCallback(async () => {
    try {
      setLoadingPickups(true)
      const res = await fetch(`/api/pickups?driverId=${driver.id}`)
      const data = await res.json()
      if (data.pickups) setPickups(data.pickups)
    } catch {
      // offline fallback
    } finally {
      setLoadingPickups(false)
    }
  }, [driver.id])

  useEffect(() => {
    fetchPickups()
  }, [fetchPickups])

  const handleCollectPickup = async (pickupId: string, proofPhoto?: string, orderIds?: string[]) => {
    try {
      const res = await fetch('/api/pickups', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pickupId,
          driverId: driver.id,
          status: 'collected',
          proofPhoto,
          orderIds,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to collect pickup')
      toast.showNotification('success', 'Pickup marked as collected!')
      setCollectingPickup(null)
      fetchPickups()
    } catch (err: unknown) {
      toast.showNotification('error', err instanceof Error ? err.message : 'Error collecting pickup')
    }
  }

  // Best Order Route Optimization State & Logic
  const [optimizingRoute, setOptimizingRoute] = useState(false)
  const handleOptimizeRoute = async () => {
    try {
      setOptimizingRoute(true)
      const res = await fetch('/api/orders/route', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          driverId: driver.id,
          optimize: true,
          lat: driverGps?.lat,
          lng: driverGps?.lng,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to optimize route')
      if (Array.isArray(data.orders)) {
        ordersState.setOrders(prev => {
          const updatedMap = new Map<string, number>(data.orders.map((o: any) => [o.id, o.route_position]))
          return prev.map(o => updatedMap.has(o.id) ? { ...o, route_position: updatedMap.get(o.id) } : o)
        })
      }
      toast.showNotification('success', `Route optimized by nearest stops from your current GPS!`)
    } catch (err: unknown) {
      toast.showNotification('error', err instanceof Error ? err.message : 'Optimization failed')
    } finally {
      setOptimizingRoute(false)
    }
  }

  const handleMoveOrderPosition = async (orderId: string, direction: 'up' | 'down') => {
    const active = orders.filter(o => o.status === 'assigned' || o.status === 'picked_up')
    const idx = active.findIndex(o => o.id === orderId)
    if (idx < 0) return
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1
    if (targetIdx < 0 || targetIdx >= active.length) return

    const reordered = [...active]
    const [moved] = reordered.splice(idx, 1)
    reordered.splice(targetIdx, 0, moved)

    const positions = reordered.map((o, i) => ({ order_id: o.id, position: i + 1 }))
    ordersState.setOrders(prev => {
      const map = new Map(positions.map(p => [p.order_id, p.position]))
      return prev.map(o => map.has(o.id) ? { ...o, route_position: map.get(o.id) } : o)
    })

    fetch('/api/orders/route', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ driverId: driver.id, positions }),
    }).catch(() => {})
  }

  // POD & Failure modals
  const [podModalOrder, setPodModalOrder] = useState<DriverRunSheetOrder | null>(null)
  const [failModalOrder, setFailModalOrder] = useState<DriverRunSheetOrder | null>(null)
  const [viewPodOrder, setViewPodOrder] = useState<DriverRunSheetOrder | null>(null)
  const [returnHandoverOrder, setReturnHandoverOrder] = useState<DriverRunSheetOrder | null>(null)

  const handleReturnHandoverSuccess = (orderId: string) => {
    ordersState.setOrders(prev =>
      prev.map(o =>
        o.id === orderId
          ? { ...o, returns_handed_at: new Date().toISOString() }
          : o
      )
    )
    toast.showNotification('success', 'Return handed over to merchant!')
  }

  const [showShiftSummaryModal, setShowShiftSummaryModal] = useState<boolean>(false)
  const [shiftQrDataUrl, setShiftQrDataUrl] = useState<string>('')

  const handleOpenShiftSummary = async () => {
    try {
      const todayStr = new Date().toISOString().slice(0, 10)
      const qrPayload = `CEDAR:SHIFT:${driver.id}:${stats.cashCollectedUsd}:${todayStr}`
      const url = await QRCode.toDataURL(qrPayload, { width: 220, margin: 1 })
      setShiftQrDataUrl(url)
    } catch (_e) {
      void _e
    }
    setShowShiftSummaryModal(true)
  }

  // Filter & Search Logic (with GPS Nearest-First sorting)
  const filteredOrders = useMemo(() => {
    const list = orders.filter(order => {
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

    if (sortByNearest && driverGps) {
      return [...list].sort((a, b) => {
        const coordsA = resolveOrderCoordinates(a)
        const coordsB = resolveOrderCoordinates(b)
        if (!coordsA && !coordsB) return 0
        if (!coordsA) return 1
        if (!coordsB) return -1
        const distA = calculateDistanceKm(driverGps.lat, driverGps.lng, coordsA.lat, coordsA.lng)
        const distB = calculateDistanceKm(driverGps.lat, driverGps.lng, coordsB.lat, coordsB.lng)
        return distA - distB
      })
    }

    if (filterTab === 'to_deliver' && !sortByNearest) {
      return [...list].sort((a, b) => {
        const posA = a.route_position ?? 9999
        const posB = b.route_position ?? 9999
        return posA - posB
      })
    }

    return list
  }, [orders, filterTab, search, sortByNearest, driverGps])

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

  const handleSwitchCourier = async () => {
    try {
      await fetch('/api/driver/auth', { method: 'DELETE' }).catch(() => {})
      localStorage.removeItem('cedar_saved_driver_id')
      localStorage.removeItem(`cedar_driver_orders_${driver.id}`)
      // Offline copies of the run sheet hold customer details; drop them when the courier signs out
      if ('caches' in window) {
        const keys = await caches.keys()
        await Promise.all(keys.map(key => caches.delete(key)))
      }
    } catch (_e) {
      void _e
    }
    window.location.href = '/driver'
  }

  return {
    driver,
    rate,
    workspaceName,
    ...language,
    ...toast,
    ...install,
    ...gps,
    ...alerts,
    ...ordersState,
    filterTab,
    setFilterTab,
    search,
    setSearch,
    podModalOrder,
    setPodModalOrder,
    failModalOrder,
    setFailModalOrder,
    viewPodOrder,
    setViewPodOrder,
    returnHandoverOrder,
    setReturnHandoverOrder,
    handleReturnHandoverSuccess,
    showShiftSummaryModal,
    setShowShiftSummaryModal,
    shiftQrDataUrl,
    handleOpenShiftSummary,
    filteredOrders,
    stats,
    handleSwitchCourier,
    pickups,
    loadingPickups,
    collectingPickup,
    setCollectingPickup,
    fetchPickups,
    handleCollectPickup,
    optimizingRoute,
    handleOptimizeRoute,
    handleMoveOrderPosition,
  }
}

export type RunSheetState = ReturnType<typeof useRunSheetState>
export type { DriverRunSheetOrder }
