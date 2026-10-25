import { createBrowserClient } from '@supabase/ssr'
import type { Database } from './database.types'

export function createClient() {
  const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const isValid = rawUrl && (rawUrl.startsWith('https://') || rawUrl.startsWith('http://'))
  const url = isValid ? rawUrl : 'https://placeholder.supabase.co'
  const rawKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const key = rawKey && rawKey !== '[SENSITIVE]' ? rawKey : 'placeholder-anon-key'
  return createBrowserClient<Database>(url, key)
}
