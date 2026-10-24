'use client'

import React, { useState } from 'react'
import { getGoogleMapsDirectionsUrl, getGoogleMapsUrl, getWazeDirectionsUrl, parseLocation } from '@/lib/maps'
import { GoogleMapsIcon } from './google-maps-icon'
import { MapPinIcon, CheckIcon } from './icons'

interface LocationHelperProps {
  address: string
  onAddressChange: (newAddress: string) => void
  label?: string
  placeholder?: string
  required?: boolean
  id?: string
}

export function LocationHelper({
  address,
  onAddressChange,
  label = 'Detailed Delivery Address / Google Maps Pin',
  placeholder = 'e.g. Achrafieh, Sassine Square, Bldg 12 or paste Google Maps link',
  required = true,
  id = 'location-address-input',
}: LocationHelperProps) {
  const [isLocating, setIsLocating] = useState(false)
  const [locateSuccess, setLocateSuccess] = useState(false)
  const [locateError, setLocateError] = useState('')

  const parsed = parseLocation(address)
  const mapsUrl = getGoogleMapsDirectionsUrl(address)
  const wazeUrl = getWazeDirectionsUrl(address)

  function handleDetectGps() {
    if (!navigator.geolocation) {
      setLocateError('Geolocation is not supported by your browser')
      return
    }

    setIsLocating(true)
    setLocateError('')
    setLocateSuccess(false)

    navigator.geolocation.getCurrentPosition(
      pos => {
        const lat = pos.coords.latitude.toFixed(6)
        const lng = pos.coords.longitude.toFixed(6)
        const pinUrl = `https://maps.google.com/?q=${lat},${lng}`

        // If user already typed some text instructions (e.g. "Bldg 4, 3rd floor"), preserve it and append pin
        let newAddr = ''
        if (address && !address.includes('http') && !address.includes(lat)) {
          newAddr = `${address.trim()} (${pinUrl})`
        } else {
          newAddr = pinUrl
        }

        onAddressChange(newAddr)
        setIsLocating(false)
        setLocateSuccess(true)
        setTimeout(() => setLocateSuccess(false), 4000)
      },
      err => {
        setIsLocating(false)
        setLocateError(err.message || 'Unable to retrieve your GPS location. Please allow location permissions.')
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4, flexWrap: 'wrap', gap: 6 }}>
        <label htmlFor={id} style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', margin: 0 }}>
          {label} {required && '*'}
        </label>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* GPS Pin Button */}
          <button
            type="button"
            onClick={handleDetectGps}
            disabled={isLocating}
            className="btn btn-ghost btn-sm"
            style={{
              fontSize: 11,
              padding: '2px 8px',
              color: 'var(--brand)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              border: '1px solid var(--line)',
              background: 'var(--bg)',
            }}
            title="Detect precise GPS pin from your device"
          >
            {isLocating ? (
              <span>Locating GPS…</span>
            ) : locateSuccess ? (
              <>
                <CheckIcon size={12} color="#059669" />
                <span style={{ color: '#059669' }}>GPS Pin Captured</span>
              </>
            ) : (
              <>
                <MapPinIcon size={12} color="var(--brand)" />
                <span>Use My GPS Pin</span>
              </>
            )}
          </button>

          {/* Maps Preview Link */}
          {address && address.trim() && (
            <a
              href={mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                fontSize: 11,
                color: 'var(--brand)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                textDecoration: 'none',
                fontWeight: 600,
              }}
              title="Verify address or pin location on Google Maps"
            >
              <GoogleMapsIcon size={12} />
              <span>Verify on Maps ↗</span>
            </a>
          )}
        </div>
      </div>

      <input
        id={id}
        type="text"
        value={address}
        onChange={e => onAddressChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        style={{
          width: '100%',
          fontSize: 13.5,
          fontFamily: parsed.isCoords || parsed.isUrl ? 'monospace' : 'inherit',
        }}
      />

      {locateError && (
        <small style={{ color: '#dc2626', fontSize: 11, display: 'block', marginTop: 4 }}>
          {locateError}
        </small>
      )}

      {/* Helpful Hint */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4, fontSize: 11, color: 'var(--muted)', flexWrap: 'wrap', gap: 4 }}>
        <span>
          Accepts text addresses (e.g. <em>Hamra, Makdessi St</em>), GPS coordinates, or WhatsApp / Google Maps pin links.
        </span>

        {parsed.isCoords && (
          <span style={{ color: '#059669', fontWeight: 600 }}>
            GPS Coordinates Detected ({parsed.lat}, {parsed.lng})
          </span>
        )}
      </div>
    </div>
  )
}
