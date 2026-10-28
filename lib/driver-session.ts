import { createHash, createHmac, randomInt } from 'node:crypto'
import { ApiError } from './api'
import { equalSignature } from './shopify-security'

// Signed, httpOnly courier session. The session version comes from
// driver_credentials and is bumped whenever the PIN changes, which signs the
// courier out of every device.
export const DRIVER_SESSION_COOKIE = 'cedar_driver_session'
export const LEGACY_DRIVER_COOKIE = 'cedar_saved_driver_id'
export const DRIVER_SESSION_MAX_AGE = 60 * 60 * 24 * 60 // 60 days

export interface DriverSession {
  driverId: string
  version: number
  expiresAt: number
}

export function driverSessionSecret(): string {
  const own = process.env.DRIVER_SESSION_SECRET
  if (own && own.length >= 32) return own
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (service && service !== '[SENSITIVE]') return createHash('sha256').update('cedar-driver-session:' + service).digest('hex')
  throw new ApiError(503, 'Courier sign-in is not configured')
}

export function signDriverSession(session: DriverSession, secret: string): string {
  const body = ['v1', session.driverId, session.version, session.expiresAt].join('.')
  return body + '.' + createHmac('sha256', secret).update(body).digest('base64url')
}

export function verifyDriverSession(token: string | undefined, secret: string, now = Date.now()): DriverSession | null {
  if (!token) return null
  const parts = token.split('.')
  if (parts.length !== 5 || parts[0] !== 'v1') return null
  const body = parts.slice(0, 4).join('.')
  if (!equalSignature(createHmac('sha256', secret).update(body).digest('base64url'), parts[4], 'base64url')) return null
  const [, driverId, version, expiresAt] = parts
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(driverId)) return null
  if (!/^\d+$/.test(version) || !/^\d+$/.test(expiresAt) || Number(expiresAt) <= now) return null
  return { driverId, version: Number(version), expiresAt: Number(expiresAt) }
}

export function driverSessionCookie(token: string) {
  return {
    name: DRIVER_SESSION_COOKIE,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: DRIVER_SESSION_MAX_AGE,
  }
}

/** Validates a PIN chosen by dispatch: 4–8 digits, not a trivial pattern. */
export function driverPin(value: unknown): string {
  const pin = typeof value === 'string' ? value.trim() : ''
  if (!/^[0-9]{4,8}$/.test(pin)) throw new ApiError(400, 'PIN must be 4 to 8 digits')
  if (/^(\d)\1+$/.test(pin) || '01234567890'.includes(pin) || '09876543210'.includes(pin)) {
    throw new ApiError(400, 'Choose a PIN that is harder to guess')
  }
  return pin
}

export function generateDriverPin(): string {
  for (;;) {
    const pin = String(randomInt(0, 1_000_000)).padStart(6, '0')
    try {
      return driverPin(pin)
    } catch {
      // Trivial pattern drawn; try again.
    }
  }
}
