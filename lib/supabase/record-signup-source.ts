import type { SupabaseClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { SOURCE_COOKIE } from '../signup-source'
import type { Database } from './types'

/**
 * Saves where a new account came from (docs/GROWTH.md, 1D). Called on every
 * sign-in; the database function writes only for a profile under a day old
 * with nothing recorded yet, so an existing user signing in changes nothing.
 * No cookie (the magic link was opened in a different browser) is saved as
 * "unknown". Best effort, never blocking: like the avatar, a missing source
 * is not a failed sign-in.
 */
export async function recordSignupSource(supabase: SupabaseClient<Database>) {
  try {
    const store = await cookies()
    // The value goes over the wire URL-encoded ("ref%3Areddit"); decode in
    // case the cookie store has not, or the database check turns it into
    // "unknown".
    const raw = store.get(SOURCE_COOKIE)?.value ?? null
    let source = raw
    try {
      if (raw) source = decodeURIComponent(raw)
    } catch {
      // Malformed encoding: send as-is and let the database reject it.
    }
    await supabase.rpc('record_signup_source', { p_source: source ?? 'unknown' })
  } catch {
    // Swallowed on purpose.
  }
}
