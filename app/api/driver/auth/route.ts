import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { api, ApiError } from '@/lib/api'

function cleanPhone(p: string): string {
  const digits = p.replace(/\D/g, '')
  if (digits.startsWith('961') && digits.length >= 10) {
    return digits.slice(3)
  }
  if (digits.startsWith('0') && digits.length >= 8) {
    return digits.slice(1)
  }
  return digits
}

export const POST = api(async req => {
  const body = await req.json()
  const rawPhone = String(body.phone || '').trim()
  const pin = String(body.pin || '').trim()

  if (!rawPhone || !pin) {
    throw new ApiError(400, 'Please enter your mobile phone number and PIN')
  }

  const normalizedInput = cleanPhone(rawPhone)
  if (normalizedInput.length < 6) {
    throw new ApiError(400, 'Invalid phone number format')
  }

  const db = createServiceClient()

  // Query active drivers
  const { data: drivers, error } = await db
    .from('drivers')
    .select('id, name, phone, pin_code, active')
    .eq('active', true)

  if (error || !drivers) {
    throw new ApiError(500, 'Database error verifying credentials')
  }

  const matchedDriver = drivers.find(d => {
    if (!d.phone) return false
    const dPhone = cleanPhone(d.phone)
    return (
      (dPhone === normalizedInput || d.phone.replace(/\D/g, '').includes(normalizedInput)) &&
      (d.pin_code || '1234') === pin
    )
  })

  if (!matchedDriver) {
    throw new ApiError(401, 'Invalid phone number or PIN. Contact dispatch for your login code.')
  }

  // Create response and set persistent cookie for mobile session
  const res = NextResponse.json({
    success: true,
    driverId: matchedDriver.id,
    name: matchedDriver.name,
  })

  res.cookies.set('cedar_saved_driver_id', matchedDriver.id, {
    path: '/',
    maxAge: 60 * 60 * 24 * 365, // 1 year
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  })

  return res
})

export const DELETE = api(async () => {
  const res = NextResponse.json({ success: true, message: 'Logged out successfully' })
  res.cookies.set('cedar_saved_driver_id', '', {
    path: '/',
    maxAge: 0,
  })
  return res
})
