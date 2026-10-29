'use client'

import React, { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import {
  formatUSD,
  formatLBP,
  usdToLbp,
  ORDER_STATUS_LABELS,
} from '@/lib/utils'
import { WhatsAppIcon } from '@/components/whatsapp-icon'
import { GoogleMapsIcon } from '@/components/google-maps-icon'
import { getGoogleMapsDirectionsUrl } from '@/lib/maps'
import { getCustomerOrderWhatsAppUrl } from '@/lib/whatsapp'
import {
  ScanIcon,
  PackageIcon,
  CheckIcon,
  TruckIcon,
  PrinterIcon,
  SearchIcon,
  RefreshIcon,
  PhoneIcon,
  AlertCircleIcon,
} from '@/components/icons'

interface Driver {
  id: string
  name: string
  phone: string | null
  active: boolean
}

interface ScannedOrder {
  id: string
  code: string
  tracking_token?: string
  status: string
  collection_usd: number
  delivery_fee_usd: number
  driver_pay_usd: number
  shop_balance_usd: number
  usd_to_lbp_rate: number
  created_at: string
  delivered_at: string | null
  recipient_name: string | null
  recipient_phone: string | null
  recipient_address: string | null
  notes: string | null
  driver_id: string | null
  is_held?: boolean
  hub_id?: string | null
  storage_fee_usd?: number
  received_at_hub?: string | null
  route_position?: number | null
  shop?: { id: string; name: string; phone: string | null } | null
  area?: { id: string; name: string } | null
  driver?: { id: string; name: string; phone: string | null } | null
}

interface ScanClientProps {
  workspaceId: string
  drivers: Driver[]
  exchangeRate: number
}

// Audio synthesizer for scanner beep feedback
function playScannerBeep(success = true) {
  try {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!AudioContextClass) return
    const ctx = new AudioContextClass()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()

    osc.type = success ? 'sine' : 'sawtooth'
    osc.frequency.setValueAtTime(success ? 987.77 : 320, ctx.currentTime) // B5 for success, low buzz for fail
    if (success) {
      osc.frequency.exponentialRampToValueAtTime(1318.51, ctx.currentTime + 0.08) // E6 chirrup
    }

    gain.gain.setValueAtTime(0.2, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15)

    osc.connect(gain)
    gain.connect(ctx.destination)

    osc.start()
    osc.stop(ctx.currentTime + 0.16)
  } catch {
    // Audio context may be restricted by browser gesture policy
  }
}

// Haptic feedback
function triggerHaptic() {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    try {
      navigator.vibrate([40, 30, 60])
    } catch {
      // Ignore
    }
  }
}

