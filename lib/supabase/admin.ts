import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import type { Database } from './types'

/**
 * The owner gate. An environment variable rather than a role column or a
 * flag on a row: there is no query that can grant it and nothing an RLS
 * mistake could flip. Server-only — this module must never be imported into
 * a client component.
 */
export function isOwner(userId: string | null | undefined): boolean {
  const owner = process.env.OWNER_USER_ID
  // An unset variable locks everyone out, including me. That is the right
  // way round: a missing config should not open the door.
  if (!owner || !userId) return false
  return owner === userId
}

/**
 * Service-role client, for the analytics functions only. Those functions read
 * across every group, so their execute is revoked from anon and authenticated
 * — this key is the only thing that can call them, and it never leaves the
 * server.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) return null
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    key,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )
}
