'use client'

import React, { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

export interface DriverMarkerData {
  id: string
  name: string
  phone?: string | null
  vehicle_type?: string | null
  current_lat?: number | null
  current_lng?: number | null
  last_seen_at?: string | null
  active_orders_count?: number
}

export interface StopMarkerData {
  id: string
  code: string
  status: string
  recipient_name?: string | null
  recipient_address?: string | null
  location_lat?: number | null
  location_lng?: number | null
}

interface LeafletMapProps {
  drivers: DriverMarkerData[]
  selectedDriverId?: string | null
  selectedDriverStops?: StopMarkerData[]
  onSelectDriver: (driverId: string) => void
}

function getDriverStatus(driver: DriverMarkerData): 'active' | 'idle' | 'offline' {
  if (!driver.last_seen_at || !driver.current_lat || !driver.current_lng) {
    return 'offline'
  }
  const diffMinutes = (Date.now() - new Date(driver.last_seen_at).getTime()) / (1000 * 60)
  if (diffMinutes <= 15) return 'active'
  if (diffMinutes <= 45) return 'idle'
  return 'offline'
}

export default function LeafletMap({
  drivers,
  selectedDriverId,
  selectedDriverStops = [],
  onSelectDriver,
}: LeafletMapProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null)
  const mapInstanceRef = useRef<L.Map | null>(null)
  const markersLayerRef = useRef<L.LayerGroup | null>(null)

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return

    // Center on Lebanon: lat 33.8938, lng 35.5018 (Beirut)
    const map = L.map(mapContainerRef.current, {
      center: [33.8938, 35.5018],
      zoom: 11,
      zoomControl: true,
    })

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap contributors',
    }).addTo(map)

    const layerGroup = L.layerGroup().addTo(map)
    markersLayerRef.current = layerGroup
    mapInstanceRef.current = map

    return () => {
      map.remove()
      mapInstanceRef.current = null
    }
  }, [])

  // Update Markers when drivers or selected driver changes
  useEffect(() => {
    const map = mapInstanceRef.current
    const layer = markersLayerRef.current
    if (!map || !layer) return

    layer.clearLayers()

    const bounds: L.LatLngExpression[] = []

    // Add Driver Markers
    drivers.forEach(driver => {
      const lat = driver.current_lat
      const lng = driver.current_lng
      if (lat == null || lng == null) return

      const status = getDriverStatus(driver)
      const isSelected = driver.id === selectedDriverId

      const colorMap = {
        active: '#059669', // emerald
        idle: '#d97706',   // amber
        offline: '#64748b' // slate
      }
      const markerColor = colorMap[status]

      const vehicleIcon = driver.vehicle_type === 'moto' ? '🛵' : '🚗'

      const customIcon = L.divIcon({
        className: 'custom-driver-pin',
        html: `
          <div style="
            display: flex;
            align-items: center;
            gap: 4px;
            background: white;
            padding: 3px 8px;
            border-radius: 20px;
            border: 2.5px solid ${markerColor};
            box-shadow: 0 4px 12px rgba(0,0,0,0.25);
            font-family: inherit;
            cursor: pointer;
            transform: scale(${isSelected ? 1.15 : 1});
            transition: transform 0.2s;
            white-space: nowrap;
          ">
            <span style="font-size: 14px;">${vehicleIcon}</span>
            <span style="font-size: 11px; font-weight: 800; color: #1e293b;">
              ${driver.name}
            </span>
            <span style="
              width: 8px;
              height: 8px;
              border-radius: 50%;
              background: ${markerColor};
              margin-left: 2px;
            "></span>
          </div>
        `,
        iconSize: [100, 32],
        iconAnchor: [50, 16],
      })

      const marker = L.marker([lat, lng], { icon: customIcon })
      marker.on('click', () => {
        onSelectDriver(driver.id)
      })

      marker.addTo(layer)
      bounds.push([lat, lng])
    })

    // Add Stop Markers for Selected Driver
    if (selectedDriverStops && selectedDriverStops.length > 0) {
      selectedDriverStops.forEach((stop, index) => {
        if (stop.location_lat != null && stop.location_lng != null) {
          const stopIcon = L.divIcon({
            className: 'custom-stop-pin',
            html: `
              <div style="
                background: #0284c7;
                color: white;
                font-size: 11px;
                font-weight: 900;
                width: 24px;
                height: 24px;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                border: 2px solid white;
                box-shadow: 0 2px 8px rgba(0,0,0,0.3);
              ">
                ${index + 1}
              </div>
            `,
            iconSize: [24, 24],
            iconAnchor: [12, 12],
          })

          const stopMarker = L.marker([stop.location_lat, stop.location_lng], {
            icon: stopIcon,
          }).bindPopup(`
            <div style="font-family: inherit; font-size: 12px; padding: 4px;">
              <b>Stop #${index + 1}: ${stop.code}</b><br/>
              <span>${stop.recipient_name || 'Customer'}</span><br/>
              <small style="color: #64748b;">${stop.recipient_address || ''}</small>
            </div>
          `)

          stopMarker.addTo(layer)
          bounds.push([stop.location_lat, stop.location_lng])
        }
      })
    }

    // Adjust view to fit markers if there are any
    if (bounds.length > 0 && selectedDriverId) {
      const selected = drivers.find(d => d.id === selectedDriverId)
      if (selected && selected.current_lat && selected.current_lng) {
        map.setView([selected.current_lat, selected.current_lng], 13, { animate: true })
      }
    }
  }, [drivers, selectedDriverId, selectedDriverStops, onSelectDriver])

  return (
    <div
      ref={mapContainerRef}
      className="w-full h-full min-h-[500px] rounded-2xl overflow-hidden shadow-inner border border-slate-200"
      style={{ zIndex: 1 }}
    />
  )
}
