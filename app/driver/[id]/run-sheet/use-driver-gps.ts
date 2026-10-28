'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { LEBANON_QUICK_CITIES } from './shared'

export type GpsStatus = 'prompt' | 'requesting' | 'active' | 'denied' | 'unavailable' | 'timeout' | 'unsupported'

/** Courier position from the phone (or a manually picked city), reported to dispatch. */
export function useDriverGps(driver: { id: string }) {
  // Phone GPS & Navigation Proximity State
  const [driverGps, setDriverGps] = useState<{ lat: number; lng: number; accuracy?: number; label?: string } | null>(null)
  const [gpsStatus, setGpsStatus] = useState<GpsStatus>('prompt')
  const [gpsErrorText, setGpsErrorText] = useState<string | null>(null)
  const [sortByNearest, setSortByNearest] = useState<boolean>(false)
  const [showCityPickerModal, setShowCityPickerModal] = useState<boolean>(false)
  const [showGpsHelpModal, setShowGpsHelpModal] = useState<boolean>(false)

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

  return {
    driverGps,
    setDriverGps,
    gpsStatus,
    setGpsStatus,
    gpsErrorText,
    setGpsErrorText,
    sortByNearest,
    setSortByNearest,
    showCityPickerModal,
    setShowCityPickerModal,
    showGpsHelpModal,
    setShowGpsHelpModal,
    handleSelectManualCity,
    requestGps,
  }
}
