import { NextResponse } from 'next/server'
import { api, ApiError } from '@/lib/api'
import { createServiceClient } from '@/lib/supabase/server'
import { parseLocation, calculateDistanceKm, getLebanonAreaCoordinates } from '@/lib/maps'

interface OrderForRouting {
  id: string
  code: string
  recipient_name: string | null
  recipient_address: string | null
  location_lat: number | null
  location_lng: number | null
  route_position: number | null
  status: string
  area?: { name: string } | null
}

export const POST = api(async req => {
  const body = await req.json()
  const { driverId, positions, optimize, lat, lng } = body

  if (!driverId) throw new ApiError(400, 'driverId is required')

  const db = createServiceClient()

  // 1. Manual order sequence saving
  if (Array.isArray(positions)) {
    const { data: rpcRes, error } = await db.rpc('set_route_positions', {
      p_driver_id: driverId,
      p_positions: positions,
    })

    if (error) throw new ApiError(500, error.message)
    return NextResponse.json({ success: true, result: rpcRes })
  }

  // 2. Nearest-neighbour TSP route optimization
  if (optimize) {
    const { data: activeOrders, error } = await db
      .from('orders')
      .select(`
        id,
        code,
        recipient_name,
        recipient_address,
        location_lat,
        location_lng,
        route_position,
        status,
        area:area_id(name)
      `)
      .eq('driver_id', driverId)
      .in('status', ['assigned', 'picked_up'])

    if (error) throw new ApiError(500, error.message)
    const list = (activeOrders as any[] || []) as OrderForRouting[]

    if (list.length <= 1) {
      return NextResponse.json({ success: true, count: list.length, orders: list })
    }

    // Determine resolved coordinates for each order
    const withCoords: Array<{ order: OrderForRouting; lat: number; lng: number }> = []
    const withoutCoords: OrderForRouting[] = []

    for (const ord of list) {
      let ordLat = ord.location_lat != null ? Number(ord.location_lat) : null
      let ordLng = ord.location_lng != null ? Number(ord.location_lng) : null

      if (ordLat == null || ordLng == null) {
        const parsed = parseLocation(ord.recipient_address)
        if (parsed.isCoords && parsed.lat && parsed.lng) {
          ordLat = parsed.lat
          ordLng = parsed.lng
        } else {
          const fallback = getLebanonAreaCoordinates(ord.area?.name || ord.recipient_address)
          if (fallback) {
            ordLat = fallback.lat
            ordLng = fallback.lng
          }
        }
      }

      if (ordLat != null && ordLng != null) {
        withCoords.push({ order: ord, lat: ordLat, lng: ordLng })
      } else {
        withoutCoords.push(ord)
      }
    }

    // Starting origin: courier current lat/lng, or default to Beirut centre
    let curLat = lat != null ? Number(lat) : 33.8938
    let curLng = lng != null ? Number(lng) : 35.5018

    const orderedList: OrderForRouting[] = []
    const remaining = [...withCoords]

    // Greedy nearest-neighbour TSP walk
    while (remaining.length > 0) {
      let nearestIdx = 0
      let minDistance = Infinity

      for (let i = 0; i < remaining.length; i++) {
        const d = calculateDistanceKm(curLat, curLng, remaining[i].lat, remaining[i].lng)
        if (d < minDistance) {
          minDistance = d
          nearestIdx = i
        }
      }

      const [nextStop] = remaining.splice(nearestIdx, 1)
      orderedList.push(nextStop.order)
      curLat = nextStop.lat
      curLng = nextStop.lng
    }

    // Append stops without coordinates at the end
    orderedList.push(...withoutCoords)

    // Build position assignments
    const positionAssignments = orderedList.map((ord, idx) => ({
      order_id: ord.id,
      position: idx + 1,
    }))

    // Persist to database
    await db.rpc('set_route_positions', {
      p_driver_id: driverId,
      p_positions: positionAssignments,
    })

    return NextResponse.json({
      success: true,
      count: orderedList.length,
      orders: orderedList.map((ord, idx) => ({ ...ord, route_position: idx + 1 })),
    })
  }

  throw new ApiError(400, 'Either positions array or optimize: true must be provided')
})
