import { createHmac, timingSafeEqual } from 'node:crypto'
import { ApiError } from './api'
export function shopDomain(value: unknown): string {
  if (typeof value !== 'string') throw new ApiError(400, 'Shopify domain is required')
  const domain = value.trim().toLowerCase().replace(/^https:\/\//, '').replace(/\/$/, '')
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(domain)) throw new ApiError(400, 'Enter an exact myshopify.com store domain')
  return domain
}
export function equalSignature(expected: string, actual: string, encoding: BufferEncoding = 'hex') {
  const a = Buffer.from(expected, encoding), b = Buffer.from(actual, encoding)
  return a.length === b.length && a.length > 0 && timingSafeEqual(a, b)
}
export function verifyOAuth(params: URLSearchParams, secret: string) {
  const entries = [...params.entries()]
  if (new Set(entries.map(([key]) => key)).size !== entries.length) return false
  const message = entries.filter(([key]) => key !== 'hmac').sort(([a], [b]) => a.localeCompare(b)).map(([k,v]) => k + '=' + v).join('&')
  return equalSignature(createHmac('sha256', secret).update(message).digest('hex'), params.get('hmac') || '')
}
export function verifyWebhook(raw: string, signature: string, secret: string) {
  return equalSignature(createHmac('sha256', secret).update(raw).digest('base64'), signature, 'base64')
}
export function siteUrl() {
  const value =
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : undefined) ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined)

  if (!value) throw new ApiError(503, 'Site URL is not configured')
  const url = new URL(value)
  if (url.protocol !== 'https:' && url.hostname !== 'localhost') throw new ApiError(503, 'Invalid site URL')
  return url.origin
}
export function shopifyCredentials() {
  const clientId = process.env.SHOPIFY_CLIENT_ID, secret = process.env.SHOPIFY_CLIENT_SECRET
  if (!clientId || !secret) throw new ApiError(503, 'Shopify integration is not configured')
  return { clientId, secret }
}
export async function shopifyFetch(domain: string, pathname: string, init: RequestInit = {}) {
  const host = shopDomain(domain)
  const url = new URL(pathname, 'https://' + host)
  if (url.origin !== 'https://' + host || !url.pathname.startsWith('/admin/')) throw new ApiError(400, 'Invalid Shopify request URL')
  return fetch(url, { ...init, redirect: 'error', signal: AbortSignal.timeout(15000), cache: 'no-store' })
}
export const SHOPIFY_VERSION = '2026-10'
