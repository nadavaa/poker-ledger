// Which paths a signed-out visitor may load. Pure, so it can be tested without
// a request or a Supabase client.

// Matched as path prefixes: the path itself and anything beneath it.
// The PWA shell has to be readable by a browser that has never signed in:
// the manifest and service worker are fetched before any session exists, and
// the offline page is what you get when there is no network to sign in with.
const PUBLIC_PREFIXES = [
  '/login',
  '/auth',
  '/manifest.webmanifest',
  '/sw.js',
  '/icon',
  '/apple-icon',
  '/offline',
  // The MCP endpoint and its discovery documents are called by an AI client
  // with a bearer token and no cookies. They answer 401 themselves; a
  // redirect to /login would be gibberish to an agent.
  '/api/mcp',
  '/.well-known',
]

// Matched exactly, never as prefixes. A prefix entry for '/' would match every
// path and make the whole site public, so the public front door is named one
// path at a time. '/' itself renders the landing page for signed-out visitors
// and the dashboard for signed-in ones.
const PUBLIC_EXACT = ['/', '/robots.txt', '/sitemap.xml']

export function isPublicPath(pathname: string): boolean {
  return (
    PUBLIC_EXACT.includes(pathname) ||
    PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))
  )
}
