import { describe, expect, it } from 'vitest'
import {
  VENMO_NOTE,
  handleProblem,
  isValidHandle,
  normalizeHandle,
  resolveVenmoHandle,
  venmoLink,
} from './venmo'

describe('normalizeHandle', () => {
  it('strips a leading @ and surrounding whitespace', () => {
    expect(normalizeHandle('  @gilad ')).toBe('gilad')
    expect(normalizeHandle('gilad')).toBe('gilad')
    expect(normalizeHandle('@@gilad')).toBe('gilad')
  })

  it('treats blank and missing as no handle', () => {
    expect(normalizeHandle('')).toBeNull()
    expect(normalizeHandle('   ')).toBeNull()
    expect(normalizeHandle('@')).toBeNull()
    expect(normalizeHandle(null)).toBeNull()
    expect(normalizeHandle(undefined)).toBeNull()
  })
})

describe('resolveVenmoHandle', () => {
  it('prefers the group member override', () => {
    expect(resolveVenmoHandle('@group-handle', 'profile-handle')).toBe(
      'group-handle'
    )
  })

  it('falls back to the profile when the override is null', () => {
    expect(resolveVenmoHandle(null, '@profile-handle')).toBe('profile-handle')
    expect(resolveVenmoHandle('  ', 'profile-handle')).toBe('profile-handle')
  })

  it('returns null when neither is set', () => {
    expect(resolveVenmoHandle(null, null)).toBeNull()
    expect(resolveVenmoHandle(undefined, undefined)).toBeNull()
    expect(resolveVenmoHandle('', '   ')).toBeNull()
  })
})

describe('venmoLink', () => {
  it('builds a pay link with the amount prefilled', () => {
    const { web } = venmoLink('@gilad', 8000)
    expect(web).toBe(
      'https://venmo.com/gilad?txn=pay&amount=80.00&note=%E2%99%A0%EF%B8%8F'
    )
  })

  it('sends the spade as UTF-8 percent-escapes, not raw or double-encoded', () => {
    // Raw bytes in a URL and a literal % in the note are the two ways this
    // arrives in Venmo as mojibake rather than a spade.
    const { web, app } = venmoLink('gilad', 100)
    expect(web).toContain('note=%E2%99%A0%EF%B8%8F')
    expect(app).toContain('note=%E2%99%A0%EF%B8%8F')
    expect(web).not.toContain(VENMO_NOTE)
    expect(web).not.toContain('%25')
  })

  it('round-trips back to exactly the spade', () => {
    const note = new URL(venmoLink('gilad', 100).web).searchParams.get('note')
    expect(note).toBe(VENMO_NOTE)
    expect(note).toBe('♠️')
    // U+2660 plus the U+FE0F variation selector that forces emoji rendering
    // rather than the monochrome glyph.
    expect([...VENMO_NOTE].map((c) => c.codePointAt(0)?.toString(16))).toEqual([
      '2660',
      'fe0f',
    ])
  })

  it('carries nothing about the group or the game', () => {
    const { web } = venmoLink('gilad', 8000)
    expect(web).toBe(
      `https://venmo.com/gilad?txn=pay&amount=80.00&note=${encodeURIComponent(
        VENMO_NOTE
      )}`
    )
  })
})

describe('handleProblem', () => {
  it('takes @nadav-a and nadav-a as the same thing', () => {
    expect(normalizeHandle('@nadav-a')).toBe('nadav-a')
    expect(normalizeHandle('nadav-a')).toBe('nadav-a')
    expect(isValidHandle('@nadav-a')).toBe(true)
    expect(isValidHandle('nadav-a')).toBe(true)
  })

  it('judges the handle after stripping, so a leading @ is never an error', () => {
    expect(handleProblem('  @nadav-a  ')).toBeNull()
    expect(handleProblem('@@nadav-a')).toBeNull()
  })

  it('rejects an @ anywhere but the front', () => {
    expect(handleProblem('nadav@example.com')).toBeTruthy()
    expect(handleProblem('@nadav@a')).toBeTruthy()
    expect(isValidHandle('nadav@example.com')).toBe(false)
  })

  it('rejects a handle with a space inside it', () => {
    expect(handleProblem('nadav a')).toBeTruthy()
  })

  it('treats an empty field as no handle rather than a bad one', () => {
    expect(handleProblem('')).toBeNull()
    expect(handleProblem('   ')).toBeNull()
    expect(handleProblem('@')).toBeNull()
    expect(handleProblem(null)).toBeNull()
    expect(isValidHandle(undefined)).toBe(true)
  })

  it('builds the same link either way it was typed', () => {
    expect(venmoLink('@gilad', 8000).web).toBe(venmoLink('gilad', 8000).web)
  })
})