export function ScanClient({ workspaceId, drivers, exchangeRate }: ScanClientProps) {
  const [isScanning, setIsScanning] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [manualCode, setManualCode] = useState('')
  const [scannedCode, setScannedCode] = useState<string | null>(null)
  const [order, setOrder] = useState<ScannedOrder | null>(null)
  const [loading, setLoading] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null)
  const [scanHistory, setScanHistory] = useState<Array<{ code: string; status: string; time: string }>>([])
  const [continuousMode, setContinuousMode] = useState(false)
  const [targetAction, setTargetAction] = useState<'view' | 'pickup' | 'deliver' | 'warehouse' | 'sort'>('sort')
  const [targetDriverId, setTargetDriverId] = useState<string>('')
  const [availableCameras, setAvailableCameras] = useState<Array<{ id: string; label: string }>>([])
  const [selectedCameraId, setSelectedCameraId] = useState<string>('')

  // Hub Sort Mode States
  const [deliveryAreas, setDeliveryAreas] = useState<Array<{ id: string; name: string; default_driver_id: string | null; assigned_driver_ids: string[] | null }>>([])
  const [sortedBags, setSortedBags] = useState<Record<string, ScannedOrder[]>>({})
  const [bagDriverAssignments, setBagDriverAssignments] = useState<Record<string, string>>({})

  // Warehouse Holding States
  const [warehouseHubs, setWarehouseHubs] = useState<Array<{ id: string; name: string; is_default?: boolean }>>([])
  const [warehouseHubId, setWarehouseHubId] = useState<string>('')
  const [warehouseShelfCode, setWarehouseShelfCode] = useState<string>('')
  const [warehouseReason, setWarehouseReason] = useState<string>('customer_request')
  const [warehouseDeliverAfter, setWarehouseDeliverAfter] = useState<string>('')
  const [warehouseNote, setWarehouseNote] = useState<string>('')

  useEffect(() => {
    fetch(`/api/hubs?workspaceId=${workspaceId}`)
      .then(res => res.json())
      .then(data => {
        if (data.hubs && data.hubs.length > 0) {
          setWarehouseHubs(data.hubs)
          const def = data.hubs.find((h: any) => h.is_default) || data.hubs[0]
          setWarehouseHubId(def.id)
        }
      })
      .catch(() => {})

    fetch(`/api/areas?workspaceId=${workspaceId}`)
      .then(res => res.json())
      .then(data => {
        if (data.areas) {
          setDeliveryAreas(data.areas)
        }
      })
      .catch(() => {})
  }, [workspaceId])

  const suggestedDriver = React.useMemo(() => {
    if (!order?.area?.id) return null
    const area = deliveryAreas.find(a => a.id === order.area?.id)
    if (!area) return null
    const targetDriverId = area.default_driver_id || (Array.isArray(area.assigned_driver_ids) && area.assigned_driver_ids[0])
    return drivers.find(d => d.id === targetDriverId) || null
  }, [order, deliveryAreas, drivers])

  const scannerRef = useRef<unknown>(null)
  const stoppingPromiseRef = useRef<Promise<void> | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const isProcessingRef = useRef(false)

  function showMessage(text: string, type: 'success' | 'error') {
    setStatusMessage({ text, type })
    setTimeout(() => setStatusMessage(null), 4000)
  }

  // Handle looking up an order from a scanned or typed raw string
  async function processCode(rawInput: string) {
    if (!rawInput || isProcessingRef.current) return
    isProcessingRef.current = true

    // 1. Extract clean order code: can be URL "https://.../track/CED-XXXX" or raw "CED-XXXX"
    let clean = rawInput.trim()
    const urlMatch = clean.match(/track\/([A-Za-z0-9_-]+)/i)
    if (urlMatch && urlMatch[1]) {
      clean = urlMatch[1]
    } else {
      // Remove any leading '#' or spaces
      clean = clean.replace(/^#/, '')
    }

    setScannedCode(clean)
    setLoading(true)

    try {
      // Fetch order by code
      const res = await fetch(`/api/orders?search=${encodeURIComponent(clean)}&exact=true`)
      const data = await res.json()

      let matchedOrder: ScannedOrder | null = null
      if (res.ok && data.orders && data.orders.length > 0) {
        // Find exact code match
        matchedOrder = data.orders.find((o: ScannedOrder) => o.code.toUpperCase() === clean.toUpperCase()) || data.orders[0]
      }

      if (!matchedOrder) {
        playScannerBeep(false)
        showMessage(`No order found matching "${clean}"`, 'error')
        setOrder(null)
      } else {
        playScannerBeep(true)
        triggerHaptic()
        setOrder(matchedOrder)

        // Add to scan history
        setScanHistory(prev => [
          { code: matchedOrder!.code, status: matchedOrder!.status, time: new Date().toLocaleTimeString() },
          ...prev.slice(0, 9),
        ])

        // Hub Sort Mode: mark received at hub and bucket into zone bag
        if (targetAction === 'sort') {
          if (!matchedOrder.received_at_hub) {
            fetch('/api/orders', {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                orderId: matchedOrder.id,
                workspaceId,
                receivedAtHub: true,
              }),
            }).catch(() => {})
            matchedOrder.received_at_hub = new Date().toISOString()
          }

          const zone = matchedOrder.area?.name || 'Unassigned Zone'
          setSortedBags(prev => {
            const list = prev[zone] || []
            if (list.some(o => o.id === matchedOrder!.id)) return prev
            return { ...prev, [zone]: [matchedOrder!, ...list] }
          })
        }

        // Automatic action if continuous mode is on
        if (continuousMode) {
          if (targetAction === 'pickup' && matchedOrder.status !== 'picked_up') {
            await handleUpdateStatus(matchedOrder.id, 'picked_up', targetDriverId || undefined)
          } else if (targetAction === 'deliver' && matchedOrder.status !== 'delivered') {
            await handleUpdateStatus(matchedOrder.id, 'delivered')
          } else if (targetAction === 'warehouse') {
            if (matchedOrder.is_held) {
              await handleWarehouseRelease(matchedOrder.id)
            } else if (warehouseHubId) {
              await handleWarehouseHold(matchedOrder.id)
            }
          }
        }
      }
    } catch {
      playScannerBeep(false)
      showMessage('Error querying order details', 'error')
    } finally {
      setLoading(false)
      setTimeout(() => {
        isProcessingRef.current = false
      }, 1200)
    }
  }

  // Update order status or assigned driver
  async function handleUpdateStatus(orderId: string, newStatus: string, driverId?: string) {
    setActionLoading(true)
    try {
      const payload: Record<string, unknown> = {
        orderId,
        workspaceId,
        status: newStatus,
      }
      if (driverId) {
        payload.driverId = driverId
      }

      const res = await fetch('/api/orders', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to update order')

      showMessage(`Order ${order?.code || ''} updated to ${ORDER_STATUS_LABELS[newStatus as keyof typeof ORDER_STATUS_LABELS] || newStatus}!`, 'success')

      // Update local order view
      setOrder(prev => prev ? { ...prev, status: newStatus, driver_id: driverId || prev.driver_id } : null)
    } catch (err: unknown) {
      showMessage(err instanceof Error ? err.message : 'Update failed', 'error')
    } finally {
      setActionLoading(false)
    }
  }

  // Assign driver to order
  async function handleAssignDriver(driverId: string) {
    if (!order) return
    setActionLoading(true)
    try {
      const res = await fetch('/api/orders', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: order.id,
          workspaceId,
          driverId: driverId || null,
          status: driverId && order.status === 'pending' ? 'assigned' : order.status,
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to assign courier')

      const foundDriver = drivers.find(d => d.id === driverId)
      setOrder(prev => prev ? {
        ...prev,
        driver_id: driverId || null,
        driver: foundDriver || null,
        status: driverId && prev.status === 'pending' ? 'assigned' : prev.status,
      } : null)

      showMessage(`Assigned to ${foundDriver?.name || 'Unassigned'}`, 'success')
    } catch (err: unknown) {
      showMessage(err instanceof Error ? err.message : 'Failed to assign driver', 'error')
    } finally {
      setActionLoading(false)
    }
  }

  async function handleWarehouseHold(orderId: string) {
    if (!warehouseHubId) {
      showMessage('Please select a warehouse hub', 'error')
      return
    }
    setActionLoading(true)
    try {
      const res = await fetch('/api/warehouse/hold', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId,
          orderIds: [orderId],
          hubId: warehouseHubId,
          shelfCode: warehouseShelfCode.trim() || null,
          reason: warehouseReason,
          deliverAfter: warehouseDeliverAfter || null,
          note: warehouseNote.trim() || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to hold order')
      setOrder(prev => prev ? { ...prev, is_held: true, hub_id: warehouseHubId, status: 'pending', driver_id: null, driver: null } : null)
      playScannerBeep(true)
      showMessage(`Parcel stored in warehouse (Shelf: ${warehouseShelfCode || 'Hub'})`, 'success')
    } catch (err: unknown) {
      playScannerBeep(false)
      showMessage(err instanceof Error ? err.message : 'Failed to hold order', 'error')
    } finally {
      setActionLoading(false)
    }
  }

  async function handleWarehouseRelease(orderId: string) {
    setActionLoading(true)
    try {
      const res = await fetch('/api/warehouse/release', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId,
          orderIds: [orderId],
          note: 'Warehouse scan release to dispatch',
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to release order')
      setOrder(prev => prev ? { ...prev, is_held: false, status: 'pending' } : null)
      playScannerBeep(true)
      showMessage('Parcel released from warehouse to dispatch', 'success')
    } catch (err: unknown) {
      playScannerBeep(false)
      showMessage(err instanceof Error ? err.message : 'Failed to release order', 'error')
    } finally {
      setActionLoading(false)
    }
  }

  // 1-Click assign entire zone bag to courier
  async function handleAssignZoneBag(zoneName: string, driverId: string) {
    const list = sortedBags[zoneName] || []
    if (list.length === 0 || !driverId) return
    setActionLoading(true)
    try {
      const res = await fetch('/api/orders/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId,
          orderIds: list.map(o => o.id),
          action: 'assign_driver',
          driverId,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to assign zone bag')
      const driver = drivers.find(d => d.id === driverId)
      showMessage(`Assigned all ${list.length} parcels in ${zoneName} to ${driver?.name || 'Courier'}!`, 'success')
      setSortedBags(prev => {
        const next = { ...prev }
        delete next[zoneName]
        return next
      })
    } catch (err: unknown) {
      showMessage(err instanceof Error ? err.message : 'Bulk assign failed', 'error')
    } finally {
      setActionLoading(false)
    }
  }

  // Camera Scanner Lifecycle
  useEffect(() => {
    let isCancelled = false
    let origCreateElement: typeof document.createElement | null = null

    async function startScanner() {
      if (!isScanning) return
      setCameraError(null)

      // Wait for any previous scanner instance to stop completely before starting a new track
      if (stoppingPromiseRef.current) {
        try {
          await stoppingPromiseRef.current
        } catch (e: unknown) {
          void e
        }
      }

      // Stop any lingering media stream tracks on the DOM element
      try {
        const existingVideo = document.querySelector('#qr-reader video') as HTMLVideoElement | null
        if (existingVideo && existingVideo.srcObject) {
          const stream = existingVideo.srcObject as MediaStream
          stream.getTracks().forEach((t) => t.stop())
          existingVideo.srcObject = null
        }
      } catch (e: unknown) {
        void e
      }

      if (isCancelled) return

      try {
        // Critical iOS Safari fix: Intercept document.createElement so every video element created by
        // Html5Qrcode has playsinline and webkit-playsinline attributes BEFORE play() is triggered.
        origCreateElement = document.createElement.bind(document)
        document.createElement = function <K extends keyof HTMLElementTagNameMap>(
          tagName: K,
          options?: ElementCreationOptions
        ): HTMLElementTagNameMap[K] {
          const el = origCreateElement!(tagName, options)
          if (typeof tagName === 'string' && tagName.toLowerCase() === 'video') {
            const video = el as unknown as HTMLVideoElement
            video.setAttribute('playsinline', 'true')
            video.setAttribute('webkit-playsinline', 'true')
            video.setAttribute('muted', 'true')
            video.setAttribute('autoplay', 'true')
            video.muted = true
            video.playsInline = true
            video.autoplay = true
            video.style.background = 'transparent'

            const onReady = () => {
              video.setAttribute('playsinline', 'true')
              video.setAttribute('webkit-playsinline', 'true')
              video.muted = true
              video.style.background = 'transparent'
              if (video.paused && video.srcObject) {
                video.play().catch(() => {})
              }
              // Dispatch "playing" event to wake up html5-qrcode's setupUi callback
              setTimeout(() => {
                if (!video.paused || video.currentTime > 0) {
                  video.dispatchEvent(new Event('playing'))
                }
              }, 120)
            }

            video.addEventListener('loadedmetadata', onReady)
            video.addEventListener('loadeddata', onReady)
            video.addEventListener('canplay', onReady)
          }
          return el
        }

        // Dynamic import to prevent SSR issues
        const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import('html5-qrcode')
        if (isCancelled) return

        const scannerElement = document.getElementById('qr-reader')
        if (!scannerElement) return

        const formatsToSupport = [
          Html5QrcodeSupportedFormats.QR_CODE,
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.CODE_39,
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.UPC_A,
        ]

        // useBarCodeDetectorIfSupported: false ensures tested ZXing engine is used everywhere
        // and avoids experimental BarcodeDetector hanging on iOS 17/18 Safari
        const html5QrCode = new Html5Qrcode('qr-reader', {
          formatsToSupport,
          verbose: false,
          experimentalFeatures: {
            useBarCodeDetectorIfSupported: false,
          },
        })
        scannerRef.current = html5QrCode

        // Default camera config: use environment (rear) camera unless user explicitly picked a specific ID
        const cameraConfig = selectedCameraId
          ? selectedCameraId
          : { facingMode: 'environment' }

        await html5QrCode.start(
          cameraConfig,
          {
            fps: 15,
            qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
              const minEdge = Math.min(viewfinderWidth, viewfinderHeight)
              const edge = Math.floor(minEdge * 0.75)
              const width = Math.max(160, Math.min(Math.floor(edge * 1.3), Math.max(160, viewfinderWidth - 24)))
              const height = Math.max(100, Math.min(Math.floor(edge * 0.8), Math.max(100, viewfinderHeight - 24)))
              return { width, height }
            },
          },
          (decodedText: string) => {
            processCode(decodedText)
          },
          () => {
            // Frame scan failure, ignore
          }
        )

        if (isCancelled) {
          html5QrCode.stop().catch((e: unknown) => { void e }).finally(() => {
            html5QrCode.clear()
          })
          return
        }

        // Ensure video element attributes and start playback on mobile WebKit / iOS Safari
        const enforceVideoPlay = () => {
          const video = document.querySelector('#qr-reader video') as HTMLVideoElement | null
          if (video) {
            video.setAttribute('playsinline', 'true')
            video.setAttribute('webkit-playsinline', 'true')
            video.muted = true
            video.style.background = 'transparent'
            video.style.objectFit = 'cover'
            video.style.display = 'block'
            if (video.paused) {
              video.play().catch(() => {})
            }
          }
        }

        enforceVideoPlay()
        setTimeout(enforceVideoPlay, 100)
        setTimeout(enforceVideoPlay, 350)

        // On iOS Safari, a fast pause/resume flushes the WebKit video layer buffer to eliminate black screens
        setTimeout(() => {
          if (html5QrCode && typeof html5QrCode.pause === 'function' && typeof html5QrCode.resume === 'function') {
            try {
              html5QrCode.pause(false)
              setTimeout(() => {
                try {
                  html5QrCode.resume()
                } catch (e: unknown) { void e }
              }, 80)
            } catch (e: unknown) { void e }
          }
        }, 450)

        // Enumerate cameras in the background to populate the switcher dropdown (without auto-selecting)
        Html5Qrcode.getCameras().then((cameras) => {
          if (cameras && cameras.length > 0 && !isCancelled) {
            setAvailableCameras(
              cameras.map((c) => ({
                id: c.id,
                label: c.label || `Camera (${c.id.slice(0, 6)})`,
              }))
            )
          }
        }).catch((e: unknown) => { void e })

      } catch (err: unknown) {
        if (!isCancelled) {
          setCameraError(
            err instanceof Error
              ? err.message
              : 'Could not access device camera. Please check browser permissions and ensure no other app is using it.'
          )
          setIsScanning(false)
        }
      } finally {
        if (origCreateElement) {
          document.createElement = origCreateElement
        }
      }
    }

    if (isScanning) {
      startScanner()
    } else if (scannerRef.current) {
      const instance = scannerRef.current as { stop: () => Promise<void>; clear: () => void }
      scannerRef.current = null
      stoppingPromiseRef.current = instance.stop().catch((e: unknown) => { void e }).finally(() => {
        instance.clear()
        stoppingPromiseRef.current = null
      })
    }

    return () => {
      isCancelled = true
      if (origCreateElement) {
        document.createElement = origCreateElement
      }
      if (scannerRef.current) {
        const instance = scannerRef.current as { stop: () => Promise<void>; clear: () => void }
        scannerRef.current = null
        stoppingPromiseRef.current = instance.stop().catch((e: unknown) => { void e }).finally(() => {
          instance.clear()
          stoppingPromiseRef.current = null
        })
      }
    }
  }, [isScanning, selectedCameraId])

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', paddingBottom: 60 }}>
      {/* Page Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <ScanIcon size={24} color="var(--brand)" />
            <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>Parcel Barcode & QR Scanner</h1>
          </div>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--muted)' }}>
            Point your camera or use a USB barcode laser gun to scan package shipping labels instantly.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            type="button"
            className={isScanning ? 'btn btn-secondary' : 'btn btn-primary'}
            onClick={() => {
              setCameraError(null)
              setIsScanning(!isScanning)
            }}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
          >
            <ScanIcon size={16} />
            <span>{isScanning ? 'Stop Camera' : 'Start Camera Scanner'}</span>
          </button>
        </div>
      </div>

      {/* Notification Toast */}
      {statusMessage && (
        <div
          style={{
            padding: '12px 18px',
            borderRadius: 10,
            marginBottom: 20,
            fontSize: 14,
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            background: statusMessage.type === 'success' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
            border: `1px solid ${statusMessage.type === 'success' ? '#10b981' : '#ef4444'}`,
            color: statusMessage.type === 'success' ? '#34d399' : '#f87171',
          }}
        >
          {statusMessage.type === 'success' ? <CheckIcon size={18} /> : <AlertCircleIcon size={18} />}
          <span>{statusMessage.text}</span>
        </div>
      )}

      {/* Scanner & Manual Input Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20, marginBottom: 24 }}>
        {/* Left Column: Viewfinder / Manual input */}
        <div className="panel" style={{ padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <span style={{ fontSize: 14, fontWeight: 700 }}>Optical Camera Viewfinder</span>
            {isScanning && (
              <span style={{ fontSize: 11, fontWeight: 700, color: '#10b981', display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#10b981', display: 'inline-block' }} />
                LIVE
              </span>
            )}
          </div>

          {/* Camera Viewfinder Box Container */}
          <div
            style={{
              width: '100%',
              minHeight: 280,
              background: '#0a0f1d',
              borderRadius: 12,
              overflow: 'hidden',
              border: isScanning ? '2px solid var(--brand)' : '1px dashed var(--line)',
              position: 'relative',
            }}
          >
            {/* The dedicated clean DOM container for Html5Qrcode. MUST be completely empty of React child nodes when active */}
            <div id="qr-reader" style={{ width: '100%', minHeight: isScanning ? 280 : 0 }} />

            {/* Inactive state placeholder - rendered as absolute overlay so it never touches #qr-reader DOM */}
            {!isScanning && (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  textAlign: 'center',
                  padding: 30,
                  color: 'var(--muted)',
                }}
              >
                <ScanIcon size={40} style={{ margin: '0 auto 12px', opacity: 0.5 }} />
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>Camera is Off</div>
                <div style={{ fontSize: 12, marginTop: 4 }}>Click &quot;Start Camera Scanner&quot; above to scan with your phone or webcam</div>
              </div>
            )}
          </div>

          {/* Camera Switcher (shown on multi-camera devices like iPhones and Android smartphones) */}
          {availableCameras.length > 1 && (
            <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
              <span style={{ color: 'var(--muted)', fontWeight: 600, whiteSpace: 'nowrap' }}>Camera:</span>
              <select
                value={selectedCameraId}
                onChange={(e) => setSelectedCameraId(e.target.value)}
                style={{
                  flex: 1,
                  padding: '6px 10px',
                  borderRadius: 6,
                  background: 'var(--surface)',
                  border: '1px solid var(--line)',
                  color: 'var(--ink)',
                  fontSize: 12,
                }}
              >
                <option value="">Default Rear Lens</option>
                {availableCameras.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Video element styling for responsive mobile camera streaming (iOS Safari & Android) */}
          <style
            dangerouslySetInnerHTML={{
              __html: `
                #qr-reader {
                  width: 100% !important;
                  border: none !important;
                  position: relative !important;
                  background: transparent !important;
                }
                #qr-reader video {
                  width: 100% !important;
                  height: 100% !important;
                  min-height: 280px !important;
                  max-height: 480px !important;
                  object-fit: cover !important;
                  border-radius: 10px !important;
                  display: block !important;
                  background: transparent !important;
                  -webkit-transform: translateZ(0);
                  transform: translateZ(0);
                }
                #qr-reader__scan_region {
                  position: relative !important;
                  width: 100% !important;
                  min-height: 280px !important;
                  display: flex !important;
                  align-items: center !important;
                  justify-content: center !important;
                  background: transparent !important;
                }
                #qr-reader__scan_region video {
                  width: 100% !important;
                  height: 100% !important;
                  min-height: 280px !important;
                  max-height: 480px !important;
                  object-fit: cover !important;
                  border-radius: 10px !important;
                  display: block !important;
                  background: transparent !important;
                  -webkit-transform: translateZ(0);
                  transform: translateZ(0);
                }
                #qr-reader__dashboard {
                  display: none !important;
                }
                #qr-reader__scan_region img {
                  display: none !important;
                }
                #qr-shaded-region {
                  border-color: rgba(0, 0, 0, 0.45) !important;
                }
              `,
            }}
          />

          {cameraError && (
            <div style={{ marginTop: 12, fontSize: 12, color: '#f87171', background: 'rgba(239, 68, 68, 0.1)', padding: '8px 12px', borderRadius: 8 }}>
              {cameraError}
            </div>
          )}

          {/* Laser Scanner / Keyboard Manual Input */}
          <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--line)' }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--muted)', marginBottom: 6 }}>
              OR SCAN VIA USB BARCODE GUN / TYPE CODE:
            </label>
            <form
              onSubmit={(e) => {
                e.preventDefault()
                processCode(manualCode)
                setManualCode('')
              }}
              style={{ display: 'flex', gap: 8 }}
            >
              <input
                ref={inputRef}
                type="text"
                placeholder="e.g. CED-000142"
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
                style={{
                  flex: 1,
                  padding: '10px 14px',
                  background: 'var(--surface)',
                  border: '1px solid var(--line)',
                  borderRadius: 8,
                  fontSize: 14,
                  fontWeight: 600,
                  color: 'var(--ink)',
                }}
              />
              <button type="submit" className="btn btn-secondary" style={{ padding: '10px 16px' }}>
                <SearchIcon size={15} />
              </button>
            </form>
          </div>
        </div>

        {/* Right Column: Workflow Automation Settings */}
        <div className="panel" style={{ padding: 20 }}>
          <span style={{ fontSize: 14, fontWeight: 700, display: 'block', marginBottom: 12 }}>
            Batch Workflow Automation
          </span>

          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', marginBottom: 16 }}>
            <input
              type="checkbox"
              checked={continuousMode}
              onChange={(e) => setContinuousMode(e.target.checked)}
              style={{ width: 18, height: 18, accentColor: 'var(--brand)' }}
            />
            <div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>Continuous Scan Mode</div>
              <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                Automatically apply designated action immediately upon detecting a package
              </div>
            </div>
          </label>

          {continuousMode && (
            <div style={{ padding: 14, background: 'rgba(20, 83, 45, 0.08)', borderRadius: 10, border: '1px solid var(--line)', marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8, color: 'var(--brand)' }}>
                When a package barcode is detected:
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="action"
                    checked={targetAction === 'sort'}
                    onChange={() => setTargetAction('sort')}
                  />
                  <span style={{ fontWeight: 600, color: 'var(--brand)' }}>
                    ⚡ Sort Mode (Huge Zone Display, Suggested Courier & Hub Intake)
                  </span>
                </label>

                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="action"
                    checked={targetAction === 'view'}
                    onChange={() => setTargetAction('view')}
                  />
                  <span>Just show details & verification</span>
                </label>

                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="action"
                    checked={targetAction === 'pickup'}
                    onChange={() => setTargetAction('pickup')}
                  />
                  <span>Mark In-Transit / Picked Up & assign to:</span>
                </label>

                {targetAction === 'pickup' && (
                  <select
                    value={targetDriverId}
                    onChange={(e) => setTargetDriverId(e.target.value)}
                    style={{
                      padding: '8px 12px',
                      borderRadius: 8,
                      border: '1px solid var(--line)',
                      background: 'var(--surface)',
                      color: 'var(--ink)',
                      fontSize: 13,
                      marginLeft: 22,
                    }}
                  >
                    <option value="">Keep current driver</option>
                    {drivers.map(d => (
                      <option key={d.id} value={d.id}>{d.name} {d.phone ? `(${d.phone})` : ''}</option>
                    ))}
                  </select>
                )}

                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="action"
                    checked={targetAction === 'deliver'}
                    onChange={() => setTargetAction('deliver')}
                  />
                  <span>Mark Delivered & Record COD collection</span>
                </label>

                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="action"
                    checked={targetAction === 'warehouse'}
                    onChange={() => setTargetAction('warehouse')}
                  />
                  <span>Warehouse Hub (Intake / Hold / Release)</span>
                </label>

                {targetAction === 'warehouse' && (
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 8,
                      marginTop: 4,
                      marginLeft: 22,
                      padding: 10,
                      background: 'var(--ui-surface-2)',
                      border: '1px solid var(--ui-border)',
                      borderRadius: 6,
                    }}
                  >
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      <div>
                        <label style={{ display: 'block', fontSize: 11, fontWeight: 700, marginBottom: 4 }}>
                          Warehouse Hub
                        </label>
                        <select
                          value={warehouseHubId}
                          onChange={e => setWarehouseHubId(e.target.value)}
                          style={{
                            width: '100%',
                            padding: '6px 8px',
                            borderRadius: 6,
                            border: '1px solid var(--line)',
                            background: 'var(--surface)',
                            fontSize: 12,
                          }}
                        >
                          {warehouseHubs.map(h => (
                            <option key={h.id} value={h.id}>
                              {h.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: 11, fontWeight: 700, marginBottom: 4 }}>
                          Shelf Code
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. A-01"
                          value={warehouseShelfCode}
                          onChange={e => setWarehouseShelfCode(e.target.value.toUpperCase())}
                          style={{
                            width: '100%',
                            padding: '6px 8px',
                            borderRadius: 6,
                            border: '1px solid var(--line)',
                            background: 'var(--surface)',
                            fontSize: 12,
                            fontFamily: 'monospace',
                          }}
                        />
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      <div>
                        <label style={{ display: 'block', fontSize: 11, fontWeight: 700, marginBottom: 4 }}>
                          Reason
                        </label>
                        <select
                          value={warehouseReason}
                          onChange={e => setWarehouseReason(e.target.value)}
                          style={{
                            width: '100%',
                            padding: '6px 8px',
                            borderRadius: 6,
                            border: '1px solid var(--line)',
                            background: 'var(--surface)',
                            fontSize: 12,
                          }}
                        >
                          <option value="customer_request">Customer Rescheduled</option>
                          <option value="weather">Severe Weather</option>
                          <option value="far_zone">Far Zone Trip</option>
                          <option value="scheduled">Scheduled Future Date</option>
                          <option value="address_problem">Address Issue</option>
                          <option value="shop_request">Merchant Request</option>
                          <option value="other">Other Warehouse Reason</option>
                        </select>
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: 11, fontWeight: 700, marginBottom: 4 }}>
                          Deliver After
                        </label>
                        <input
                          type="date"
                          value={warehouseDeliverAfter}
                          onChange={e => setWarehouseDeliverAfter(e.target.value)}
                          style={{
                            width: '100%',
                            padding: '6px 8px',
                            borderRadius: 6,
                            border: '1px solid var(--line)',
                            background: 'var(--surface)',
                            fontSize: 12,
                          }}
                        />
                      </div>
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: 11, fontWeight: 700, marginBottom: 4 }}>
                        Note (Optional)
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Call customer before dispatch"
                        value={warehouseNote}
                        onChange={e => setWarehouseNote(e.target.value)}
                        style={{
                          width: '100%',
                          padding: '6px 8px',
                          borderRadius: 6,
                          border: '1px solid var(--line)',
                          background: 'var(--surface)',
                          fontSize: 12,
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Recent Scans Strip */}
          <div style={{ marginTop: 20 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', display: 'block', marginBottom: 8 }}>
              SESSION SCAN HISTORY
            </span>

            {scanHistory.length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--muted)', fontStyle: 'italic' }}>No packages scanned yet in this session.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {scanHistory.map((item, idx) => (
                  <div
                    key={idx}
                    onClick={() => processCode(item.code)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '6px 10px',
                      background: 'var(--surface)',
                      borderRadius: 6,
                      fontSize: 12,
                      cursor: 'pointer',
                    }}
                  >
                    <span style={{ fontWeight: 700, color: 'var(--brand)' }}>{item.code}</span>
                    <span style={{ color: 'var(--muted)' }}>{item.time}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Scanned Order Details Panel */}
      {loading && (
        <div className="panel" style={{ padding: 30, textAlign: 'center', color: 'var(--muted)' }}>
          <RefreshIcon size={24} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 8px' }} />
          <div>Looking up order #{scannedCode}…</div>
        </div>
      )}

      {order && !loading && (
        <div
          className="panel"
          style={{
            padding: 24,
            borderColor: 'var(--brand)',
            boxShadow: '0 8px 30px rgba(20, 83, 45, 0.15)',
            background: 'linear-gradient(135deg, var(--surface) 0%, rgba(20, 83, 45, 0.03) 100%)',
          }}
        >
          {/* Hub Sort Mode Huge Zone & Courier Banner */}
          {targetAction === 'sort' && (
            <div
              style={{
                padding: '24px 28px',
                background: 'linear-gradient(135deg, #15803d 0%, #166534 100%)',
                borderRadius: 14,
                color: '#ffffff',
                textAlign: 'center',
                marginBottom: 22,
                boxShadow: '0 8px 24px rgba(22, 101, 52, 0.35)',
              }}
            >
              <div style={{ fontSize: 13, textTransform: 'uppercase', letterSpacing: 2, fontWeight: 800, opacity: 0.9 }}>
                SORT DESTINATION ZONE
              </div>
              <div
                style={{
                  fontSize: 48,
                  fontWeight: 900,
                  letterSpacing: -1,
                  margin: '10px 0',
                  textShadow: '0 2px 10px rgba(0,0,0,0.2)',
                }}
              >
                {order.area?.name || 'No Zone Assigned'}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, flexWrap: 'wrap' }}>
                {suggestedDriver ? (
                  <div
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 8,
                      background: 'rgba(255, 255, 255, 0.22)',
                      padding: '8px 18px',
                      borderRadius: 999,
                      fontSize: 15,
                      fontWeight: 700,
                    }}
                  >
                    <span>Suggested Courier:</span>
                    <strong style={{ textDecoration: 'underline' }}>{suggestedDriver.name}</strong>
                  </div>
                ) : (
                  <div style={{ fontSize: 13, opacity: 0.85 }}>
                    No assigned courier in zone pool
                  </div>
                )}
                {order.received_at_hub && (
                  <div
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      background: '#047857',
                      padding: '6px 14px',
                      borderRadius: 999,
                      fontSize: 13,
                      fontWeight: 700,
                    }}
                  >
                    <span>✓ Checked In at Hub</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Header row */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 14, marginBottom: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 12,
                  background: 'var(--brand)',
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <PackageIcon size={24} />
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <h2 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>
                    {order.code}
                  </h2>
                  <span className={`badge badge-${order.status}`}>
                    {ORDER_STATUS_LABELS[order.status as keyof typeof ORDER_STATUS_LABELS] || order.status}
                  </span>
                </div>
                <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2 }}>
                  Store: <strong>{order.shop?.name || 'Standard Store'}</strong>
                  {order.shop?.phone && ` (${order.shop.phone})`}
                </div>
              </div>
            </div>

            {/* Quick Link Buttons */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Link
                href={`/print/order/${order.code}`}
                target="_blank"
                className="btn btn-secondary"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                <PrinterIcon size={14} />
                Print Label
              </Link>

              <Link
                href={`/track/${order.tracking_token || order.code}`}
                target="_blank"
                className="btn btn-ghost"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                Public Tracking
              </Link>
            </div>
          </div>

          {/* Held Notification Banner */}
          {order.is_held && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '10px 14px',
                background: 'var(--ui-warning-soft, #fef3c7)',
                border: '1px solid var(--ui-warning, #f59e0b)',
                borderRadius: 8,
                color: 'var(--ui-warning-text, #92400e)',
                fontWeight: 700,
                fontSize: 13,
                marginBottom: 20,
              }}
            >
              <span>📦</span>
              <span>This parcel is currently in storage at the warehouse. Couriers cannot be assigned until released.</span>
            </div>
          )}

          {/* Details Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginBottom: 20 }}>
            {/* Recipient */}
            <div style={{ padding: 14, background: 'var(--background)', borderRadius: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>
                Recipient
              </div>
              <div style={{ fontSize: 15, fontWeight: 700, marginTop: 4 }}>
                {order.recipient_name || 'Anonymous Recipient'}
              </div>
              {order.recipient_phone && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                  <a
                    href={`tel:${order.recipient_phone}`}
                    style={{ fontSize: 13, color: 'var(--ink)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}
                  >
                    <PhoneIcon size={12} />
                    {order.recipient_phone}
                  </a>

                  <a
                    href={getCustomerOrderWhatsAppUrl({
                      customerPhone: order.recipient_phone,
                      customerName: order.recipient_name,
                      orderCode: order.code,
      trackingToken: order.tracking_token,
                      shopName: order.shop?.name,
                      collectionUsd: Number(order.collection_usd) || 0,
                      driverName: order.driver?.name,
                      status: order.status,
                    })}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="whatsapp-badge"
                    style={{ padding: '2px 6px', fontSize: 11 }}
                  >
                    <WhatsAppIcon size={12} />
                    WhatsApp
                  </a>
                </div>
              )}
            </div>

            {/* Address */}
            <div style={{ padding: 14, background: 'var(--background)', borderRadius: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>
                Delivery Location
              </div>
              <div style={{ fontSize: 13, fontWeight: 600, marginTop: 4 }}>
                {order.recipient_address || 'No specific street address provided'}
              </div>
              {order.area && (
                <div style={{ fontSize: 12, color: 'var(--brand)', marginTop: 4 }}>
                  Zone: {order.area.name}
                </div>
              )}
              {order.recipient_address && (
                <div style={{ marginTop: 8 }}>
                  <a
                    href={getGoogleMapsDirectionsUrl(order.recipient_address)}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ fontSize: 12, color: 'var(--brand)', display: 'inline-flex', alignItems: 'center', gap: 4, textDecoration: 'none' }}
                  >
                    <GoogleMapsIcon size={12} />
                    Open in Maps
                  </a>
                </div>
              )}
            </div>

            {/* COD Cash Amount */}
            <div style={{ padding: 14, background: 'var(--background)', borderRadius: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>
                COD Cash Collection
              </div>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#10b981', marginTop: 4 }}>
                {formatUSD(Number(order.collection_usd) || 0)}
              </div>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                ≈ {formatLBP(usdToLbp(Number(order.collection_usd) || 0, exchangeRate))}
              </div>
            </div>

            {/* Assigned Driver */}
            <div style={{ padding: 14, background: 'var(--background)', borderRadius: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>
                Courier Assignment
              </div>
              <div style={{ marginTop: 6 }}>
                <select
                  value={order.driver_id || ''}
                  disabled={actionLoading}
                  onChange={(e) => handleAssignDriver(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: 8,
                    border: '1px solid var(--line)',
                    background: 'var(--surface)',
                    color: 'var(--ink)',
                    fontSize: 13,
                    fontWeight: 600,
                  }}
                >
                  <option value="">— Unassigned —</option>
                  {drivers.map(d => (
                    <option key={d.id} value={d.id}>
                      {d.name} {d.phone ? `(${d.phone})` : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Fast Status Action Buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', borderTop: '1px solid var(--line)', paddingTop: 16 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)' }}>Quick Actions:</span>

            {order.is_held ? (
              <button
                type="button"
                disabled={actionLoading}
                onClick={() => handleWarehouseRelease(order.id)}
                className="btn btn-primary"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  background: 'var(--ui-warning, #f59e0b)',
                  borderColor: 'var(--ui-warning, #f59e0b)',
                  color: '#000',
                  fontWeight: 800,
                }}
              >
                <span>📦 Release from Warehouse (Scan Out)</span>
              </button>
            ) : (
              <button
                type="button"
                disabled={actionLoading}
                onClick={() => handleWarehouseHold(order.id)}
                className="btn btn-secondary"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 700 }}
              >
                <span>📦 Hold in Warehouse (Scan In)</span>
              </button>
            )}

            {order.status !== 'picked_up' && (
              <button
                type="button"
                disabled={actionLoading}
                onClick={() => handleUpdateStatus(order.id, 'picked_up')}
                className="btn btn-secondary"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                <TruckIcon size={14} />
                <span>Mark In-Transit / Picked Up</span>
              </button>
            )}

            {order.status !== 'delivered' && (
              <button
                type="button"
                disabled={actionLoading}
                onClick={() => handleUpdateStatus(order.id, 'delivered')}
                className="btn btn-primary"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#10b981', borderColor: '#10b981' }}
              >
                <CheckIcon size={14} color="#fff" />
                <span>Mark Delivered & Collect COD</span>
              </button>
            )}

            {order.status !== 'failed' && (
              <button
                type="button"
                disabled={actionLoading}
                onClick={() => handleUpdateStatus(order.id, 'failed')}
                className="btn btn-secondary"
                style={{ color: '#f87171' }}
              >
                Postpone / Reschedule
              </button>
            )}

            {order.status === 'delivered' && (
              <button
                type="button"
                disabled={actionLoading}
                onClick={() => handleUpdateStatus(order.id, 'picked_up')}
                className="btn btn-ghost"
                style={{ fontSize: 12 }}
              >
                Revert to In-Transit
              </button>
            )}
          </div>
        </div>
      )}

      {/* Hub Sort Bags Section */}
      {targetAction === 'sort' && Object.keys(sortedBags).length > 0 && (
        <div className="panel" style={{ marginTop: 24, padding: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div>
              <h3 style={{ fontSize: 18, fontWeight: 800, margin: 0, color: 'var(--brand)' }}>
                Sorted Zone Bags
              </h3>
              <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2 }}>
                {Object.values(sortedBags).reduce((sum, list) => sum + list.length, 0)} parcels sorted in current session. 1-click assigns the entire bag to a courier.
              </div>
            </div>
            <button
              type="button"
              onClick={() => setSortedBags({})}
              className="btn btn-ghost"
              style={{ fontSize: 12 }}
            >
              Clear Bags
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
            {Object.entries(sortedBags).map(([zoneName, bagOrders]) => {
              const matchedArea = deliveryAreas.find(a => a.name.toLowerCase() === zoneName.toLowerCase())
              const defaultCourierId = matchedArea?.default_driver_id || (Array.isArray(matchedArea?.assigned_driver_ids) ? matchedArea?.assigned_driver_ids[0] : '') || ''
              const selectedCourierId = bagDriverAssignments[zoneName] !== undefined ? bagDriverAssignments[zoneName] : defaultCourierId

              return (
                <div
                  key={zoneName}
                  style={{
                    padding: 16,
                    background: 'var(--ui-surface-2, rgba(20, 83, 45, 0.04))',
                    border: '1px solid var(--line)',
                    borderRadius: 12,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                      <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--ink)' }}>{zoneName}</span>
                      <span className="badge badge-assigned" style={{ fontSize: 12, fontWeight: 700 }}>
                        {bagOrders.length} parcel{bagOrders.length === 1 ? '' : 's'}
                      </span>
                    </div>

                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
                      {bagOrders.slice(0, 8).map(o => (
                        <span
                          key={o.id}
                          style={{
                            fontSize: 11,
                            fontFamily: 'monospace',
                            padding: '2px 6px',
                            background: 'var(--surface)',
                            border: '1px solid var(--line)',
                            borderRadius: 4,
                          }}
                        >
                          {o.code}
                        </span>
                      ))}
                      {bagOrders.length > 8 && (
                        <span style={{ fontSize: 11, color: 'var(--muted)', alignSelf: 'center' }}>
                          +{bagOrders.length - 8} more
                        </span>
                      )}
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
                    <select
                      value={selectedCourierId}
                      onChange={e => setBagDriverAssignments(prev => ({ ...prev, [zoneName]: e.target.value }))}
                      style={{
                        width: '100%',
                        padding: '8px 10px',
                        borderRadius: 6,
                        border: '1px solid var(--line)',
                        background: 'var(--surface)',
                        fontSize: 13,
                        fontWeight: 600,
                      }}
                    >
                      <option value="">Select courier for {zoneName}…</option>
                      {drivers.map(d => (
                        <option key={d.id} value={d.id}>
                          {d.name} {d.phone ? `(${d.phone})` : ''}
                        </option>
                      ))}
                    </select>

                    <button
                      type="button"
                      disabled={actionLoading || !selectedCourierId}
                      onClick={() => handleAssignZoneBag(zoneName, selectedCourierId)}
                      className="btn btn-primary"
                      style={{ width: '100%', fontWeight: 700 }}
                    >
                      Assign Bag ({bagOrders.length} Parcels)
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
