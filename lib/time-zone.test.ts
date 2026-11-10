import { describe, expect, it } from 'vitest'
import { isValidTimeZone, timeZoneOptions, US_TIME_ZONES } from './time'

describe('isValidTimeZone', () => {
  it('accepts IANA zones', () => {
    expect(isValidTimeZone('America/Chicago')).toBe(true)
    expect(isValidTimeZone('Asia/Jerusalem')).toBe(true)
  })
  it('rejects junk', () => {
    expect(isValidTimeZone('Mars/Olympus')).toBe(false)
    expect(isValidTimeZone('')).toBe(false)
    expect(isValidTimeZone(null)).toBe(false)
    expect(isValidTimeZone(42)).toBe(false)
  })
})

describe('timeZoneOptions', () => {
  it('is the US list when the current zone is in it', () => {
    expect(timeZoneOptions('America/Denver')).toEqual(US_TIME_ZONES)
  })
  it('keeps a non-US current zone as the last option', () => {
    const opts = timeZoneOptions('Europe/London')
    expect(opts).toHaveLength(US_TIME_ZONES.length + 1)
    expect(opts.at(-1)).toEqual({ id: 'Europe/London', label: 'Europe/London' })
  })
  it('ignores an invalid current zone', () => {
    expect(timeZoneOptions('Nowhere/Land')).toEqual(US_TIME_ZONES)
  })
  it('starts with New York, the default', () => {
    expect(timeZoneOptions('America/New_York')[0].id).toBe('America/New_York')
  })
})
