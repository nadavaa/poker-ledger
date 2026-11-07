import { describe, expect, it } from 'vitest'
import {
  cleanRef,
  describeSource,
  externalHost,
  firstTouchSource,
  isInvitePath,
  isPageLoad,
} from './signup-source'

const VALID = /^[a-z0-9:._-]{1,64}$/
const HOST = 'www.kevespoker.com'

describe('cleanRef', () => {
  it('lowercases and keeps safe characters', () => {
    expect(cleanRef('Reddit_HomeGames')).toBe('reddit_homegames')
  })
  it('turns anything else into single dashes and trims them', () => {
    expect(cleanRef('  linkedin post #1 ')).toBe('linkedin-post-1')
    expect(cleanRef('<script>')).toBe('script')
  })
  it('is null for empty or symbol-only input', () => {
    expect(cleanRef(null)).toBeNull()
    expect(cleanRef('')).toBeNull()
    expect(cleanRef('!!!')).toBeNull()
  })
  it('caps the length', () => {
    expect(cleanRef('a'.repeat(200))!.length).toBe(40)
  })
})

describe('externalHost', () => {
  it('returns the bare domain of an outside referrer', () => {
    expect(externalHost('https://www.google.com/', HOST)).toBe('google.com')
    expect(externalHost('https://chatgpt.com/c/abc', HOST)).toBe('chatgpt.com')
  })
  it('ignores this site, with or without www', () => {
    expect(externalHost('https://kevespoker.com/', HOST)).toBeNull()
    expect(externalHost('https://www.kevespoker.com/x', 'kevespoker.com')).toBeNull()
  })
  it('ignores missing or malformed referrers', () => {
    expect(externalHost(null, HOST)).toBeNull()
    expect(externalHost('not a url', HOST)).toBeNull()
  })
})

describe('isInvitePath', () => {
  it('matches group, claim and game links', () => {
    expect(isInvitePath('/join/abc')).toBe(true)
    expect(isInvitePath('/claim/abc')).toBe(true)
    expect(isInvitePath('/games/123/join')).toBe(true)
  })
  it('does not match other pages', () => {
    expect(isInvitePath('/games/123')).toBe(false)
    expect(isInvitePath('/')).toBe(false)
    expect(isInvitePath('/joinx')).toBe(false)
  })
})

describe('firstTouchSource', () => {
  const base = { ref: null, referer: null, pathname: '/', host: HOST }
  it('prefers a ref tag over everything', () => {
    expect(
      firstTouchSource({
        ...base,
        ref: 'reddit',
        referer: 'https://www.reddit.com/',
        pathname: '/join/x',
      })
    ).toBe('ref:reddit')
  })
  it('then an outside referrer', () => {
    expect(
      firstTouchSource({ ...base, referer: 'https://google.com/', pathname: '/join/x' })
    ).toBe('web:google.com')
  })
  it('then an invite link', () => {
    expect(firstTouchSource({ ...base, pathname: '/games/1/join' })).toBe('invite')
  })
  it('else direct', () => {
    expect(firstTouchSource(base)).toBe('direct')
  })
  it('always fits the database check', () => {
    const inputs = [
      { ...base, ref: 'X'.repeat(500) },
      { ...base, referer: 'https://sub.' + 'a'.repeat(50) + '.example.com/' },
      { ...base, ref: '💥 emoji' },
    ]
    for (const i of inputs) expect(firstTouchSource(i)).toMatch(VALID)
  })
})

describe('isPageLoad', () => {
  const html = 'text/html,application/xhtml+xml'
  it('accepts a normal page navigation', () => {
    expect(isPageLoad({ method: 'GET', pathname: '/', accept: html })).toBe(true)
  })
  it('skips API, auth, posts and router prefetches', () => {
    expect(isPageLoad({ method: 'GET', pathname: '/api/mcp', accept: html })).toBe(false)
    expect(isPageLoad({ method: 'GET', pathname: '/auth/callback', accept: html })).toBe(false)
    expect(isPageLoad({ method: 'POST', pathname: '/', accept: html })).toBe(false)
    expect(isPageLoad({ method: 'GET', pathname: '/', accept: 'text/x-component' })).toBe(false)
    expect(isPageLoad({ method: 'GET', pathname: '/', accept: null })).toBe(false)
  })
})

describe('describeSource', () => {
  it('reads each kind plainly', () => {
    expect(describeSource(null)).toBe('before tracking')
    expect(describeSource('ref:reddit')).toBe('reddit')
    expect(describeSource('web:google.com')).toBe('google.com')
    expect(describeSource('invite')).toBe('invite link')
    expect(describeSource('direct')).toBe('direct')
  })
})
