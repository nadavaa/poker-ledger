import { describe, expect, it } from 'vitest'
import {
  CONFIRMATION_TTL_MS,
  argsHash,
  canonicalArgs,
  issueToken,
  verifyToken,
} from './confirm'
import { MAX_COMMITS, MAX_PREVIEWS, withinRate } from './limits'
import { friendlyDbError } from './errors'

const SECRET = 'test-secret-not-a-real-one'
const NOW = 1_800_000_000_000
const base = { secret: SECRET, userId: 'user-1', tool: 'mark_transfer_paid', args: { transfer_id: 't1' } }

const issue = (over: Partial<Parameters<typeof issueToken>[0]> = {}) =>
  issueToken({ ...base, now: NOW, ...over }).token

const verify = (token: string, over: Partial<Parameters<typeof verifyToken>[0]> = {}) =>
  verifyToken({ ...base, token, now: NOW + 1000, ...over })

describe('confirmation tokens', () => {
  it('accepts a token for the same user, tool and arguments', () => {
    const r = verify(issue())
    expect(r.ok).toBe(true)
  })

  it('expires after five minutes', () => {
    const token = issue()
    expect(verify(token, { now: NOW + CONFIRMATION_TTL_MS - 1 }).ok).toBe(true)
    expect(verify(token, { now: NOW + CONFIRMATION_TTL_MS })).toEqual({ ok: false, reason: 'expired' })
    expect(verify(token, { now: NOW + 60 * 60 * 1000 })).toEqual({ ok: false, reason: 'expired' })
  })

  it('refuses a different user', () => {
    expect(verify(issue(), { userId: 'user-2' })).toEqual({ ok: false, reason: 'wrong_user' })
  })

  it('refuses a different tool', () => {
    expect(verify(issue(), { tool: 'confirm_transfer_received' })).toEqual({ ok: false, reason: 'wrong_tool' })
  })

  it('refuses different arguments', () => {
    expect(verify(issue(), { args: { transfer_id: 't2' } })).toEqual({ ok: false, reason: 'wrong_args' })
  })

  it('does not care about argument order or an undefined extra', () => {
    const token = issue({ tool: 'x', args: { a: 1, b: 2 } })
    expect(verify(token, { tool: 'x', args: { b: 2, a: 1, c: undefined } }).ok).toBe(true)
  })

  it('refuses a token signed with another secret', () => {
    expect(verify(issue({ secret: 'someone-elses' }))).toEqual({ ok: false, reason: 'signature' })
  })

  it('refuses a tampered payload even if the signature is kept', () => {
    const [body, sig] = issue().split('.')
    const forged = Buffer.from(
      JSON.stringify({ ...JSON.parse(Buffer.from(body, 'base64url').toString()), u: 'user-2' })
    ).toString('base64url')
    expect(verify(`${forged}.${sig}`)).toEqual({ ok: false, reason: 'signature' })
  })

  it('refuses garbage without throwing', () => {
    for (const junk of ['', 'abc', 'a.b.c', '.', 'a.']) {
      expect(verify(junk).ok).toBe(false)
    }
  })

  it('gives every token its own id, which is what single use keys on', () => {
    const a = verify(issue())
    const b = verify(issue())
    expect(a.ok && b.ok && a.jti !== b.jti).toBe(true)
  })

  it('refuses to run with no secret configured', () => {
    expect(() => issue({ secret: '' })).toThrow()
  })
})

describe('argument hashing', () => {
  it('is stable and tool-specific', () => {
    expect(canonicalArgs({ b: 1, a: 2 })).toBe('{"a":2,"b":1}')
    expect(argsHash('t', { a: 1 })).toBe(argsHash('t', { a: 1 }))
    expect(argsHash('t', { a: 1 })).not.toBe(argsHash('u', { a: 1 }))
  })
})

describe('rate limit', () => {
  it('allows up to the limit and then refuses', () => {
    expect(withinRate({ commits: MAX_COMMITS - 1, previews: 0 }, 'commit')).toBe(true)
    expect(withinRate({ commits: MAX_COMMITS, previews: 0 }, 'commit')).toBe(false)
    expect(withinRate({ commits: 0, previews: MAX_PREVIEWS - 1 }, 'preview')).toBe(true)
    expect(withinRate({ commits: 0, previews: MAX_PREVIEWS }, 'preview')).toBe(false)
  })

  it('counts previews and commits separately', () => {
    expect(withinRate({ commits: MAX_COMMITS, previews: 0 }, 'preview')).toBe(true)
  })
})

describe('database refusals, in short sentences', () => {
  it.each([
    ['only the payer can mark this paid', /who owes/],
    ['only the person being paid, or the game admin closing it out, can confirm this', /being paid/],
    ['this payment is already confirmed', /already confirmed/],
    ['game is not open for signups', /not open/],
    ['enter a 10-digit US phone number', /10 digits/],
  ])('%s', (raw, expected) => {
    expect(friendlyDbError({ message: raw })).toMatch(expected)
  })

  it('never passes through an unknown raw message', () => {
    const text = friendlyDbError({ message: 'duplicate key value violates unique constraint "x_pkey"' })
    expect(text).not.toMatch(/constraint|pkey/)
  })

  it('treats a privilege or policy refusal as a plain refusal', () => {
    expect(friendlyDbError({ code: '42501', message: 'permission denied for table settlements' })).not.toMatch(/settlements/)
  })
})
