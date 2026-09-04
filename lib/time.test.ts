import { describe, expect, it } from 'vitest'
import {
  byPlayedAtDesc,
  formatTime,
  fromZonedInput,
  playedAt,
  toZonedInput,
} from './time'

const NY = 'America/New_York'

describe('fromZonedInput', () => {
  it('reads 8pm in winter as EST, five hours behind UTC', () => {
    expect(fromZonedInput('2026-01-15T20:00', NY)).toBe(
      '2026-01-16T01:00:00.000Z'
    )
  })

  it('reads 8pm in summer as EDT, four hours behind UTC', () => {
    expect(fromZonedInput('2026-07-15T20:00', NY)).toBe(
      '2026-07-16T00:00:00.000Z'
    )
  })

  it('is not a fixed offset — March and November differ', () => {
    // The Sunday DST springs forward, and the Sunday it falls back.
    expect(fromZonedInput('2026-03-07T20:00', NY)).toBe(
      '2026-03-08T01:00:00.000Z'
    )
    expect(fromZonedInput('2026-03-09T20:00', NY)).toBe(
      '2026-03-10T00:00:00.000Z'
    )
    expect(fromZonedInput('2026-11-02T20:00', NY)).toBe(
      '2026-11-03T01:00:00.000Z'
    )
  })

  it('works for a zone on the other side of UTC', () => {
    expect(fromZonedInput('2026-07-15T20:00', 'Asia/Jerusalem')).toBe(
      '2026-07-15T17:00:00.000Z'
    )
  })

  it('is UTC in UTC', () => {
    expect(fromZonedInput('2026-07-15T20:00', 'UTC')).toBe(
      '2026-07-15T20:00:00.000Z'
    )
  })

  it('refuses something that is not a date', () => {
    expect(() => fromZonedInput('next tuesday', NY)).toThrow()
  })
})

describe('toZonedInput', () => {
  it('round-trips against fromZonedInput across DST', () => {
    for (const local of [
      '2026-01-15T20:00',
      '2026-07-15T20:00',
      '2026-03-09T20:00',
      '2026-11-02T20:00',
      '2026-12-31T23:30',
    ]) {
      expect(toZonedInput(fromZonedInput(local, NY), NY)).toBe(local)
    }
  })

  it('shows a stored instant as the group reads it, not as UTC', () => {
    // The bug, stated as a test: 8pm EDT is midnight UTC the next day.
    expect(toZonedInput('2026-07-16T00:00:00.000Z', NY)).toBe(
      '2026-07-15T20:00'
    )
  })
})

describe('formatTime', () => {
  const summerEvening = '2026-07-16T00:00:00.000Z' // 8pm EDT on the 15th

  it('renders in the group zone, never the machine zone', () => {
    expect(formatTime(summerEvening, NY, 'when')).toBe('Wed, Jul 15, 8:00 PM')
    expect(formatTime(summerEvening, 'UTC', 'when')).toBe(
      'Thu, Jul 16, 12:00 AM'
    )
  })

  it('gives the same answer whatever the process zone is', () => {
    // Nothing here reads the ambient zone, which is what makes SSR and
    // hydration agree.
    const before = process.env.TZ
    process.env.TZ = 'Pacific/Auckland'
    const a = formatTime(summerEvening, NY, 'when')
    process.env.TZ = 'UTC'
    const b = formatTime(summerEvening, NY, 'when')
    process.env.TZ = before
    expect(a).toBe(b)
  })

  it('has a style for each place a time is shown', () => {
    expect(formatTime(summerEvening, NY, 'day')).toBe('Jul 15, 2026')
    expect(formatTime(summerEvening, NY, 'shortDay')).toBe('Jul 15')
    expect(formatTime(summerEvening, NY, 'clock')).toBe('8:00 PM')
  })

  it('parses the shape Postgres sometimes returns', () => {
    expect(formatTime('2026-07-16 00:00:00+00', NY, 'clock')).toBe('8:00 PM')
  })

  it('returns nothing rather than "Invalid Date"', () => {
    expect(formatTime('', NY)).toBe('')
    expect(formatTime('not a date', NY)).toBe('')
  })
})

describe('playedAt', () => {
  const scheduledAt = '2026-09-05T00:00:00.000Z' // Fri 8pm ET
  const startedAt = '2026-09-05T01:30:00.000Z' // they got going at 9:30

  it('is when the game actually started', () => {
    expect(playedAt({ startedAt, scheduledAt })).toBe(startedAt)
  })

  it('falls back to the scheduled time when it never started', () => {
    // Cancelled, or logged after the fact. Either way it is not a null.
    expect(playedAt({ startedAt: null, scheduledAt })).toBe(scheduledAt)
  })

  it('is the night it was played, not the day it was settled', () => {
    // Ran Saturday night, settled Sunday afternoon.
    const saturdayNight = '2026-09-06T01:00:00.000Z'
    expect(formatTime(playedAt({ startedAt: saturdayNight, scheduledAt }), NY, 'day'))
      .toBe('Sep 5, 2026')
  })
})

describe('byPlayedAtDesc', () => {
  const g = (startedAt: string | null, scheduledAt: string) => ({
    startedAt,
    scheduledAt,
  })

  it('puts the most recent game first', () => {
    const games = [
      g('2026-07-01T00:00:00.000Z', '2026-07-01T00:00:00.000Z'),
      g('2026-09-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z'),
      g('2026-08-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z'),
    ]
    expect([...games].sort(byPlayedAtDesc).map((x) => x.startedAt)).toEqual([
      '2026-09-01T00:00:00.000Z',
      '2026-08-01T00:00:00.000Z',
      '2026-07-01T00:00:00.000Z',
    ])
  })

  it('does not sink a never-started game to the bottom', () => {
    const cancelled = g(null, '2026-09-15T00:00:00.000Z')
    const played = g('2026-08-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z')
    expect([played, cancelled].sort(byPlayedAtDesc)[0]).toBe(cancelled)
  })

  it('sorts a game by when it ran, not when it was scheduled', () => {
    // Scheduled for the 1st, actually played on the 20th.
    const late = g('2026-09-20T00:00:00.000Z', '2026-09-01T00:00:00.000Z')
    const other = g('2026-09-10T00:00:00.000Z', '2026-09-10T00:00:00.000Z')
    expect([other, late].sort(byPlayedAtDesc)[0]).toBe(late)
  })
})
