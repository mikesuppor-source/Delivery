import { NextResponse } from 'next/server'
import { api, ApiError } from '@/lib/api'
import { driverAccess } from '@/lib/access'

export const POST = api(async req => {
  const body = await req.json()
  const { db, driver } = await driverAccess(body.driverId)

  const lat = typeof body.lat === 'number' ? body.lat : parseFloat(body.lat)
  const lng = typeof body.lng === 'number' ? body.lng : parseFloat(body.lng)

  if (isNaN(lat) || isNaN(lng)) {
    throw new ApiError(400, 'Invalid GPS coordinates')
  }

  // Bounds check for Lebanon & earth coords
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    throw new ApiError(400, 'Coordinates out of bounds')
  }

  // Update driver's live location telemetry
  await db
    .from('drivers')
    .update({
      current_lat: lat,
      current_lng: lng,
      last_location_at: new Date().toISOString(),
    })
    .eq('id', driver.id)

  return NextResponse.json({ success: true, lat, lng })
})
