'use client'

import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import {
  formatUSD,
  formatLBP,
  usdToLbp,
  formatDate,
  ORDER_STATUS_LABELS,
} from '@/lib/utils'
import {
  getGoogleMapsDirectionsUrl,
  getWazeDirectionsUrl,
  parseLocation,
  formatDisplayAddress,
  calculateDistanceKm,
  formatDistance,
  getLebanonAreaCoordinates,
} from '@/lib/maps'
import { normalizePhoneForWhatsApp } from '@/lib/whatsapp'
import { WhatsAppIcon } from '@/components/whatsapp-icon'
import { GoogleMapsIcon } from '@/components/google-maps-icon'
import {
  TruckIcon,
  PackageIcon,
  CheckIcon,
  SearchIcon,
  PhoneIcon,
  NavigationIcon,
} from '@/components/icons'
import { DeliveryPodModal } from './delivery-pod-modal'
import { DeliveryFailModal } from './delivery-fail-modal'
import { DeliveryPodViewModal } from './delivery-pod-view-modal'

export interface DriverRunSheetOrder {
  id: string
  code: string
  tracking_token?: string
  status: 'pending' | 'assigned' | 'picked_up' | 'delivered' | 'failed' | 'returned'
  service_type?: 'delivery' | 'replacement' | 'pickup'
  weight_kg?: number
  is_breakable?: boolean
  carrier_tracking_code?: string | null
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
  location_lat?: number | null
  location_lng?: number | null
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

export interface OfflineSyncItem {
  id: string
  orderId: string
  orderCode: string
  status: DriverRunSheetOrder['status']
  payload: {
    orderId: string
    driverId: string
    status: DriverRunSheetOrder['status']
    notes?: string
    podSignature?: string | null
    podPhoto?: string | null
    podCollectedUsd?: number | null
    podCollectedLbp?: number | null
    failureReason?: string
  }
  timestamp: number
}

interface DriverRunSheetClientProps {
  driver: DriverInfo
  initialOrders: DriverRunSheetOrder[]
  rate: number
  workspaceName: string
}

function resolveOrderCoordinates(order: DriverRunSheetOrder): { lat: number; lng: number } | null {
  if (order.location_lat != null && order.location_lng != null) {
    const lat = Number(order.location_lat)
    const lng = Number(order.location_lng)
    if (!isNaN(lat) && !isNaN(lng)) return { lat, lng }
  }
  const parsed = parseLocation(order.recipient_address)
  if (parsed.isCoords && parsed.lat && parsed.lng) {
    return { lat: parsed.lat, lng: parsed.lng }
  }
  const areaCoords = getLebanonAreaCoordinates(order.area?.name) || getLebanonAreaCoordinates(order.recipient_address)
  if (areaCoords) return areaCoords
  return null
}

export const LEBANON_QUICK_CITIES = [
  { name: 'Beirut (Central)', lat: 33.8938, lng: 35.5018 },
  { name: 'Metn / Sin El Fil', lat: 33.8860, lng: 35.5683 },
  { name: 'Baabda / Hadath', lat: 33.8333, lng: 35.5333 },
  { name: 'Jounieh / Keserwan', lat: 33.9808, lng: 35.6178 },
  { name: 'Jbeil / Byblos', lat: 34.1226, lng: 35.6517 },
  { name: 'Tripoli / North', lat: 34.4367, lng: 35.8497 },
  { name: 'Saida / Sidon', lat: 33.5631, lng: 35.3689 },
  { name: 'Sour / Tyre', lat: 33.2733, lng: 35.1939 },
  { name: 'Zahlé / Bekaa', lat: 33.8463, lng: 35.9020 },
  { name: 'Chouf / Aley', lat: 33.8058, lng: 35.6025 },
]

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

  // Offline-First Sync Queue & Connectivity State
  const [isOnline, setIsOnline] = useState<boolean>(true)
  const [offlineQueue, setOfflineQueue] = useState<OfflineSyncItem[]>([])
  const [isSyncing, setIsSyncing] = useState<boolean>(false)

  // POD & Failure modals
  const [podModalOrder, setPodModalOrder] = useState<DriverRunSheetOrder | null>(null)
  const [failModalOrder, setFailModalOrder] = useState<DriverRunSheetOrder | null>(null)
  const [viewPodOrder, setViewPodOrder] = useState<DriverRunSheetOrder | null>(null)

  // Phone GPS & Navigation Proximity State
  type GpsStatus = 'prompt' | 'requesting' | 'active' | 'denied' | 'unavailable' | 'timeout' | 'unsupported'
  const [driverGps, setDriverGps] = useState<{ lat: number; lng: number; accuracy?: number; label?: string } | null>(null)
  const [gpsStatus, setGpsStatus] = useState<GpsStatus>('prompt')
  const [gpsErrorText, setGpsErrorText] = useState<string | null>(null)
  const [sortByNearest, setSortByNearest] = useState<boolean>(false)

  // PWA App Install, In-App Browser & Modals State
  const [deferredInstallPrompt, setDeferredInstallPrompt] = useState<any>(null)
  const [isStandaloneApp, setIsStandaloneApp] = useState<boolean>(false)
  const [showIosInstallModal, setShowIosInstallModal] = useState<boolean>(false)
  const [showCityPickerModal, setShowCityPickerModal] = useState<boolean>(false)
  const [showGpsHelpModal, setShowGpsHelpModal] = useState<boolean>(false)
  const [isInAppBrowser, setIsInAppBrowser] = useState<boolean>(false)

