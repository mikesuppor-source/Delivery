import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co'
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key'

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
  const isPublic = path.startsWith('/login') ||
                   path.startsWith('/invite') ||
                   path.startsWith('/track') ||
                   path.startsWith('/print') ||
                   path.startsWith('/portal/login') ||
                   path.startsWith('/portal/signup') ||
                   path.startsWith('/api/portal/auth') ||
                   path.startsWith('/_next') ||
                   path.startsWith('/api/invite') ||
                   path === '/favicon.ico' ||
                   path === '/logo.png' ||
                   /\.(png|jpg|jpeg|svg|ico|webp)$/.test(path)

  // Redirect unauthenticated users
  if (!user && !isPublic) {
    const url = request.nextUrl.clone()
    if (path.startsWith('/portal')) {
      url.pathname = '/portal/login'
    } else {
      url.pathname = '/login'
    }
    return NextResponse.redirect(url)
  }

  // Redirect authenticated users away from auth pages
  if (user) {
    if (path === '/login') {
      const url = request.nextUrl.clone()
      url.pathname = '/'
      return NextResponse.redirect(url)
    }
    if (path === '/portal/login' || path === '/portal/signup') {
      const url = request.nextUrl.clone()
      url.pathname = '/portal'
      return NextResponse.redirect(url)
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
}
