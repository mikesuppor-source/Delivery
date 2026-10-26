import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

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
  const isPublic = ['/login','/portal/login','/portal/signup','/shopify','/track','/api/portal/auth/signup','/api/webhooks/shopify','/api/orders/location','/api/invite/preview','/favicon.ico','/logo.png','/manifest.json'].includes(path) || path.startsWith('/track/') || path.startsWith('/invite/') || path.startsWith('/print/order/')

  // Redirect unauthenticated users
  if (!user && !isPublic) {
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
