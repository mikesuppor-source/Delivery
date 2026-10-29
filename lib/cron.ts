import { timingSafeEqual } from 'node:crypto'
import { ApiError } from './api'

/**
 * Cron routes use the service role, so they must only run for the scheduler.
 * The caller sends `Authorization: Bearer <CRON_SECRET>`. With no CRON_SECRET set nothing is allowed.
 */
export function requireCron(req: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) throw new ApiError(401, 'Unauthorized')
  const expected = Buffer.from('Bearer ' + secret)
  const supplied = Buffer.from(req.headers.get('authorization') ?? '')
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) throw new ApiError(401, 'Unauthorized')
}
