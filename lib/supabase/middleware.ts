import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

import { isPublicPath } from './public-paths'
import {
  SOURCE_COOKIE,
  SOURCE_COOKIE_MAX_AGE,
  firstTouchSource,
  isPageLoad,
} from '../signup-source'

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
  const isPublic = isPublicPath(pathname)

  // Sign-up source (docs/GROWTH.md, 1D). The first page a signed-out browser
  // loads decides where it came from; the auth callbacks save it on a new
  // profile. Adds a cookie and nothing else: never changes where a request
  // goes, and applies to every response below, redirects included, so a
  // first visit to /join/... that bounces to /login is still stamped.
  const source =
    !user &&
    !request.cookies.has(SOURCE_COOKIE) &&
    isPageLoad({
      method: request.method,
      pathname,
      accept: request.headers.get('accept'),
    })
      ? firstTouchSource({
          ref: request.nextUrl.searchParams.get('ref'),
          referer: request.headers.get('referer'),
          pathname,
          host: request.nextUrl.host,
        })
      : null
  const stamp = <T extends NextResponse>(res: T): T => {
    if (source) {
      res.cookies.set(SOURCE_COOKIE, source, {
        maxAge: SOURCE_COOKIE_MAX_AGE,
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
      })
    }
    return res
  }

  // The owner gate, checked here and again in the page. A non-owner gets a
  // 404, not a 403: the route does not exist as far as anyone else is
  // concerned. Rewriting rather than returning a bare 404 keeps the styled
  // not-found page, which is what a wrong URL looks like everywhere else.
  // Only once signed in. A signed-out visitor is sent to /login exactly like
  // every other path — answering 404 here while /anything-else redirected
  // would have told them this route is special.
  if (user && (pathname === '/admin' || pathname.startsWith('/admin/'))) {
    const owner = process.env.OWNER_USER_ID
    if (!owner || user.sub !== owner) {
      return NextResponse.rewrite(new URL('/_not-found-admin', request.url))
    }
  }

  if (!user && !isPublic) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.search = ''
    if (pathname !== '/') {
      // Preserve the destination so invite/claim links survive the login trip.
      // The OAuth consent screen is the one place the query string is the
      // point: without ?authorization_id the connector flow dies after login.
      const keepQuery = pathname.startsWith('/oauth/')
      url.searchParams.set(
        'next',
        keepQuery ? pathname + request.nextUrl.search : pathname
      )
    }
    return stamp(NextResponse.redirect(url))
  }

  if (user && pathname === '/login') {
    const next = request.nextUrl.searchParams.get('next')
    const url = request.nextUrl.clone()
    url.search = ''
    url.pathname = next?.startsWith('/') ? next : '/'
    return NextResponse.redirect(url)
  }

  return stamp(supabaseResponse)
}
