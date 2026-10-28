'use client'

import { useCallback, useEffect, useState } from 'react'
import type { DriverLang, useDriverTranslation } from '@/lib/driver-i18n'
import { VAPID_PUBLIC_KEY, urlB64ToUint8Array, type DriverRunSheetOrder } from './shared'

interface AlertDeps {
  driver: { id: string }
  lang: DriverLang
  t: ReturnType<typeof useDriverTranslation>
  isStandaloneApp: boolean
  setShowIosInstallModal: (open: boolean) => void
  showNotification: (type: 'success' | 'error', message: string) => void
}

/** New-order chime, vibration, lock-screen notifications and web-push subscription. */
export function useOrderAlerts({ driver, lang, t, isStandaloneApp, setShowIosInstallModal, showNotification }: AlertDeps) {
  // Background Web Push Notification State
  const [pushSubscribed, setPushSubscribed] = useState<boolean>(false)
  const [pushLoading, setPushLoading] = useState<boolean>(false)

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

  // Check existing push subscription on load
  useEffect(() => {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window) {
      navigator.serviceWorker.ready.then(async reg => {
        try {
          const sub = await reg.pushManager.getSubscription()
          if (sub) {
            setPushSubscribed(true)
            setAlertsEnabled(true)
          }
        } catch (_e) {
          void _e
        }
      })
    }
  }, [])

  const handleSubscribePush = async () => {
    setPushLoading(true)
    playOrderChime()
    triggerVibration()

    try {
      if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
        showNotification('error', 'Push is not supported on this device/browser.')
        setPushLoading(false)
        return
      }

      // Detect iOS Safari (not running in standalone PWA mode)
      const isIos = typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent)
      if (isIos && !isStandaloneApp) {
        setShowIosInstallModal(true)
        showNotification(
          'error',
          lang === 'ar'
            ? 'على آيفون، يرجى إضافة التطبيق للشاشة الرئيسية أولاً لتفعيل الإشعارات'
            : 'On iPhone, tap Share -> Add to Home Screen, then open from Home Screen to enable alerts'
        )
        setPushLoading(false)
        return
      }

      if ('Notification' in window) {
        const perm = await Notification.requestPermission()
        if (perm !== 'granted') {
          showNotification('error', t('pushFailedToast'))
          setPushLoading(false)
          return
        }
      }

      let reg = await navigator.serviceWorker.getRegistration()
      if (!reg) {
        reg = await navigator.serviceWorker.register('/sw.js')
      }
      await navigator.serviceWorker.ready

      if (!reg || !('pushManager' in reg)) {
        showNotification('error', 'PushManager is not available on this device.')
        setPushLoading(false)
        return
      }

      let sub = await reg.pushManager.getSubscription()
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlB64ToUint8Array(VAPID_PUBLIC_KEY),
        })
      }

      const res = await fetch('/api/driver/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          driverId: driver.id,
          subscription: sub.toJSON(),
        }),
      })

      if (res.ok) {
        setPushSubscribed(true)
        setAlertsEnabled(true)
        showNotification('success', t('pushActiveToast'))
        // Send a test alert immediately so the courier sees the lock-screen notification work right now
        fetch('/api/driver/push/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            driverId: driver.id,
            test: true,
          }),
        }).catch(() => {})
      } else {
        showNotification('error', t('pushFailedToast'))
      }
    } catch (err) {
      console.warn('[Push Subscribe Error]:', err)
      showNotification('error', t('pushFailedToast'))
    } finally {
      setPushLoading(false)
    }
  }

  const handleTestPush = async () => {
    setPushLoading(true)
    playOrderChime()
    triggerVibration()
    try {
      const res = await fetch('/api/driver/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          driverId: driver.id,
          test: true,
        }),
      })
      if (res.ok) {
        showNotification('success', t('pushTestToast'))
      } else {
        showNotification('error', 'Failed to dispatch test alert.')
      }
    } catch (_e) {
      void _e
      showNotification('error', 'Failed to dispatch test alert.')
    } finally {
      setPushLoading(false)
    }
  }

  const handleEnableAlerts = async () => {
    await handleSubscribePush()
  }

  return {
    pushSubscribed,
    pushLoading,
    alertsEnabled,
    playOrderChime,
    triggerVibration,
    triggerPushNotification,
    handleSubscribePush,
    handleTestPush,
    handleEnableAlerts,
  }
}
