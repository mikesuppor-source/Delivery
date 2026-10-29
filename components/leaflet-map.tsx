'use client'

import React, { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { driverPinHtml, driverStatus, stopPinHtml, stopPopupHtml } from '@/lib/map'

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

  // Redraw the map when its box changes size (the side panel, a narrow window, a rotated phone)
  useEffect(() => {
    const element = mapContainerRef.current
    if (!element || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => mapInstanceRef.current?.invalidateSize())
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  // Update Markers when drivers or selected driver changes
  useEffect(() => {
    const map = mapInstanceRef.current
    const layer = markersLayerRef.current
    if (!map || !layer) return

    layer.clearLayers()

    // Add Driver Markers
    drivers.forEach(driver => {
      const lat = driver.current_lat
      const lng = driver.current_lng
      if (lat == null || lng == null) return

      const customIcon = L.divIcon({
        className: 'custom-driver-pin',
        html: driverPinHtml({
          name: driver.name,
          status: driverStatus(driver),
          selected: driver.id === selectedDriverId,
          icon: driver.vehicle_type === 'moto' ? '🛵' : '🚗',
        }),
        iconSize: [100, 32],
        iconAnchor: [50, 16],
      })

      const marker = L.marker([lat, lng], { icon: customIcon })
      marker.on('click', () => {
        onSelectDriver(driver.id)
      })

      marker.addTo(layer)
    })

    // Add Stop Markers for Selected Driver
    selectedDriverStops.forEach((stop, index) => {
      if (stop.location_lat == null || stop.location_lng == null) return

      const stopIcon = L.divIcon({
        className: 'custom-stop-pin',
        html: stopPinHtml(index + 1),
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      })

      L.marker([stop.location_lat, stop.location_lng], { icon: stopIcon })
        .bindPopup(
          stopPopupHtml({
            number: index + 1,
            code: stop.code,
            recipientName: stop.recipient_name,
            recipientAddress: stop.recipient_address,
          }),
        )
        .addTo(layer)
    })

    // Centre on the selected courier
    if (selectedDriverId) {
      const selected = drivers.find(d => d.id === selectedDriverId)
      if (selected && selected.current_lat != null && selected.current_lng != null) {
        map.setView([selected.current_lat, selected.current_lng], 13, { animate: true })
      }
    }
  }, [drivers, selectedDriverId, selectedDriverStops, onSelectDriver])

  // The box that holds the map must have a height, or Leaflet draws nothing
  return <div ref={mapContainerRef} style={{ width: '100%', height: '100%', minHeight: 320, zIndex: 1 }} />
}
