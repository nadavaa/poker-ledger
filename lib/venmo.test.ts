import { describe, expect, it } from 'vitest'
import { normalizeHandle, resolveVenmoHandle, venmoLink } from './venmo'

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
  it('builds a pay link with the amount and note prefilled', () => {
    const { web } = venmoLink('@gilad', 8000, 'Tuesday crew · Aug 28', 'pay')
    expect(web).toBe(
      'https://venmo.com/gilad?txn=pay&amount=80.00&note=Tuesday%20crew%20%C2%B7%20Aug%2028'
    )
  })

  it('builds a charge link for collecting', () => {
    const { web } = venmoLink('yoni', 4500, 'note', 'charge')
    expect(web).toBe('https://venmo.com/yoni?txn=charge&amount=45.00&note=note')
  })
})
