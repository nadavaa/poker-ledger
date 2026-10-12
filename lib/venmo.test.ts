import { describe, expect, it } from 'vitest'
import { VENMO_QUOTES, pickQuote } from './quotes'
import {
  VENMO_NOTE,
  VENMO_NOTE_MAX,
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
      'group-handle',
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
      'https://venmo.com/gilad?txn=pay&amount=80.00&note=%E2%99%A0%EF%B8%8F',
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
        VENMO_NOTE,
      )}`,
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

describe('quote notes', () => {
  it('carries a Hebrew quote as UTF-8 percent-escapes that round-trip', () => {
    const q = VENMO_QUOTES[0]
    const { web } = venmoLink('gilad', 100, q)
    expect(web).not.toContain(q)
    expect(new URL(web).searchParams.get('note')).toBe(
      q.replace(/ /g, '\u00a0'),
    )
  })

  it('sends spaces as no-break spaces, never + or a plain space', () => {
    const { web } = venmoLink('g', 100, 'שני קנגרו ו')
    expect(web).toContain('%C2%A0')
    expect(web).not.toContain('%20')
    expect(web).not.toContain('+')
  })

  it('round-trips every quote, punctuation included', () => {
    for (const q of VENMO_QUOTES) {
      const note = new URL(
        venmoLink('g', 100, q).app.replace('venmo://', 'https://x/'),
      ).searchParams.get('note')
      expect(note).toBe(q.replace(/ /g, '\u00a0'))
    }
  })

  it('falls back to the spade for a blank or unencodable quote', () => {
    const spade = venmoLink('g', 100).web
    expect(venmoLink('g', 100, '').web).toBe(spade)
    expect(venmoLink('g', 100, '   ').web).toBe(spade)
    expect(venmoLink('g', 100, '\ud800').web).toBe(spade)
  })

  it('truncates an over-long note without splitting a character', () => {
    const note = new URL(
      venmoLink('g', 100, 'א'.repeat(500)).web,
    ).searchParams.get('note')
    expect([...note!].length).toBe(VENMO_NOTE_MAX)
  })
})

describe('pickQuote', () => {
  it('never repeats back-to-back', () => {
    let prev = pickQuote(VENMO_QUOTES, () => 0)
    for (let i = 0; i < 50; i++) {
      const next = pickQuote(VENMO_QUOTES, () => 0)
      expect(next).not.toBe(prev)
      prev = next
    }
  })
})
