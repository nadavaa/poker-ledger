import { describe, expect, it } from 'vitest'
import { friendlyAuthError, loginContext, retryAfterSeconds, safeNext } from './login'

describe('safeNext', () => {
  it('keeps same-site paths', () => {
    expect(safeNext('/join/abc')).toBe('/join/abc')
  })
  it('drops missing, absolute and protocol-relative targets', () => {
    expect(safeNext(null)).toBe('/')
    expect(safeNext('https://evil.example')).toBe('/')
    expect(safeNext('//evil.example')).toBe('/')
  })
})

describe('loginContext', () => {
  it('recognises each invite kind', () => {
    expect(loginContext('/join/abc123')).toBe('group-invite')
    expect(loginContext('/claim/xyz')).toBe('claim')
    expect(loginContext('/games/1234/join')).toBe('game-invite')
    expect(loginContext('/oauth/consent?authorization_id=1')).toBe('connector')
  })
  it('is null for ordinary destinations', () => {
    expect(loginContext('/')).toBeNull()
    expect(loginContext('/games/1234')).toBeNull()
    expect(loginContext('/join/abc/extra')).toBeNull()
  })
})

describe('friendlyAuthError', () => {
  it('reads the wait time out of a rate-limit message', () => {
    const msg = 'For security purposes, you can only request this after 42 seconds.'
    expect(retryAfterSeconds(msg)).toBe(42)
    expect(friendlyAuthError(msg)).toContain('42 seconds')
  })
  it('handles a bare 429', () => {
    expect(friendlyAuthError('Email rate limit exceeded', 429)).toMatch(/Too many tries/)
  })
  it('explains a bad address', () => {
    expect(friendlyAuthError('Unable to validate email address: invalid format')).toMatch(
      /doesn't look right/
    )
  })
  it('explains a network failure', () => {
    expect(friendlyAuthError('Failed to fetch')).toMatch(/connection/)
  })
  it('never echoes unknown raw text', () => {
    expect(friendlyAuthError('pgrst internal xyz')).toBe(
      'Something went wrong. Try again, or continue with Google.'
    )
  })
})
