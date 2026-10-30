'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ORDER_STATUS_LABELS } from '@/lib/utils'
import type { DriverLang } from '@/lib/driver-i18n'
import type { DriverRunSheetOrder, OfflineSyncItem } from './shared'

interface OrdersDeps {
  driver: { id: string }
  initialOrders: DriverRunSheetOrder[]
  lang: DriverLang
  showNotification: (type: 'success' | 'error', message: string) => void
  playOrderChime: () => void
  triggerVibration: () => void
  triggerPushNotification: (order: DriverRunSheetOrder) => void
}

/** The courier's orders: live updates, polling, the offline queue and status changes. */
export function useDriverOrders({
  driver,
  initialOrders,
  lang,
  showNotification,
  playOrderChime,
  triggerVibration,
  triggerPushNotification,
}: OrdersDeps) {
  const [orders, setOrders] = useState<DriverRunSheetOrder[]>(initialOrders)
  const [updatingId, setUpdatingId] = useState<string | null>(null)

  // Offline-First Sync Queue & Connectivity State
  const [isOnline, setIsOnline] = useState<boolean>(true)
  const [offlineQueue, setOfflineQueue] = useState<OfflineSyncItem[]>([])
  const [isSyncing, setIsSyncing] = useState<boolean>(false)

  // ─── OFFLINE-FIRST LIFECYCLE & PERSISTENCE ───
  useEffect(() => {
    const queueKey = `cedar_driver_offline_queue_${driver.id}`
    const ordersKey = `cedar_driver_orders_${driver.id}`

    // 0. Remember this courier on the device (the signed session cookie is what grants access)
    try {
      localStorage.setItem('cedar_saved_driver_id', driver.id)
    } catch (_e) {
      void _e
    }

    // 1. Initial connectivity check
    setIsOnline(typeof navigator !== 'undefined' ? navigator.onLine : true)

    // 2. Load stored offline queue
    try {
      const savedQueue = localStorage.getItem(queueKey)
      if (savedQueue) {
        setOfflineQueue(JSON.parse(savedQueue))
      }
    } catch (e: unknown) {
      void e
    }

    // 3. Fallback to cached orders if loaded completely offline
    if (initialOrders.length === 0) {
      try {
        const savedOrders = localStorage.getItem(ordersKey)
        if (savedOrders) {
          const parsed = JSON.parse(savedOrders)
          if (Array.isArray(parsed) && parsed.length > 0) {
            setOrders(parsed)
          }
        }
      } catch (e: unknown) {
        void e
      }
    } else {
      try {
        localStorage.setItem(ordersKey, JSON.stringify(initialOrders))
      } catch (e: unknown) {
        void e
      }
    }

    const handleOnline = () => {
      setIsOnline(true)
      showNotification('success', 'Back online! Syncing pending deliveries…')
    }

    const handleOffline = () => {
      setIsOnline(false)
      showNotification('error', 'Network disconnected. Working in Offline Mode.')
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    // Register PWA Service Worker for complete offline resilience
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(err => {
        console.warn('PWA Service Worker registration error:', err)
      })
    }

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [driver.id, initialOrders])

  // Cache updated orders to localStorage
  useEffect(() => {
    if (orders.length > 0) {
      try {
        localStorage.setItem(`cedar_driver_orders_${driver.id}`, JSON.stringify(orders))
      } catch (e: unknown) {
        void e
      }
    }
  }, [orders, driver.id])

  // Realtime updates for newly assigned or modified driver orders
  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel('driver-orders-' + driver.id)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders', filter: `driver_id=eq.${driver.id}` },
        payload => {
          if (payload.eventType === 'INSERT') {
            const newOrder = payload.new as DriverRunSheetOrder
            setOrders(prev => (prev.some(o => o.id === newOrder.id) ? prev : [newOrder, ...prev]))
            showNotification('success', `New order #${newOrder.code} assigned to you!`)
            playOrderChime()
            triggerVibration()
            triggerPushNotification(newOrder)
          } else if (payload.eventType === 'UPDATE') {
            const updated = payload.new as DriverRunSheetOrder
            setOrders(prev => {
              const existed = prev.some(o => o.id === updated.id)
              if (!existed && (updated.status === 'assigned' || updated.status === 'picked_up')) {
                playOrderChime()
                triggerVibration()
                triggerPushNotification(updated)
                showNotification('success', `New order #${updated.code} assigned to you!`)
                return [updated, ...prev]
              }
              return prev.map(o => (o.id === updated.id ? { ...o, ...updated } : o))
            })
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [driver.id, playOrderChime, triggerVibration, triggerPushNotification])

  // ─── HIGH-FREQUENCY AUTO-SYNC & LOCK-SCREEN RECOVERY POLLING ───
  const pollOrdersRef = useRef<boolean>(false)
  const pollDriverOrders = useCallback(async () => {
    if (pollOrdersRef.current) return
    pollOrdersRef.current = true
    try {
      const res = await fetch(`/api/driver/orders?driverId=${driver.id}`, { cache: 'no-store' })
      if (res.status === 401 || res.status === 403) {
        // Dispatch blocked this courier (403) or ended the session, for example by issuing a new PIN (401):
        // this phone has no access any more, so clear what it keeps and go back to the sign-in page
        try {
          localStorage.removeItem('cedar_saved_driver_id')
          localStorage.removeItem(`cedar_driver_orders_${driver.id}`)
          if (res.status === 403) localStorage.removeItem(`cedar_driver_offline_queue_${driver.id}`)
          if ('caches' in window) await Promise.all((await caches.keys()).map(key => caches.delete(key)))
        } catch (_e) {
          void _e
        }
        window.location.href = '/driver?ended=' + (res.status === 403 ? 'blocked' : 'session')
        return
      }
      if (!res.ok) return
      const data = await res.json()
      if (data && Array.isArray(data.orders)) {
        setOrders(prev => {
          const prevMap = new Map(prev.map(o => [o.id, o]))
          let hasNewOrder = false
          let newestCode = ''

          for (const newOrd of data.orders) {
            const existing = prevMap.get(newOrd.id)
            if (!existing && (newOrd.status === 'assigned' || newOrd.status === 'picked_up')) {
              hasNewOrder = true
              newestCode = newOrd.code
            }
          }

          if (hasNewOrder) {
            playOrderChime()
            triggerVibration()
            showNotification(
              'success',
              lang === 'ar' ? `🚨 طلب جديد #${newestCode} تم تعيينه لك!` : `🚨 New order #${newestCode} assigned to you!`
            )
          }

          return data.orders
        })
      }
    } catch (_e) {
      void _e
    } finally {
      pollOrdersRef.current = false
    }
  }, [driver.id, lang, playOrderChime, triggerVibration])

  useEffect(() => {
    // Poll every 4 seconds for real-time mobile order alerts
    const interval = setInterval(pollDriverOrders, 4000)

    // Pull immediately whenever phone screen turns on or user switches back to app
    const handleVisibility = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        pollDriverOrders()
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('focus', handleVisibility)

    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('focus', handleVisibility)
    }
  }, [pollDriverOrders])

  // Sync offline queue items to the server
  const syncOfflineQueue = useCallback(async () => {
    if (isSyncing || offlineQueue.length === 0) return
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      showNotification('error', 'Cannot sync while offline. Please connect to internet.')
      return
    }

    setIsSyncing(true)
    const queueKey = `cedar_driver_offline_queue_${driver.id}`
    const remaining: OfflineSyncItem[] = []
    let syncedCount = 0

    for (const item of offlineQueue) {
      try {
        const res = await fetch('/api/driver/orders', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(item.payload),
        })

        if (res.ok || res.status === 409) {
          // 409 means already updated on server, treat as resolved
          syncedCount++
        } else {
          remaining.push(item)
        }
      } catch {
        remaining.push(item)
      }
    }

    setOfflineQueue(remaining)
    try {
      localStorage.setItem(queueKey, JSON.stringify(remaining))
    } catch (e: unknown) {
      void e
    }

    setIsSyncing(false)
    if (syncedCount > 0) {
      showNotification('success', `✓ Successfully synced ${syncedCount} delivery${syncedCount > 1 ? 's' : ''}!`)
    }
  }, [driver.id, isSyncing, offlineQueue])

  // Auto-sync whenever back online with pending queue items
  useEffect(() => {
    if (isOnline && offlineQueue.length > 0 && !isSyncing) {
      syncOfflineQueue()
    }
  }, [isOnline, offlineQueue.length, isSyncing, syncOfflineQueue])

  // Handle status transitions with seamless offline queueing
  async function handleUpdateStatus(
    orderId: string,
    newStatus: DriverRunSheetOrder['status'],
    extraData?: {
      notes?: string
      podSignature?: string | null
      podPhoto?: string | null
      podCollectedUsd?: number | null
      podCollectedLbp?: number | null
      failureReason?: string
      resultId?: string
      rescheduledFor?: string
    }
  ) {
    setUpdatingId(orderId)
    const targetOrder = orders.find(o => o.id === orderId)
    const queueKey = `cedar_driver_offline_queue_${driver.id}`
    const payload = {
      orderId,
      driverId: driver.id,
      status: newStatus,
      ...extraData,
    }

    // If device is definitely offline upfront
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      const queueItem: OfflineSyncItem = {
        id: crypto.randomUUID(),
        orderId,
        orderCode: targetOrder?.code || orderId,
        status: newStatus,
        payload,
        timestamp: Date.now(),
      }

      const updatedQueue = [...offlineQueue, queueItem]
      setOfflineQueue(updatedQueue)
      try {
        localStorage.setItem(queueKey, JSON.stringify(updatedQueue))
      } catch (e: unknown) {
        void e
      }

      setOrders(prev =>
        prev.map(o => (o.id === orderId ? {
          ...o,
          status: newStatus,
          notes: extraData?.notes || o.notes,
          pod_signature: extraData?.podSignature || o.pod_signature,
          pod_photo: extraData?.podPhoto || o.pod_photo,
          pod_collected_lbp: extraData?.podCollectedLbp !== undefined ? extraData.podCollectedLbp : o.pod_collected_lbp,
        } : o))
      )
      showNotification('success', `Saved offline! Will sync automatically when connection restores.`)
      setUpdatingId(null)
      return
    }

    try {
      const res = await fetch('/api/driver/orders', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
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

      if (newStatus === 'failed' || newStatus === 'returned') {
        const attemptResult = extraData?.resultId || (newStatus === 'returned' ? 'refused' : 'no_answer')
        try {
          const attemptRes = await fetch('/api/orders/attempts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              orderId,
              driverId: driver.id,
              result: attemptResult,
              note: extraData?.notes || extraData?.failureReason,
              rescheduledFor: extraData?.rescheduledFor,
            }),
          })
          const attemptData = await attemptRes.json()
          if (attemptData.attempt?.new_status) {
            setOrders(prev =>
              prev.map(o => (o.id === orderId ? { ...o, status: attemptData.attempt.new_status } : o))
            )
          }
        } catch (_e) {
          void _e
        }
      }
    } catch (err: unknown) {
      // If it failed due to network / fetch error, save to offline queue instead of failing
      const isNetworkError =
        (typeof navigator !== 'undefined' && !navigator.onLine) ||
        (err instanceof TypeError && err.message.toLowerCase().includes('fetch')) ||
        (err instanceof Error && (err.message.includes('network') || err.message.includes('Failed to fetch') || err.message.includes('aborted')))

      if (isNetworkError) {
        const queueItem: OfflineSyncItem = {
          id: crypto.randomUUID(),
          orderId,
          orderCode: targetOrder?.code || orderId,
          status: newStatus,
          payload,
          timestamp: Date.now(),
        }

        const updatedQueue = [...offlineQueue, queueItem]
        setOfflineQueue(updatedQueue)
        try {
          localStorage.setItem(queueKey, JSON.stringify(updatedQueue))
        } catch (e: unknown) {
          void e
        }

        setOrders(prev =>
          prev.map(o => (o.id === orderId ? {
            ...o,
            status: newStatus,
            notes: extraData?.notes || o.notes,
            pod_signature: extraData?.podSignature || o.pod_signature,
            pod_photo: extraData?.podPhoto || o.pod_photo,
            pod_collected_lbp: extraData?.podCollectedLbp !== undefined ? extraData.podCollectedLbp : o.pod_collected_lbp,
          } : o))
        )
        showNotification('success', `Network drop detected: Saved locally! Will sync when connection restores.`)
      } else {
        showNotification('error', err instanceof Error ? err.message : 'Error updating status')
        throw err
      }
    } finally {
      setUpdatingId(null)
    }
  }

  return { orders, setOrders, updatingId, isOnline, offlineQueue, isSyncing, syncOfflineQueue, handleUpdateStatus }
}
