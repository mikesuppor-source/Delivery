import { isIP } from 'node:net'
import { ApiError } from './api'

// A shop chooses where its webhook messages go, and our server makes that request. Without a check a shop could
// aim it at something only our server can reach (the cloud metadata address, an internal service). So the address
// must be public https, and the same check is made again on the addresses the name resolves to when a message is sent.

function ipv4Bytes(ip: string) {
  const parts = ip.split('.').map(Number)
  return parts.length === 4 && parts.every(n => Number.isInteger(n) && n >= 0 && n <= 255) ? parts : null
}

function ipv6Groups(ip: string): number[] | null {
  let text = ip.toLowerCase()
  const dotted = /(\d+\.\d+\.\d+\.\d+)$/.exec(text)
  if (dotted) {
    const v4 = ipv4Bytes(dotted[1])
    if (!v4) return null
    text = text.slice(0, -dotted[1].length) + ((v4[0] << 8) | v4[1]).toString(16) + ':' + ((v4[2] << 8) | v4[3]).toString(16)
  }
  const halves = text.split('::')
  if (halves.length > 2) return null
  const head = halves[0] ? halves[0].split(':') : []
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : []
  const missing = 8 - head.length - tail.length
  if (halves.length === 1 ? missing !== 0 : missing < 1) return null
  const groups = [...head, ...Array(halves.length === 2 ? missing : 0).fill('0'), ...tail].map(g => parseInt(g, 16))
  return groups.length === 8 && groups.every(g => Number.isInteger(g) && g >= 0 && g <= 0xffff) ? groups : null
}

function privateV4([a, b, c]: number[]) {
  return a === 0 || a === 10 || a === 127 || a >= 224
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 0 && c === 0)
    || (a === 192 && b === 168)
    || (a === 198 && (b === 18 || b === 19))
}

/** True for loopback, private, link-local, carrier-grade NAT, multicast and other addresses that are not on the public internet. */
export function isPrivateAddress(ip: string) {
  const v4 = ipv4Bytes(ip)
  if (v4) return privateV4(v4)
  const g = ipv6Groups(ip)
  if (!g) return true // not an address we understand: treat as unsafe
  if (g.slice(0, 5).every(x => x === 0) && (g[5] === 0xffff || g[5] === 0)) {
    if (g[5] === 0xffff || g[6] !== 0 || g[7] > 1) return privateV4([g[6] >> 8, g[6] & 255, g[7] >> 8, g[7] & 255])
    return true // :: and ::1
  }
  if (g[0] === 0x64 && g[1] === 0xff9b) return privateV4([g[6] >> 8, g[6] & 255, g[7] >> 8, g[7] & 255])
  return (g[0] & 0xfe00) === 0xfc00 || (g[0] & 0xffc0) === 0xfe80 || (g[0] & 0xff00) === 0xff00
}

const INTERNAL_NAME = /(^|\.)(localhost|local|internal|intranet|lan|home|corp|localdomain)$/

/** Returns the address in normal form, or refuses it. allowLocal is for tests and local development only. */
export function validateWebhookUrl(input: unknown, { allowLocal = false }: { allowLocal?: boolean } = {}) {
  const bad = (why: string) => new ApiError(400, 'Enter a public https webhook address: ' + why)
  if (typeof input !== 'string' || !input.trim()) throw bad('it is empty')
  if (input.trim().length > 500) throw bad('it is too long')
  let url: URL
  try { url = new URL(input.trim()) } catch { throw bad('it is not a web address') }
  if (url.username || url.password) throw bad('it must not contain a user name or password')
  const host = url.hostname.replace(/^\[|\]$/g, '')
  const kind = isIP(host)
  const loopback = kind === 4 ? host.startsWith('127.') : kind === 6 ? host === '::1' : host === 'localhost'
  if (allowLocal && loopback && (url.protocol === 'https:' || url.protocol === 'http:')) return url.toString()
  if (url.protocol !== 'https:') throw bad('it must start with https://')
  if (kind) {
    if (isPrivateAddress(host)) throw bad('that address is not on the public internet')
  } else if (!host.includes('.') || INTERNAL_NAME.test(host) || host.length > 253) {
    throw bad('that name is not a public website')
  }
  return url.toString()
}

/**
 * True only on a throwaway stack that asks for it: WEBHOOK_ALLOW_LOCAL=1 AND the app is connected to a database on this
 * machine. The live site is never connected to a local database, so the flag does nothing there even if it is set by mistake.
 */
export function allowLocalWebhooks() {
  if (process.env.WEBHOOK_ALLOW_LOCAL !== '1') return false
  try { return ['localhost', '127.0.0.1'].includes(new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').hostname) } catch { return false }
}
