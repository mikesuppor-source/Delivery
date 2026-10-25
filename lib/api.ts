import { NextRequest, NextResponse } from 'next/server'
export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message) }
}
export function api<T extends unknown[]>(handler: (req: NextRequest, ...args: T) => Promise<Response>) {
  return async (req: NextRequest, ...args: T) => {
    const requestId = crypto.randomUUID()
    try {
      if (!['GET', 'HEAD'].includes(req.method)) {
        const origin = req.headers.get('origin')
        if (origin && origin !== new URL(req.url).origin && origin !== process.env.NEXT_PUBLIC_SITE_URL) throw new ApiError(403, 'Invalid request origin')
        if (Number(req.headers.get('content-length') || 0) > 3_000_000) throw new ApiError(413, 'Request too large')
      }
      const response = await handler(req, ...args)
      response.headers.set('Cache-Control', 'no-store')
      response.headers.set('X-Request-Id', requestId)
      return response
    } catch (error) {
      const status = error instanceof ApiError ? error.status : error instanceof SyntaxError ? 400 : 500
      if (status === 500) console.error('Request failed', { requestId, error })
      return NextResponse.json({ error: status === 500 ? 'Request failed. Contact support with the request ID.' : (error as Error).message, requestId }, { status })
    }
  }
}
export function checked<T>(result: { data: T; error: { message: string; code?: string } | null }): NonNullable<T> {
  if (result.error) {
    const code = result.error.code
    throw new ApiError(code === '23505' || code === '40001' || code === '40P01' ? 409 : code?.startsWith('23') || code === 'P0001' ? 400 : 500,
      code === '23505' ? 'A matching record already exists' : code === 'P0001' ? result.error.message : 'Database operation failed')
  }
  if (result.data == null) throw new ApiError(404, 'Record not found')
  return result.data as NonNullable<T>
}
export function textField(value: unknown, name: string, max = 500, required = false): string {
  if (value == null && !required) return ''
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) throw new ApiError(400, 'Invalid ' + name)
  return value.trim()
}
export function uuid(value: unknown, name = 'ID'): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) throw new ApiError(400, 'Invalid ' + name)
  return value
}
export function money(value: unknown, name: string, fallback = 0): number {
  const amount = value == null || value === '' ? fallback : Number(value)
  if (!Number.isFinite(amount) || amount < 0 || amount > 99999999) throw new ApiError(400, 'Invalid ' + name)
  return Math.round(amount * 100) / 100
}
export function ids(value: unknown): string[] {
  if (!Array.isArray(value) || !value.length || value.length > 200) throw new ApiError(400, 'Select between 1 and 200 records')
  return [...new Set(value.map(v => uuid(v)))]
}
