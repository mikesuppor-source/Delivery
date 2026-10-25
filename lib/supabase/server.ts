import { createServerClient } from '@supabase/ssr'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import type { Database } from './database.types'

/** Use in Server Components, Route Handlers, and Server Actions */
export async function createClient() {
  const cookieStore = await cookies()
  const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const isValidUrl = rawUrl && (rawUrl.startsWith('https://') || rawUrl.startsWith('http://'))
  const url = isValidUrl ? rawUrl : 'https://placeholder.supabase.co'
  const rawKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const key = rawKey && rawKey !== '[SENSITIVE]' ? rawKey : 'placeholder-anon-key'

  return createServerClient<Database>(
    url,
    key,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet: Array<{ name: string; value: string; options?: any }>) => {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Called from Server Component — cookies are read-only, that's fine
          }
        },
      },
    }
  )
}

/** Service-role client — bypasses RLS. Use ONLY in trusted server code. */
export function createServiceClient() {
  const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const isValidUrl = rawUrl && (rawUrl.startsWith('https://') || rawUrl.startsWith('http://'))
  const url = isValidUrl ? rawUrl : 'https://placeholder.supabase.co'
  const rawKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const key = rawKey && rawKey !== '[SENSITIVE]' ? rawKey : 'placeholder-service-role-key'

  return createSupabaseClient<Database>(
    url,
    key,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}
