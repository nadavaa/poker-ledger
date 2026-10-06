// Who is calling the MCP endpoint, proven from the bearer token alone.
//
// The token is one Supabase Auth issued after the user approved the
// connector on /oauth/consent. It is an ordinary Supabase access token for
// that user, so the same token is what the database sees — every RLS policy
// and column grant applies to the agent exactly as it does to the app.
//
// This file verifies identity and nothing else. It decides no permission:
// who may see what is the database's job, never this module's.

import { createClient } from '@supabase/supabase-js'
import type { AuthInfo } from '@modelcontextprotocol/server'
import type { Database } from '../supabase/types'

/** The issuer clients are told to authorise against. */
export function authServerUrl(): string {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL!}/auth/v1`
}

/**
 * A Supabase client that acts as the signed-in user, using their access
 * token on every request.
 *
 * The publishable key only identifies the project; the Authorization header
 * is what the database authenticates. The service-role key is not imported
 * anywhere under lib/mcp, and a test keeps it that way.
 */
export function userClient(accessToken: string) {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    }
  )
}

export type Caller = { userId: string; token: string }

/**
 * Checked on every request. Returns undefined for anything that is not a
 * valid, unexpired token for a signed-in user, which withMcpAuth turns into
 * a 401 with a WWW-Authenticate challenge pointing at our metadata.
 */
export async function verifyToken(
  _req: Request,
  bearer?: string
): Promise<AuthInfo | undefined> {
  if (!bearer) return undefined

  const anon = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )
  // Signature, issuer and expiry, checked against the project's published
  // signing keys.
  const { data, error } = await anon.auth.getClaims(bearer)
  const claims = data?.claims
  if (error || !claims?.sub) return undefined
  // An anonymous or service token is not somebody's account.
  if (claims.role !== 'authenticated') return undefined

  return {
    token: bearer,
    clientId:
      typeof claims.client_id === 'string' ? claims.client_id : 'unknown',
    scopes: typeof claims.scope === 'string' ? claims.scope.split(' ') : [],
    expiresAt: typeof claims.exp === 'number' ? claims.exp : undefined,
    extra: { userId: claims.sub },
  }
}

export function callerOf(authInfo: AuthInfo | undefined): Caller {
  const userId = authInfo?.extra?.userId
  if (!authInfo || typeof userId !== 'string') {
    throw new Error('Not signed in. Reconnect the Poker Ledger connector.')
  }
  return { userId, token: authInfo.token }
}
