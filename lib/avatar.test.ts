import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { avatarColor, avatarSrc, initials, storagePath } from './avatar'

describe('initials', () => {
  it('takes the first and last word', () => {
    expect(initials('Nadav Aaronson')).toBe('NA')
    expect(initials('Gilad')).toBe('G')
    expect(initials('mary jane watson')).toBe('MW')
  })

  it('never renders empty, whatever it is given', () => {
    expect(initials('')).toBe('?')
    expect(initials('   ')).toBe('?')
    expect(initials(null)).toBe('?')
    expect(initials(undefined)).toBe('?')
  })
})

describe('avatarColor', () => {
  it('gives the same id the same colour every time', () => {
    const a = avatarColor('abc-123')
    const b = avatarColor('abc-123')
    expect(a).toEqual(b)
  })

  it('separates different ids', () => {
    const colours = new Set(
      ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => avatarColor(id).background)
    )
    expect(colours.size).toBeGreaterThan(1)
  })

  it('copes with a missing id', () => {
    expect(avatarColor(null).background).toMatch(/^hsl\(/)
  })
})

describe('avatarSrc', () => {
  // Read at call time, so the test supplies it rather than relying on .env.
  const original = process.env.NEXT_PUBLIC_SUPABASE_URL
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
  })
  afterEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = original
  })

  it('passes an absolute URL through, like the one Google gives us', () => {
    const google = 'https://lh3.googleusercontent.com/a/abc123'
    expect(avatarSrc(google, 'avatars')).toBe(google)
  })

  it('builds a public URL from a storage path', () => {
    const url = avatarSrc('user-id/photo.webp', 'avatars')
    expect(url).toContain('/storage/v1/object/public/avatars/user-id/photo.webp')
  })

  it('returns null when there is nothing stored', () => {
    expect(avatarSrc(null, 'avatars')).toBeNull()
    expect(avatarSrc('   ', 'avatars')).toBeNull()
  })
})

describe('storagePath', () => {
  it('only claims values we actually wrote', () => {
    expect(storagePath('user-id/photo.webp')).toBe('user-id/photo.webp')
    expect(storagePath('https://lh3.googleusercontent.com/a/x')).toBeNull()
    expect(storagePath(null)).toBeNull()
  })
})
