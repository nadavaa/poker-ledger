import { describe, expect, it } from 'vitest'
import { money, moment, momentOrNull, toIso } from './format'

describe('money', () => {
  it('pairs integer cents with the same display the app shows', () => {
    expect(money(5000)).toEqual({ cents: 5000, display: '$50' })
    expect(money(-1250)).toEqual({ cents: -1250, display: '-$12.50' })
    expect(money(0)).toEqual({ cents: 0, display: '$0' })
    expect(money(115000).display).toBe('$1,150')
  })
})

describe('moment', () => {
  it('is an ISO instant plus the group-zone rendering', () => {
    // 8pm in New York in September is 00:00Z the next day.
    expect(moment('2026-09-07T00:00:00Z', 'America/New_York')).toEqual({
      iso: '2026-09-07T00:00:00.000Z',
      local: 'Sun, Sep 6, 8:00 PM',
      timezone: 'America/New_York',
    })
  })

  it('follows DST rather than a fixed offset', () => {
    expect(moment('2026-01-16T01:00:00Z', 'America/New_York').local).toBe(
      'Thu, Jan 15, 8:00 PM'
    )
  })

  it('reads the zone it is given, not the server', () => {
    expect(moment('2026-09-07T00:00:00Z', 'America/Los_Angeles').local).toBe(
      'Sun, Sep 6, 5:00 PM'
    )
  })

  it('accepts the space-separated form Postgres sometimes returns', () => {
    expect(toIso('2026-09-06 20:00:00+00')).toBe('2026-09-06T20:00:00.000Z')
  })

  it('refuses something that is not a time', () => {
    expect(() => toIso('last tuesday')).toThrow()
  })

  it('passes null through', () => {
    expect(momentOrNull(null, 'America/New_York')).toBeNull()
  })
})
