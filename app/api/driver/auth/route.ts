import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { api, ApiError, checked } from '@/lib/api'
import { clientIp, rateLimit } from '@/lib/rate-limit'
import {
  DRIVER_SESSION_MAX_AGE,
  LEGACY_DRIVER_COOKIE,
  DRIVER_SESSION_COOKIE,
  driverSessionCookie,
  driverSessionSecret,
  signDriverSession,
} from '@/lib/driver-session'

export const POST = api(async req => {
  const body = await req.json()
  const phone = typeof body.phone === 'string' ? body.phone.trim().slice(0, 40) : ''
  const pin = typeof body.pin === 'string' ? body.pin.trim().slice(0, 8) : ''

  if (!phone || !pin) {
    throw new ApiError(400, 'Please enter your mobile phone number and PIN')
  }

  const digits = phone.replace(/\D/g, '')
  if (digits.length < 7) {
    throw new ApiError(400, 'Invalid phone number format')
  }

  // 5 attempts per number and 20 per network each minute
  await rateLimit('driver-login:' + digits.slice(-8), 5)
  await rateLimit('driver-login-ip:' + clientIp(req), 20)

  const db = createServiceClient()
  const matches = checked(await db.rpc('verify_driver_login', { p_phone: phone, p_pin: pin }))

  if (matches.length > 1) {
    throw new ApiError(409, 'This phone number is registered with more than one company. Contact dispatch.')
  }
  const driver = matches[0]
  if (!driver) {
    throw new ApiError(401, 'Invalid phone number or PIN. Contact dispatch for your login code.')
  }

  const token = signDriverSession(
    { driverId: driver.driver_id, version: driver.session_version, expiresAt: Date.now() + DRIVER_SESSION_MAX_AGE * 1000 },
    driverSessionSecret()
  )

  const res = NextResponse.json({
    success: true,
    driverId: driver.driver_id,
    name: driver.name,
  })
  res.cookies.set(driverSessionCookie(token))
  res.cookies.delete(LEGACY_DRIVER_COOKIE)
  return res
})

export const DELETE = api(async () => {
  const res = NextResponse.json({ success: true, message: 'Logged out successfully' })
  res.cookies.delete(DRIVER_SESSION_COOKIE)
  res.cookies.delete(LEGACY_DRIVER_COOKIE)
  return res
})
