import { describe, expect, it } from 'vitest'
import { resolveDisplayName } from './names'

describe('resolveDisplayName', () => {
  it('prefers the profile, so a rename follows the person', () => {
    expect(resolveDisplayName('Old Snapshot', 'New Name')).toBe('New Name')
  })

  it('falls back to the member row for an unclaimed player', () => {
    expect(resolveDisplayName('Yoni', null)).toBe('Yoni')
    expect(resolveDisplayName('Yoni', undefined)).toBe('Yoni')
  })

  it('ignores a blank profile name rather than rendering nothing', () => {
    expect(resolveDisplayName('Yoni', '   ')).toBe('Yoni')
  })

  it('never returns an empty string', () => {
    expect(resolveDisplayName(null, null)).toBe('Unknown')
    expect(resolveDisplayName('  ', '')).toBe('Unknown')
  })
})
