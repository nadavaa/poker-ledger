import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './types'

export type SessionUser = { id: string; email: string | null }

/**
 * The signed-in user, taken from the JWT the middleware already verified on
 * this request.
 *
 * getClaims() checks the signature locally against the project's published
 * keys. getUser() spends a network round trip asking the auth server the same
 * question — which every authenticated page was paying for, on top of the
 * middleware's check microseconds earlier.
 *
 * This is only safe because proxy.ts validates the session on every request
 * before a page renders. Do not copy it into an app without that guarantee.
 */
export async function getSessionUser(
  supabase: SupabaseClient<Database>
): Promise<SessionUser | null> {
  const { data } = await supabase.auth.getClaims()
  const claims = data?.claims
  if (!claims?.sub) return null
  return {
    id: claims.sub,
    email: typeof claims.email === 'string' ? claims.email : null,
  }
}