  const handleInstallApp = async () => {
    if (deferredInstallPrompt) {
      try {
        deferredInstallPrompt.prompt()
        const choice = await deferredInstallPrompt.userChoice
        if (choice.outcome === 'accepted') {
          setIsStandaloneApp(true)
          setDeferredInstallPrompt(null)
        }
      } catch (_e) {
        void _e
      }
    } else {
      setShowIosInstallModal(true)
    }
  }

  const handleSelectManualCity = (city: { name: string; lat: number; lng: number }) => {
    const coords = { lat: city.lat, lng: city.lng, accuracy: 500, label: city.name }
    setDriverGps(coords)
    setGpsStatus('active')
    setGpsErrorText(null)
    setShowCityPickerModal(false)
    sendLocationTelemetry(coords.lat, coords.lng)
    try {
      localStorage.setItem('cedar_driver_gps_active', '1')
      localStorage.setItem('cedar_driver_manual_city', city.name)
    } catch (_e) {
      void _e
    }
  }

  const watchIdRef = useRef<number | null>(null)
  const lastTelemetryRef = useRef<{ lat: number; lng: number; time: number } | null>(null)

  // Send telemetry ping to server (throttled to at most once per 25s unless moved > 30m)
  const sendLocationTelemetry = useCallback((lat: number, lng: number) => {
    const now = Date.now()
    const last = lastTelemetryRef.current
    if (last) {
      const timeDiff = now - last.time
      const latDiff = Math.abs(lat - last.lat)
      const lngDiff = Math.abs(lng - last.lng)
      if (timeDiff < 25000 && latDiff < 0.0003 && lngDiff < 0.0003) {
        return
      }
    }
    lastTelemetryRef.current = { lat, lng, time: now }

    fetch('/api/driver/location', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        driverId: driver.id,
        lat,
        lng,
      }),
    }).catch(() => {})
  }, [driver.id])

  // Handle successful position acquisition
  const handleGpsSuccess = useCallback((pos: GeolocationPosition) => {
    const coords = {
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      accuracy: Math.round(pos.coords.accuracy),
    }
    setDriverGps(coords)
    setGpsStatus('active')
    setGpsErrorText(null)

    try {
      localStorage.setItem('cedar_driver_gps_active', '1')
    } catch (_e) {
      void _e
    }

    sendLocationTelemetry(coords.lat, coords.lng)

    // Start background watchPosition only after permission is confirmed and position is retrieved
    if (typeof window !== 'undefined' && navigator.geolocation && watchIdRef.current === null) {
      try {
        const id = navigator.geolocation.watchPosition(
          wPos => {
            const wCoords = {
              lat: wPos.coords.latitude,
              lng: wPos.coords.longitude,
              accuracy: Math.round(wPos.coords.accuracy),
            }
            setDriverGps(wCoords)
            setGpsStatus('active')
            sendLocationTelemetry(wCoords.lat, wCoords.lng)
          },
          _wErr => {
            void _wErr
          },
          { enableHighAccuracy: false, maximumAge: 15000, timeout: 20000 }
        )
        watchIdRef.current = id
      } catch (_e) {
        void _e
      }
    }
  }, [sendLocationTelemetry])

  // Real-time GPS request with 2-tier fallback (satellite high-accuracy -> network low-accuracy)
  const requestGps = useCallback((forceLowAccuracy = false) => {
    if (typeof window === 'undefined' || !navigator.geolocation) {
      setGpsStatus('unsupported')
      setGpsErrorText('GPS is not supported by your browser.')
      return
    }

    setGpsStatus('requesting')
    setGpsErrorText(null)

    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current)
      watchIdRef.current = null
    }

    const fallbackToLowAccuracy = () => {
      navigator.geolocation.getCurrentPosition(
        handleGpsSuccess,
        err => {
          if (err.code === err.PERMISSION_DENIED) {
            setGpsStatus('denied')
            setGpsErrorText(
              'Location permission was denied. Tap the lock/aA icon in your browser address bar to allow location, then tap Retry GPS.'
            )
          } else if (err.code === err.POSITION_UNAVAILABLE) {
            setGpsStatus('unavailable')
            setGpsErrorText(
              'Location is turned OFF on your phone. Please swipe down and turn ON Location / GPS in your phone settings, then tap Retry GPS.'
            )
          } else if (err.code === err.TIMEOUT) {
            setGpsStatus('timeout')
            setGpsErrorText(
              'Location search timed out. Tap Retry GPS or tap Network.'
            )
          } else {
            setGpsStatus('unavailable')
            setGpsErrorText('Unable to retrieve location. Please check your phone location settings.')
          }
        },
        { enableHighAccuracy: false, timeout: 15000, maximumAge: 60000 }
      )
    }

    if (forceLowAccuracy) {
      fallbackToLowAccuracy()
      return
    }

    // Tier 1: Try high accuracy with a 7s timeout
    navigator.geolocation.getCurrentPosition(
      handleGpsSuccess,
      err => {
        if (err.code === err.PERMISSION_DENIED) {
          setGpsStatus('denied')
          setGpsErrorText(
            'Location permission was denied. Tap the lock/aA icon in your browser address bar to allow location, then tap Retry GPS.'
          )
        } else {
          // If timeout or unavailable with satellites, auto-fallback to cell/WiFi network positioning
          fallbackToLowAccuracy()
        }
      },
      { enableHighAccuracy: true, timeout: 7000, maximumAge: 30000 }
    )
  }, [handleGpsSuccess])

  // Clean up watcher on unmount
  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null && typeof window !== 'undefined' && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchIdRef.current)
        watchIdRef.current = null
      }
    }
  }, [])

  // Detect In-App Browser (WhatsApp, Instagram, etc.) & PWA Standalone State
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const ua = navigator.userAgent || ''
      setIsInAppBrowser(/WhatsApp|FBAN|FBAV|Instagram|Line/i.test(ua))

      const isStandalone =
        window.matchMedia('(display-mode: standalone)').matches ||
        (window.navigator as unknown as { standalone?: boolean }).standalone === true
      setIsStandaloneApp(isStandalone)

      const handleBeforeInstall = (e: Event) => {
        e.preventDefault()
        setDeferredInstallPrompt(e)
      }
      window.addEventListener('beforeinstallprompt', handleBeforeInstall)

      const handleInstalled = () => {
        setIsStandaloneApp(true)
        setDeferredInstallPrompt(null)
      }
      window.addEventListener('appinstalled', handleInstalled)

      return () => {
        window.removeEventListener('beforeinstallprompt', handleBeforeInstall)
        window.removeEventListener('appinstalled', handleInstalled)
      }
    }
  }, [])

  // Auto-connect if permission was previously granted or saved
  useEffect(() => {
    if (typeof window !== 'undefined') {
      let savedActive = false
      let savedCity: string | null = null
      try {
        savedActive = localStorage.getItem('cedar_driver_gps_active') === '1'
        savedCity = localStorage.getItem('cedar_driver_manual_city')
      } catch (_e) {
        void _e
      }

      if (savedCity) {
        const found = LEBANON_QUICK_CITIES.find(c => c.name === savedCity)
        if (found) {
          setDriverGps({ lat: found.lat, lng: found.lng, accuracy: 500, label: found.name })
          setGpsStatus('active')
        }
      }

      if (navigator.geolocation) {
        if (navigator.permissions && navigator.permissions.query) {
          navigator.permissions.query({ name: 'geolocation' as PermissionName }).then(res => {
            if (res.state === 'granted') {
              requestGps()
            } else if (res.state === 'denied') {
              if (!savedCity) {
                setGpsStatus('denied')
                setGpsErrorText(
                  'Location permission was denied. Tap the lock/aA icon in your browser address bar to allow location, or pick your area manually.'
                )
              }
            } else if (savedActive && !savedCity) {
              requestGps()
            }
          }).catch(_err => {
            void _err
            if (savedActive && !savedCity) requestGps()
          })
        } else if (savedActive && !savedCity) {
          requestGps()
        }
      }
    }
  }, [requestGps])

  function showNotification(type: 'success' | 'error', message: string) {
    setNotification({ type, message })
    setTimeout(() => setNotification(null), 4000)
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

  // ─── OFFLINE-FIRST LIFECYCLE & PERSISTENCE ───
  useEffect(() => {
    const queueKey = `cedar_driver_offline_queue_${driver.id}`
    const ordersKey = `cedar_driver_orders_${driver.id}`

    // 0. Bind this device to this courier profile permanently
    try {
      localStorage.setItem('cedar_saved_driver_id', driver.id)
      document.cookie = `cedar_saved_driver_id=${driver.id}; path=/; max-age=31536000; SameSite=Lax`
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

  // ─── AUDIO CHIME & PUSH NOTIFICATIONS TELEMETRY ───
  const [alertsEnabled, setAlertsEnabled] = useState<boolean>(false)

  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setAlertsEnabled(Notification.permission === 'granted')
    }
  }, [])

  const playOrderChime = useCallback(() => {
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      if (!AudioCtx) return
      const ctx = new AudioCtx()

      // Tone 1: High crisp ding (880 Hz / A5)
      const osc1 = ctx.createOscillator()
      const gain1 = ctx.createGain()
      osc1.type = 'sine'
      osc1.frequency.setValueAtTime(880, ctx.currentTime)
      gain1.gain.setValueAtTime(0.5, ctx.currentTime)
      gain1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3)
      osc1.connect(gain1)
      gain1.connect(ctx.destination)
      osc1.start(ctx.currentTime)
      osc1.stop(ctx.currentTime + 0.3)

      // Tone 2: Harmonic chime (1320 Hz / E6)
      const osc2 = ctx.createOscillator()
      const gain2 = ctx.createGain()
      osc2.type = 'sine'
      osc2.frequency.setValueAtTime(1320, ctx.currentTime + 0.15)
      gain2.gain.setValueAtTime(0.6, ctx.currentTime + 0.15)
      gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6)
      osc2.connect(gain2)
      gain2.connect(ctx.destination)
      osc2.start(ctx.currentTime + 0.15)
      osc2.stop(ctx.currentTime + 0.6)
    } catch (e) {
      console.warn('Audio chime error:', e)
    }
  }, [])

  const triggerVibration = useCallback(() => {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate([200, 100, 200, 100, 400])
      } catch (_e) {
        void _e
      }
    }
  }, [])

  const triggerPushNotification = useCallback((order: DriverRunSheetOrder) => {
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
      try {
        new Notification(`🚨 New Delivery Assigned: #${order.code}`, {
          body: `Area: ${order.area?.name || 'Assigned Area'} | COD: $${Number(order.collection_usd || 0).toFixed(2)}`,
          icon: '/logo.png',
        })
      } catch (_e) {
        void _e
      }
    }
  }, [])

  const handleEnableAlerts = async () => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      try {
        const perm = await Notification.requestPermission()
        setAlertsEnabled(perm === 'granted')
        playOrderChime()
        triggerVibration()
        showNotification('success', '✓ Audible chime & push notifications activated!')
      } catch {
        playOrderChime()
        triggerVibration()
      }
    } else {
      playOrderChime()
      triggerVibration()
      showNotification('success', '✓ Audible chime tested!')
    }
  }

  const handleSwitchCourier = async () => {
    try {
      await fetch('/api/driver/auth', { method: 'DELETE' }).catch(() => {})
      localStorage.removeItem('cedar_saved_driver_id')
      document.cookie = 'cedar_saved_driver_id=; path=/; max-age=0'
    } catch (_e) {
      void _e
    }
    window.location.href = '/driver'
  }

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

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {/* Quick Alert Chime Test */}
            <button
              type="button"
              onClick={handleEnableAlerts}
              title={alertsEnabled ? 'Alert chime active (tap to test)' : 'Tap to enable loud alert sound & push notifications'}
              style={{
                background: alertsEnabled ? 'rgba(16, 185, 129, 0.15)' : '#1e293b',
                color: alertsEnabled ? '#34d399' : '#94a3b8',
                border: '1px solid ' + (alertsEnabled ? 'rgba(16, 185, 129, 0.3)' : '#334155'),
                padding: '6px 8px',
                borderRadius: 8,
                fontSize: 11,
                fontWeight: 700,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                cursor: 'pointer',
              }}
            >
              <span>{alertsEnabled ? '🔔 Sound ON' : '🔕 Sound'}</span>
            </button>

            {/* Switch Courier Profile */}
            <button
              type="button"
              onClick={handleSwitchCourier}
              title="Switch courier profile or exit"
              style={{
                background: '#1e293b',
                color: '#64748b',
                border: '1px solid #334155',
                padding: '6px 8px',
                borderRadius: 8,
                fontSize: 11,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Exit
            </button>
          </div>
        </div>
      </header>

      {/* Offline Status & Cloud Sync Banner */}
      {(!isOnline || offlineQueue.length > 0) && (
        <div
          style={{
            position: 'sticky',
            top: 63,
            zIndex: 49,
            background: !isOnline ? '#991b1b' : '#b45309',
            borderBottom: '1px solid ' + (!isOnline ? '#b91c1c' : '#d97706'),
            padding: '10px 16px',
            color: '#ffffff',
            fontSize: 12.5,
            fontWeight: 600,
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
          }}
        >
          <div
            style={{
              maxWidth: 640,
              margin: '0 auto',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 8,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>
                {!isOnline ? (
                  <>
                    <strong>Offline Mode:</strong> No internet connection. Deliveries and signatures will save locally.
                  </>
                ) : (
                  <>
                    <strong>{offlineQueue.length} pending offline deliver{offlineQueue.length > 1 ? 'ies' : 'y'}</strong> ready to upload to cloud.
                  </>
                )}
              </span>
            </div>

            {offlineQueue.length > 0 && (
              <button
                type="button"
                onClick={syncOfflineQueue}
                disabled={isSyncing || !isOnline}
                style={{
                  background: isOnline ? '#fbbf24' : '#64748b',
                  color: isOnline ? '#0f172a' : '#cbd5e1',
                  border: 'none',
                  padding: '5px 12px',
                  borderRadius: 6,
                  fontSize: 11.5,
                  fontWeight: 800,
                  cursor: isOnline && !isSyncing ? 'pointer' : 'not-allowed',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                }}
              >
                {isSyncing ? 'Syncing…' : `Sync Now (${offlineQueue.length})`}
              </button>
            )}
          </div>
        </div>
      )}

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
        {/* In-App Browser (WhatsApp / Telegram) Warning */}
        {isInAppBrowser && (
          <div
            style={{
              background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.2) 0%, rgba(180, 83, 9, 0.25) 100%)',
              border: '1.5px solid #f59e0b',
              borderRadius: 12,
              padding: '12px 14px',
              marginBottom: 14,
              color: '#fef08a',
            }}
          >
            <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>⚠️ Viewing Inside WhatsApp Browser</span>
            </div>
            <div style={{ fontSize: 12, color: '#fef3c7', lineHeight: 1.45 }}>
              WhatsApp&apos;s built-in browser blocks Phone GPS and prevents adding the app to your home screen.
            </div>
            <div
              style={{
                marginTop: 8,
                padding: '6px 10px',
                background: 'rgba(0,0,0,0.3)',
                borderRadius: 8,
                fontSize: 11.5,
                fontWeight: 700,
                color: '#fde68a',
              }}
            >
              👉 Tap the <strong>3 dots (⋮)</strong> or <strong>Share icon</strong> in the top or bottom corner and choose <u>Open in Safari</u> or <u>Open in Chrome</u>.
            </div>
          </div>
        )}

        {/* PWA Phone App Install Bar */}
        <div
          style={{
            background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.9) 0%, rgba(15, 23, 42, 0.95) 100%)',
            border: '1px solid #334155',
            borderRadius: 12,
            padding: '10px 14px',
            marginBottom: 14,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <div
              style={{
                width: 34,
                height: 34,
                borderRadius: 8,
                background: '#10b981',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 16,
                fontWeight: 900,
                flexShrink: 0,
              }}
            >
              C
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#f8fafc' }}>
                {isStandaloneApp ? 'Cedar Courier App' : 'Install as Phone App'}
              </div>
              <div style={{ fontSize: 11, color: '#94a3b8' }}>
                {isStandaloneApp ? 'Running in Fullscreen App Mode' : 'Add to Home Screen for fast 1-tap run sheet launch'}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            {!isStandaloneApp && (
              <button
                type="button"
                onClick={handleInstallApp}
                style={{
                  background: '#2563eb',
                  color: '#ffffff',
                  border: 'none',
                  padding: '6px 12px',
                  borderRadius: 6,
                  fontSize: 11.5,
                  fontWeight: 800,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <span>📲 Install App</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleEnableAlerts}
              style={{
                background: alertsEnabled ? 'rgba(16, 185, 129, 0.2)' : '#059669',
                color: alertsEnabled ? '#34d399' : '#ffffff',
                border: alertsEnabled ? '1px solid rgba(16, 185, 129, 0.4)' : 'none',
                padding: '6px 10px',
                borderRadius: 6,
                fontSize: 11,
                fontWeight: 700,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {alertsEnabled ? '🔔 Alert Ready' : '🔔 Enable Sound'}
            </button>
          </div>
        </div>

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

        {/* ─── PHONE GPS STATUS & PROXIMITY SORT ─── */}
        <div
          style={{
            background:
              gpsStatus === 'active'
                ? 'rgba(16, 185, 129, 0.1)'
                : gpsStatus === 'requesting'
                ? 'rgba(59, 130, 246, 0.1)'
                : gpsStatus === 'denied' || gpsStatus === 'unavailable' || gpsStatus === 'timeout'
                ? 'rgba(239, 68, 68, 0.1)'
                : 'rgba(30, 41, 59, 0.6)',
            border:
              '1px solid ' +
              (gpsStatus === 'active'
                ? 'rgba(16, 185, 129, 0.3)'
                : gpsStatus === 'requesting'
                ? 'rgba(59, 130, 246, 0.3)'
                : gpsStatus === 'denied' || gpsStatus === 'unavailable' || gpsStatus === 'timeout'
                ? 'rgba(239, 68, 68, 0.3)'
                : '#334155'),
            borderRadius: 12,
            padding: '10px 12px',
            marginBottom: 12,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
              width: '100%',
              flexWrap: 'wrap',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1 }}>
              <span
                style={{
                  width: 9,
                  height: 9,
                  borderRadius: '50%',
                  background:
                    gpsStatus === 'active'
                      ? '#10b981'
                      : gpsStatus === 'requesting'
                      ? '#38bdf8'
                      : gpsStatus === 'denied' || gpsStatus === 'unavailable' || gpsStatus === 'timeout'
                      ? '#ef4444'
                      : '#64748b',
                  boxShadow:
                    gpsStatus === 'active'
                      ? '0 0 8px #10b981'
                      : gpsStatus === 'requesting'
                      ? '0 0 8px #38bdf8'
                      : 'none',
                  flexShrink: 0,
                }}
              />
              <div style={{ fontSize: 12, color: '#f8fafc', minWidth: 0 }}>
                {gpsStatus === 'active' ? (
                  <span style={{ color: '#34d399' }}>
                    <strong>{driverGps?.label ? `Location: ${driverGps.label}` : 'Phone GPS Live'}</strong> {driverGps?.label ? '(Area)' : (driverGps?.accuracy ? `(±${driverGps.accuracy}m)` : '')}
                  </span>
                ) : gpsStatus === 'requesting' ? (
                  <span style={{ color: '#38bdf8' }}>
                    <strong>Acquiring phone GPS...</strong> (allow browser prompt)
                  </span>
                ) : gpsStatus === 'denied' ? (
                  <span style={{ color: '#f87171', fontWeight: 600 }}>
                    Location access denied in browser
                  </span>
                ) : gpsStatus === 'unavailable' ? (
                  <span style={{ color: '#f87171', fontWeight: 600 }}>
                    Phone GPS is OFF or signal lost
                  </span>
                ) : gpsStatus === 'timeout' ? (
                  <span style={{ color: '#f87171', fontWeight: 600 }}>
                    GPS search timed out
                  </span>
                ) : (
                  <span style={{ color: '#cbd5e1' }}>
                    Enable Phone GPS to track distance
                  </span>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
              {gpsStatus === 'active' ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <button
                    type="button"
                    onClick={() => setSortByNearest(prev => !prev)}
                    style={{
                      background: sortByNearest ? '#10b981' : '#1e293b',
                      color: sortByNearest ? '#022c22' : '#94a3b8',
                      border: '1px solid ' + (sortByNearest ? '#10b981' : '#334155'),
                      padding: '5px 10px',
                      borderRadius: 6,
                      fontSize: 11,
                      fontWeight: 800,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                    }}
                  >
                    <NavigationIcon size={10} color={sortByNearest ? '#022c22' : '#94a3b8'} />
                    <span>{sortByNearest ? 'Nearest First' : 'Sort Nearest'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowCityPickerModal(true)}
                    style={{
                      background: '#1e293b',
                      color: '#94a3b8',
                      border: '1px solid #334155',
                      padding: '5px 8px',
                      borderRadius: 6,
                      fontSize: 10.5,
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                    title="Change delivery area"
                  >
                    Area ▾
                  </button>
                </div>
              ) : gpsStatus === 'requesting' ? (
                <button
                  type="button"
                  disabled
                  style={{
                    background: '#1e3a8a',
                    color: '#93c5fd',
                    border: '1px solid #2563eb',
                    padding: '5px 12px',
                    borderRadius: 6,
                    fontSize: 11,
                    fontWeight: 700,
                    cursor: 'wait',
                    opacity: 0.9,
                  }}
                >
                  Locating...
                </button>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => requestGps(false)}
                    style={{
                      background: '#2563eb',
                      color: '#ffffff',
                      border: 'none',
                      padding: '5px 12px',
                      borderRadius: 6,
                      fontSize: 11,
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    {gpsStatus === 'prompt' ? 'Enable GPS' : 'Retry GPS'}
                  </button>
                  {(gpsStatus === 'denied' || gpsStatus === 'unavailable' || gpsStatus === 'timeout') && (
                    <>
                      <button
                        type="button"
                        onClick={() => requestGps(true)}
                        style={{
                          background: '#334155',
                          color: '#cbd5e1',
                          border: '1px solid #475569',
                          padding: '5px 8px',
                          borderRadius: 6,
                          fontSize: 10.5,
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                        title="Use Cell/WiFi network location"
                      >
                        Network
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowCityPickerModal(true)}
                        style={{
                          background: '#059669',
                          color: '#ffffff',
                          border: 'none',
                          padding: '5px 9px',
                          borderRadius: 6,
                          fontSize: 10.5,
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                        title="Pick your city or area manually"
                      >
                        📍 Set Area
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Diagnostic Help Banner when GPS error occurs */}
          {gpsErrorText && gpsStatus !== 'active' && (
            <div
              style={{
                background: 'rgba(15, 23, 42, 0.7)',
                border: '1px solid rgba(239, 68, 68, 0.35)',
                borderRadius: 8,
                padding: '8px 10px',
                fontSize: 11.5,
                lineHeight: 1.4,
                color: '#fca5a5',
              }}
            >
              <div style={{ marginBottom: 4, fontWeight: 700, color: '#f87171' }}>
                {gpsStatus === 'denied' ? 'How to allow browser location:' : 'GPS Connection Note:'}
              </div>
              <div>{gpsErrorText}</div>
              <div style={{ marginTop: 6, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => setShowGpsHelpModal(true)}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    color: '#38bdf8',
                    textDecoration: 'underline',
                    cursor: 'pointer',
                    fontSize: 11,
                    fontWeight: 700,
                  }}
                >
                  Step-by-step phone settings guide ↗
                </button>
                <button
                  type="button"
                  onClick={() => setShowCityPickerModal(true)}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    color: '#34d399',
                    textDecoration: 'underline',
                    cursor: 'pointer',
                    fontSize: 11,
                    fontWeight: 700,
                  }}
                >
                  Pick delivery city manually ↗
                </button>
              </div>
            </div>
          )}
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
              const orderCoords = resolveOrderCoordinates(order)
              const distanceKm = (driverGps && orderCoords)
                ? calculateDistanceKm(driverGps.lat, driverGps.lng, orderCoords.lat, orderCoords.lng)
                : null
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
                        href={`/track/${order.tracking_token || order.code}`}
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

                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {offlineQueue.some(q => q.orderId === order.id) && (
                        <span
                          style={{
                            fontSize: 10,
                            fontWeight: 800,
                            padding: '2px 7px',
                            borderRadius: 99,
                            background: '#78350f',
                            color: '#fef08a',
                            border: '1px solid #ca8a04',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 3,
                          }}
                        >
                          <span>Pending Sync</span>
                        </span>
                      )}

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
                  </div>

                  {/* Special Service Type Alert for Courier */}
                  {order.service_type === 'replacement' && (
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        background: 'rgba(245, 158, 11, 0.15)',
                        border: '1px solid #f59e0b',
                        color: '#fef08a',
                        padding: '6px 10px',
                        borderRadius: 6,
                        fontSize: 12,
                        fontWeight: 800,
                        marginBottom: 10,
                      }}
                    >
                      <div>
                        <div>REPLACEMENT / تبديل</div>
                        <div style={{ fontSize: 11, fontWeight: 500, color: '#fde68a' }}>
                          Collect old item from customer before handing over this parcel!
                        </div>
                      </div>
                    </div>
                  )}

                  {order.service_type === 'pickup' && (
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        background: 'rgba(168, 85, 247, 0.15)',
                        border: '1px solid #a855f7',
                        color: '#e9d5ff',
                        padding: '6px 10px',
                        borderRadius: 6,
                        fontSize: 12,
                        fontWeight: 800,
                        marginBottom: 10,
                      }}
                    >
                      <div>
                        <div>RETURN PICKUP / استلام مرتجع</div>
                        <div style={{ fontSize: 11, fontWeight: 500, color: '#d8b4fe' }}>
                          Pick up package from client and return to hub/merchant.
                        </div>
                      </div>
                    </div>
                  )}

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

                    {/* Area & Address & Badges */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                      {order.area && (
                        <span style={{ fontSize: 11, fontWeight: 700, color: '#60a5fa', background: '#172554', padding: '1px 6px', borderRadius: 4 }}>
                          {order.area.name}
                        </span>
                      )}
                      {order.is_breakable && (
                        <span
                          style={{
                            fontSize: 10.5,
                            fontWeight: 800,
                            color: '#fca5a5',
                            background: '#7f1d1d',
                            padding: '1px 6px',
                            borderRadius: 4,
                            border: '1px solid #dc2626',
                          }}
                          title="Fragile / Breakable Content"
                        >
                          FRAGILE / كسر
                        </span>
                      )}
                      {order.weight_kg && order.weight_kg > 1 && (
                        <span style={{ fontSize: 10.5, fontWeight: 700, color: '#cbd5e1', background: '#334155', padding: '1px 6px', borderRadius: 4 }}>
                          {order.weight_kg}kg
                        </span>
                      )}
                      {parsedLoc.isCoords && (
                        <span style={{ fontSize: 10.5, fontWeight: 700, color: '#34d399', background: '#064e3b', padding: '1px 6px', borderRadius: 4 }}>
                          GPS Pin
                        </span>
                      )}
                      {distanceKm !== null && (
                        <span
                          style={{
                            fontSize: 10.5,
                            fontWeight: 800,
                            color: '#34d399',
                            background: 'rgba(16, 185, 129, 0.15)',
                            padding: '1px 7px',
                            borderRadius: 4,
                            border: '1px solid rgba(16, 185, 129, 0.3)',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 3,
                          }}
                        >
                          <NavigationIcon size={10} color="#34d399" />
                          {formatDistance(distanceKm)}
                        </span>
                      )}
                    </div>

                    <div style={{ fontSize: 12.5, color: '#cbd5e1', marginTop: 4, lineHeight: 1.4 }}>
                      {cleanAddr}
                    </div>

                    {order.notes && (
                      <div style={{ fontSize: 11, color: '#fde047', background: 'rgba(253, 224, 71, 0.1)', padding: '4px 8px', borderRadius: 6, marginTop: 6, border: '1px solid rgba(253, 224, 71, 0.2)' }}>
                        Note: {order.notes}
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
                      <NavigationIcon size={12} color="#ffffff" />
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
                        href={`https://wa.me/${normalizePhoneForWhatsApp(order.recipient_phone)}?text=${encodeURIComponent(
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
                        <WhatsAppIcon size={12} color="#64748b" />
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
                        <PhoneIcon size={12} color="#64748b" />
                        <span>No Tel</span>
                      </div>
                    )}
                  </div>

                  {/* Quick WhatsApp Presets */}
                  {order.recipient_phone && (
                    <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                      <a
                        href={`https://wa.me/${normalizePhoneForWhatsApp(order.recipient_phone)}?text=${encodeURIComponent(
                          `Hello ${order.recipient_name || 'Customer'}! I am your Cedar courier with delivery #${order.code}. Could you please send me your WhatsApp location pin to reach you quickly?`
                        )}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          flex: 1,
                          background: 'rgba(37, 211, 102, 0.1)',
                          border: '1px solid rgba(37, 211, 102, 0.3)',
                          color: '#4ade80',
                          padding: '6px 8px',
                          borderRadius: 6,
                          fontSize: 11,
                          fontWeight: 600,
                          textAlign: 'center',
                          textDecoration: 'none',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 4,
                        }}
                        title="Request location pin on WhatsApp"
                      >
                        <WhatsAppIcon size={12} color="#4ade80" />
                        <span>Ask Pin</span>
                      </a>

                      <a
                        href={`https://wa.me/${normalizePhoneForWhatsApp(order.recipient_phone)}?text=${encodeURIComponent(
                          `Hello ${order.recipient_name || 'Customer'}! I have arrived outside with your package #${order.code}. COD total: ${formatUSD(order.collection_usd)} (${formatLBP(usdToLbp(order.collection_usd, order.usd_to_lbp_rate || 89500))}). Please meet me outside.`
                        )}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          flex: 1,
                          background: 'rgba(59, 130, 246, 0.1)',
                          border: '1px solid rgba(59, 130, 246, 0.3)',
                          color: '#60a5fa',
                          padding: '6px 8px',
                          borderRadius: 6,
                          fontSize: 11,
                          fontWeight: 600,
                          textAlign: 'center',
                          textDecoration: 'none',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 4,
                        }}
                        title="Notify customer you have arrived"
                      >
                        <span>I'm Outside</span>
                      </a>
                    </div>
                  )}

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
                              View POD
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

      {/* ─── PWA INSTALL MODAL (iOS & Android Guide) ─── */}
      {showIosInstallModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.8)',
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '16px',
          }}
          onClick={() => setShowIosInstallModal(false)}
        >
          <div
            style={{
              background: '#1e293b',
              border: '1px solid #334155',
              borderRadius: 16,
              padding: '20px',
              maxWidth: 480,
              width: '100%',
              color: '#f8fafc',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <h3 style={{ fontSize: 16, fontWeight: 800, margin: 0 }}>Install Cedar on Your Phone</h3>
              <button
                type="button"
                onClick={() => setShowIosInstallModal(false)}
                style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: 20, cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            <p style={{ fontSize: 13, color: '#94a3b8', marginBottom: 16, lineHeight: 1.45 }}>
              Install Cedar Courier directly onto your phone&apos;s home screen to launch it anytime with 1-tap, just like a native app:
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, background: '#0f172a', padding: '10px 12px', borderRadius: 10 }}>
                <span style={{ width: 24, height: 24, borderRadius: '50%', background: '#2563eb', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, flexShrink: 0 }}>1</span>
                <div style={{ fontSize: 13, lineHeight: 1.4 }}>
                  <strong>In Safari (iPhone)</strong>, tap the <strong>Share</strong> button <span style={{ fontSize: 15 }}>⎋</span> (bottom bar). In Chrome (Android), tap the <strong>3 dots (⋮)</strong> menu.
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, background: '#0f172a', padding: '10px 12px', borderRadius: 10 }}>
                <span style={{ width: 24, height: 24, borderRadius: '50%', background: '#2563eb', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, flexShrink: 0 }}>2</span>
                <div style={{ fontSize: 13, lineHeight: 1.4 }}>
                  Scroll down the menu and tap <strong>Add to Home Screen</strong> <span style={{ fontSize: 15 }}>➕</span>.
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, background: '#0f172a', padding: '10px 12px', borderRadius: 10 }}>
                <span style={{ width: 24, height: 24, borderRadius: '50%', background: '#2563eb', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, flexShrink: 0 }}>3</span>
                <div style={{ fontSize: 13, lineHeight: 1.4 }}>
                  Tap <strong>Add</strong> in the top-right corner. The <strong>Cedar</strong> app icon will now appear on your home screen!
                </div>
              </div>
            </div>

            {isInAppBrowser && (
              <div style={{ background: 'rgba(245, 158, 11, 0.15)', border: '1px solid #f59e0b', borderRadius: 8, padding: '10px', fontSize: 12, color: '#fef08a', marginBottom: 16 }}>
                <strong>Note:</strong> You are currently viewing inside WhatsApp. Please tap the 3 dots in the corner and choose <u>Open in Safari</u> or <u>Open in Chrome</u> first.
              </div>
            )}

            <button
              type="button"
              onClick={() => setShowIosInstallModal(false)}
              style={{
                width: '100%',
                background: '#10b981',
                color: '#022c22',
                border: 'none',
                padding: '10px',
                borderRadius: 8,
                fontWeight: 800,
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              Got It
            </button>
          </div>
        </div>
      )}

      {/* ─── MANUAL CITY / AREA PICKER MODAL ─── */}
      {showCityPickerModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '16px',
          }}
          onClick={() => setShowCityPickerModal(false)}
        >
          <div
            style={{
              background: '#1e293b',
              border: '1px solid #334155',
              borderRadius: 16,
              padding: '20px',
              maxWidth: 440,
              width: '100%',
              color: '#f8fafc',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <h3 style={{ fontSize: 16, fontWeight: 800, margin: 0 }}>Select Delivery Area</h3>
              <button
                type="button"
                onClick={() => setShowCityPickerModal(false)}
                style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: 20, cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>
            <p style={{ fontSize: 12, color: '#94a3b8', marginBottom: 14 }}>
              Choose your current delivery area in Lebanon. Drop-off distances and &quot;Sort Nearest&quot; will immediately calculate from this location:
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
              {LEBANON_QUICK_CITIES.map(city => (
                <button
                  key={city.name}
                  type="button"
                  onClick={() => handleSelectManualCity(city)}
                  style={{
                    background: '#0f172a',
                    border: '1px solid #334155',
                    borderRadius: 8,
                    padding: '10px 12px',
                    color: '#f8fafc',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                    textAlign: 'left',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <span style={{ color: '#10b981' }}>📍</span>
                  <span>{city.name}</span>
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setShowCityPickerModal(false)}
              style={{
                width: '100%',
                background: '#334155',
                color: '#cbd5e1',
                border: 'none',
                padding: '8px',
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ─── PHONE GPS PERMISSION GUIDE MODAL ─── */}
      {showGpsHelpModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '16px',
          }}
          onClick={() => setShowGpsHelpModal(false)}
        >
          <div
            style={{
              background: '#1e293b',
              border: '1px solid #334155',
              borderRadius: 16,
              padding: '20px',
              maxWidth: 480,
              width: '100%',
              color: '#f8fafc',
              maxHeight: '90vh',
              overflowY: 'auto',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <h3 style={{ fontSize: 16, fontWeight: 800, margin: 0 }}>Phone GPS &amp; Permission Guide</h3>
              <button
                type="button"
                onClick={() => setShowGpsHelpModal(false)}
                style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: 20, cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            {isInAppBrowser && (
              <div style={{ background: 'rgba(245, 158, 11, 0.2)', border: '1px solid #f59e0b', borderRadius: 8, padding: '10px 12px', fontSize: 12, color: '#fef08a', marginBottom: 14 }}>
                <strong>⚠️ WhatsApp In-App Browser Warning:</strong> You are viewing inside WhatsApp. WhatsApp does NOT allow website GPS. Tap the 3 dots (⋮) in the corner and tap <u>Open in Safari</u> or <u>Open in Chrome</u>.
              </div>
            )}

            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#60a5fa', marginBottom: 6 }}>
                🍏 iPhone (iOS Safari)
              </div>
              <ol style={{ fontSize: 12, color: '#cbd5e1', paddingLeft: 18, margin: 0, lineHeight: 1.6 }}>
                <li>Open iPhone <strong>Settings</strong> $\rightarrow$ <strong>Privacy &amp; Security</strong> $\rightarrow$ <strong>Location Services</strong>.</li>
                <li>Ensure the top switch is turned <strong>ON</strong>.</li>
                <li>In that same list, tap <strong>Safari Websites</strong> $\rightarrow$ select <strong>&quot;While Using the App&quot;</strong> and turn <strong>&quot;Precise Location&quot; ON</strong>.</li>
                <li>Return to Safari, tap the <strong>aA</strong> icon in the address bar $\rightarrow$ <strong>Website Settings</strong> $\rightarrow$ set Location to <strong>Allow</strong>.</li>
              </ol>
            </div>

            <div style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#34d399', marginBottom: 6 }}>
                🤖 Android (Chrome)
              </div>
              <ol style={{ fontSize: 12, color: '#cbd5e1', paddingLeft: 18, margin: 0, lineHeight: 1.6 }}>
                <li>Swipe down the top notification shade on your phone and ensure <strong>Location / GPS</strong> is <strong>ON</strong>.</li>
                <li>In Chrome, tap the <strong>🔒 Lock icon</strong> in the address bar $\rightarrow$ <strong>Permissions</strong> $\rightarrow$ <strong>Location</strong> $\rightarrow$ set to <strong>Allow</strong>.</li>
                <li>If still blocked, open phone <strong>Settings</strong> $\rightarrow$ <strong>Apps</strong> $\rightarrow$ <strong>Chrome</strong> $\rightarrow$ <strong>Permissions</strong> $\rightarrow$ <strong>Location</strong> $\rightarrow$ select <strong>Allow only while using the app</strong>.</li>
              </ol>
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => {
                  setShowGpsHelpModal(false)
                  requestGps(false)
                }}
                style={{
                  flex: 1,
                  background: '#2563eb',
                  color: '#ffffff',
                  border: 'none',
                  padding: '10px',
                  borderRadius: 8,
                  fontWeight: 800,
                  fontSize: 12.5,
                  cursor: 'pointer',
                  minWidth: 120,
                }}
              >
                Retry GPS Now
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowGpsHelpModal(false)
                  setShowCityPickerModal(true)
                }}
                style={{
                  flex: 1,
                  background: '#059669',
                  color: '#ffffff',
                  border: 'none',
                  padding: '10px',
                  borderRadius: 8,
                  fontWeight: 800,
                  fontSize: 12.5,
                  cursor: 'pointer',
                  minWidth: 120,
                }}
              >
                📍 Pick City Instead
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
