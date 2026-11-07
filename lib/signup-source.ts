// Where a new account came from: first touch, stamped into a cookie on the
// first page a signed-out browser loads, and saved on the profile at its first
// sign-in (record_signup_source). Pure, so the rules can be tested without a
// request. Spec: docs/GROWTH.md, section 1D.

export const SOURCE_COOKIE = 'kp_src'
export const SOURCE_COOKIE_MAX_AGE = 60 * 60 * 24 * 30 // 30 days

// Mirrors the check constraint on profiles.signup_source.
const VALID = /^[a-z0-9:._-]{1,64}$/

/** A ?ref= tag, lowercased and stripped to what the column accepts. */
export function cleanRef(raw: string | null | undefined): string | null {
  if (!raw) return null
  const tag = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
  return tag ? tag : null
}

/** The referrer's domain, or null if there is none or it is this site. */
export function externalHost(
  referer: string | null | undefined,
  ownHost: string
): string | null {
  if (!referer) return null
  let host: string
  try {
    host = new URL(referer).hostname.toLowerCase()
  } catch {
    return null
  }
  const bare = (h: string) => h.replace(/^www\./, '')
  const own = bare(ownHost.toLowerCase().split(':')[0])
  host = bare(host)
  if (!host || host === own || host.endsWith(`.${own}`)) return null
  return VALID.test(`web:${host}`) ? host : null
}

/** Links that bring someone into a specific group or game. */
export function isInvitePath(pathname: string): boolean {
  return (
    pathname.startsWith('/join/') ||
    pathname.startsWith('/claim/') ||
    /^\/games\/[^/]+\/join\/?$/.test(pathname)
  )
}

/** First-touch rule: a ref tag wins, then an outside referrer, then an invite link. */
export function firstTouchSource(input: {
  ref: string | null
  referer: string | null
  pathname: string
  host: string
}): string {
  const ref = cleanRef(input.ref)
  if (ref) return `ref:${ref}`
  const web = externalHost(input.referer, input.host)
  if (web) return `web:${web}`
  if (isInvitePath(input.pathname)) return 'invite'
  return 'direct'
}

/**
 * Only real page loads get stamped: not API calls, auth callbacks, router
 * prefetches or assets, which would otherwise record "direct" before the
 * page that carried the ref ever loaded.
 */
export function isPageLoad(input: {
  method: string
  pathname: string
  accept: string | null
}): boolean {
  if (input.method !== 'GET') return false
  if (/^\/(api|auth|_next|\.well-known)(\/|$)/.test(input.pathname)) return false
  return (input.accept ?? '').includes('text/html')
}

/** How a stored source reads on /admin. */
export function describeSource(source: string | null): string {
  if (source === null) return 'before tracking'
  if (source.startsWith('ref:')) return source.slice(4)
  if (source.startsWith('web:')) return source.slice(4)
  if (source === 'invite') return 'invite link'
  return source
}
