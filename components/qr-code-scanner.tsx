'use client'

import { useEffect, useId, useRef, useState } from 'react'

/** Reads one QR code with the phone camera and hands its text to onResult. The courier can always type the code instead. */
export function QrCodeScanner({ onResult, onClose }: { onResult: (text: string) => void; onClose: () => void }) {
  const elementId = useId().replace(/:/g, '')
  const [error, setError] = useState('')
  const handled = useRef(false)

  useEffect(() => {
    let scanner: { stop: () => Promise<void>; clear: () => void; isScanning: boolean } | null = null
    let cancelled = false
    ;(async () => {
      try {
        const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import('html5-qrcode')
        if (cancelled) return
        const instance = new Html5Qrcode(elementId, { formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE], useBarCodeDetectorIfSupported: false, verbose: false })
        scanner = instance as unknown as typeof scanner
        await instance.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 220, height: 220 } },
          text => {
            if (handled.current) return
            handled.current = true
            onResult(text)
          },
          () => {},
        )
      } catch {
        setError('The camera could not start. Type the 4-digit code instead.')
      }
    })()
    return () => {
      cancelled = true
      if (scanner?.isScanning) scanner.stop().then(() => scanner?.clear()).catch(() => {})
    }
  }, [elementId, onResult])

  return (
    <div style={{ marginTop: 10 }}>
      <div id={elementId} style={{ width: '100%', minHeight: 220, background: '#020617', borderRadius: 10, overflow: 'hidden' }} />
      {error && <p role="alert" style={{ color: '#fca5a5', fontSize: 12, margin: '6px 0 0' }}>{error}</p>}
      <button type="button" onClick={onClose} style={{ marginTop: 8, background: 'none', border: '1px solid #475569', color: '#cbd5e1', borderRadius: 8, padding: '6px 12px', fontSize: 12, cursor: 'pointer' }}>Close camera</button>
    </div>
  )
}
