// Confirmation tokens for the write tools.
//
// A preview call returns a token; the commit call hands it back. The token is
// what makes "the user said yes" something the server can check rather than
// something the agent claims. It is bound to the user, the tool and the exact
// arguments, it expires after a few minutes, and the database refuses to
// accept the same one twice (mcp_consume_confirmation).
//
// Everything here is pure: signing, verifying and hashing, with the clock and
// the secret passed in. Single use is the one property that needs the
// database, and it lives in SQL.

import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto'

export const CONFIRMATION_TTL_MS = 5 * 60 * 1000

export type TokenFailure =
  | 'malformed'
  | 'signature'
  | 'expired'
  | 'wrong_user'
  | 'wrong_tool'
  | 'wrong_args'

export type TokenCheck =
  | { ok: true; jti: string; expiresAt: number }
  | { ok: false; reason: TokenFailure }

/** Short, and the same whatever went wrong: the agent's next step is the same. */
export const TOKEN_FAILURE_MESSAGE: Record<TokenFailure, string> = {
  malformed: 'That confirmation token is not valid. Call the tool again without a token to get a new preview.',
  signature: 'That confirmation token is not valid. Call the tool again without a token to get a new preview.',
  expired: 'That confirmation expired. Call the tool again without a token to get a fresh preview and ask the user again.',
  wrong_user: 'That confirmation was not issued to this user. Call the tool again without a token.',
  wrong_tool: 'That confirmation is for a different action. Call the tool again without a token.',
  wrong_args: 'The arguments changed since the preview. Call the tool again without a token to preview the new request.',
}

/** Keys sorted, undefined dropped, so the same request always hashes the same. */
export function canonicalArgs(args: Record<string, unknown>): string {
  const entries = Object.entries(args)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  return JSON.stringify(Object.fromEntries(entries))
}

export function argsHash(tool: string, args: Record<string, unknown>): string {
  return createHash('sha256')
    .update(`${tool}\n${canonicalArgs(args)}`)
    .digest('hex')
}

type Payload = { v: 1; u: string; t: string; a: string; e: number; j: string }

const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64url')
const sign = (secret: string, body: string) =>
  createHmac('sha256', secret).update(body).digest('base64url')

export function issueToken(opts: {
  secret: string
  userId: string
  tool: string
  args: Record<string, unknown>
  now: number
  ttlMs?: number
  jti?: string
}): { token: string; expiresAt: number } {
  if (!opts.secret) throw new Error('confirmation secret is not configured')
  const expiresAt = opts.now + (opts.ttlMs ?? CONFIRMATION_TTL_MS)
  const payload: Payload = {
    v: 1,
    u: opts.userId,
    t: opts.tool,
    a: argsHash(opts.tool, opts.args),
    e: expiresAt,
    j: opts.jti ?? randomUUID(),
  }
  const body = b64(JSON.stringify(payload))
  return { token: `${body}.${sign(opts.secret, body)}`, expiresAt }
}

export function verifyToken(opts: {
  secret: string
  token: string
  userId: string
  tool: string
  args: Record<string, unknown>
  now: number
}): TokenCheck {
  if (!opts.secret) throw new Error('confirmation secret is not configured')
  const parts = opts.token.split('.')
  if (parts.length !== 2) return { ok: false, reason: 'malformed' }
  const [body, sig] = parts

  // Signature first: nothing in the payload is trusted until it checks out.
  const expected = Buffer.from(sign(opts.secret, body))
  const given = Buffer.from(sig)
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
    return { ok: false, reason: 'signature' }
  }

  let payload: Payload
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
  } catch {
    return { ok: false, reason: 'malformed' }
  }
  if (payload.v !== 1 || typeof payload.j !== 'string') {
    return { ok: false, reason: 'malformed' }
  }

  if (opts.now >= payload.e) return { ok: false, reason: 'expired' }
  if (payload.u !== opts.userId) return { ok: false, reason: 'wrong_user' }
  if (payload.t !== opts.tool) return { ok: false, reason: 'wrong_tool' }
  if (payload.a !== argsHash(opts.tool, opts.args)) {
    return { ok: false, reason: 'wrong_args' }
  }
  return { ok: true, jti: payload.j, expiresAt: payload.e }
}
