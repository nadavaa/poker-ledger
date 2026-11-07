// Pure helpers for the sign-in page. No Supabase, Next or React imports, so
// they can be tested without a request.

/** Where a signed-out visitor was headed, as far as the sign-in page cares. */
export type LoginContext = 'group-invite' | 'claim' | 'game-invite' | 'connector' | null

/** Only same-site paths survive; anything else falls back to home. */
export function safeNext(raw: string | null | undefined): string {
  return raw && raw.startsWith('/') && !raw.startsWith('//') ? raw : '/'
}

export function loginContext(next: string): LoginContext {
  const path = next.split('?')[0]
  if (/^\/join\/[^/]+$/.test(path)) return 'group-invite'
  if (/^\/claim\/[^/]+$/.test(path)) return 'claim'
  if (/^\/games\/[^/]+\/join$/.test(path)) return 'game-invite'
  if (path.startsWith('/oauth')) return 'connector'
  return null
}

/** Seconds Supabase asks us to wait, when it says so ("after 42 seconds"). */
export function retryAfterSeconds(message: string): number | null {
  const m = /after (\d+) seconds?/i.exec(message)
  return m ? Number(m[1]) : null
}

/** Supabase's error text, rewritten for a person standing at a poker table. */
export function friendlyAuthError(message: string, status?: number): string {
  const wait = retryAfterSeconds(message)
  if (wait !== null) {
    return `Too many tries. You can send another link in ${wait} seconds.`
  }
  if (status === 429 || /rate limit|too many/i.test(message)) {
    return 'Too many tries. Wait a minute, then send another link.'
  }
  if (/invalid.*email|email.*invalid|unable to validate email/i.test(message)) {
    return "That email address doesn't look right. Check it and try again."
  }
  if (/fetch|network|load failed/i.test(message)) {
    return "Couldn't reach KevesPoker. Check your connection and try again."
  }
  return 'Something went wrong. Try again, or continue with Google.'
}
