import { createHash, randomBytes } from 'node:crypto'

// A shop API key is "cdr_live_" plus 48 random hex characters. Only its SHA-256 hash is stored, so a copy of the
// database does not hold a working key. The key is shown once, when it is made. Keys are long and random, so a plain
// hash is enough (there is nothing to guess; a slow password hash would only slow down every API call).
const KEY = /^cdr_live_[0-9a-f]{48}$/

export function hashApiKey(key: string) {
  return createHash('sha256').update(key).digest('hex')
}

export function generateApiKey() {
  const key = 'cdr_live_' + randomBytes(24).toString('hex')
  return { key, prefix: key.slice(0, 13), hash: hashApiKey(key) }
}

/** The key from an "Authorization: Bearer <key>" header, or null when the header is missing or is not shaped like a key. */
export function bearerKey(header: string | null | undefined) {
  const match = /^bearer ([^\s]+)$/i.exec(header?.trim() ?? '')
  return match && KEY.test(match[1]) ? match[1] : null
}
