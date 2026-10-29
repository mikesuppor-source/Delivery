import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  const supabaseResponse = NextResponse.next({ request })

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co'
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key'

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return NextResponse.json({error:'Application is not configured'}, {status:503})
  const supabase = createServerClient(
    url,
    key,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet: Array<{ name: string; value: string; options?: any }>) => {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value)
            supabaseResponse.cookies.set(name, value, options)
          })
        },
      },
    }
  )

  // Refresh session — important for Server Components to have fresh token
  const { data: { user } } = await supabase.auth.getUser()

  const path = request.nextUrl.pathname
  const isPublic =
    [
      '/login',
      '/portal/login',
      '/portal/signup',
      '/forgot-password',
      '/reset-password',
      '/shopify',
      '/track',
      '/send',
      '/driver',
      '/api/send',
      '/api/driver/auth',
      '/api/portal/auth/signup',
      '/api/webhooks/shopify',
      '/api/orders/location',
      '/api/invite/preview',
      '/favicon.ico',
      '/logo.png',
      '/manifest.json',
      '/sw.js',
    ].includes(path) ||
    path.startsWith('/track/') ||
    path.startsWith('/invite/') ||
    // Scheduled jobs have no user session: each one checks the CRON_SECRET itself (lib/cron.ts)
    path.startsWith('/api/cron/') ||
    path === '/driver' ||
    path.startsWith('/driver/') ||
    path.startsWith('/api/driver/') ||
    (path.startsWith('/api/orders/') && path.endsWith('/rating'))

  const hasDriverSession = Boolean(request.cookies.get('cedar_driver_session')?.value)
  const isDriverApi =
    hasDriverSession &&
    [
      '/api/pickups',
      '/api/orders/attempts',
      '/api/orders/route',
      '/api/orders/returns-handover',
    ].some(p => path === p || path.startsWith(p + '/'))

  // Redirect unauthenticated users
  if (!user && !isPublic && !isDriverApi) {
    if (path.startsWith('/api/')) return NextResponse.json({ error: 'Please sign in' }, { status: 401 })
    const url = request.nextUrl.clone()
    if (path.startsWith('/portal')) {
      url.pathname = '/portal/login'
    } else {
      url.pathname = '/login'
    }
    return NextResponse.redirect(url)
  }

  // Redirect authenticated users away from main desk login page
  if (user && path === '/login') {
    const url = request.nextUrl.clone()
    url.pathname = '/'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
}
