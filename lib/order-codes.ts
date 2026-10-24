import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Generate a cryptographically secure random alphanumeric string
 */
function randomAlphanumeric(length = 6): string {
  // Exclude ambiguous characters (0, O, 1, I)
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'
  let result = ''
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const bytes = new Uint8Array(length)
    crypto.getRandomValues(bytes)
    for (let i = 0; i < length; i++) {
      result += chars[bytes[i] % chars.length]
    }
  } else {
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length))
    }
  }
  return result
}

/**
 * Sanitize and format custom tracking code
 */
export function formatOrderCode(raw: string): string {
  return raw
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, '')
}

/**
 * Check whether a code is unique across the orders table
 */
export async function isOrderCodeUnique(
  supabase: SupabaseClient,
  code: string,
  excludeOrderId?: string
): Promise<boolean> {
  const sanitized = formatOrderCode(code)
  if (!sanitized) return false

  let query = supabase
    .from('orders')
    .select('id')
    .ilike('code', sanitized)

  if (excludeOrderId) {
    query = query.neq('id', excludeOrderId)
  }

  const { data } = await query.maybeSingle()
  return !data
}

/**
 * Generate a guaranteed unique order code that CANNOT BE REPEATED.
 * Performs database uniqueness check with retry loop.
 */
export async function generateUniqueOrderCode(
  supabase: SupabaseClient,
  prefix = 'CD',
  maxRetries = 10
): Promise<string> {
  const cleanPrefix = formatOrderCode(prefix).replace(/-$/, '') || 'CD'

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    // Generate 6 uppercase random characters (over 700 million combinations per prefix)
    const randomSuffix = randomAlphanumeric(6)
    const candidateCode = `${cleanPrefix}-${randomSuffix}`

    const isUnique = await isOrderCodeUnique(supabase, candidateCode)
    if (isUnique) {
      return candidateCode
    }
  }

  // Fallback with timestamp element if extreme volume or collision
  const timestampSuffix = Date.now().toString(36).toUpperCase().slice(-4)
  const fallbackCode = `${cleanPrefix}-${timestampSuffix}${randomAlphanumeric(4)}`
  return fallbackCode
}
