import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// The PWA shell has to be readable by a browser that has never signed in:
// the manifest and service worker are fetched before any session exists, and
// the offline page is what you get when there is no network to sign in with.
const PUBLIC_PATHS = [
  '/login',
  '/auth',
  '/manifest.webmanifest',
  '/sw.js',
  '/icon',
  '/apple-icon',
  '/offline',
]

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Do not run code between createServerClient and getClaims() —
  // it can cause users to be randomly logged out.
  const { data } = await supabase.auth.getClaims()
  const user = data?.claims

  const { pathname } = request.nextUrl
  const isPublic = PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  )

  // The owner gate, checked here and again in the page. A non-owner gets a
  // 404, not a 403: the route does not exist as far as anyone else is
  // concerned. Rewriting rather than returning a bare 404 keeps the styled
  // not-found page, which is what a wrong URL looks like everywhere else.
  if (pathname === '/admin' || pathname.startsWith('/admin/')) {
    const owner = process.env.OWNER_USER_ID
    if (!owner || !user || user.sub !== owner) {
      return NextResponse.rewrite(new URL('/_not-found-admin', request.url))
    }
  }

  if (!user && !isPublic) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.search = ''
    if (pathname !== '/') {
      // Preserve the destination so invite/claim links survive the login trip.
      url.searchParams.set('next', pathname)
    }
    return NextResponse.redirect(url)
  }

  if (user && pathname === '/login') {
    const next = request.nextUrl.searchParams.get('next')
    const url = request.nextUrl.clone()
    url.search = ''
    url.pathname = next?.startsWith('/') ? next : '/'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}
