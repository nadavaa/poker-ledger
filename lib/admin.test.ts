import { describe, expect, it } from 'vitest'
import {
  barHeights,
  formatDuration,
  formatHours,
  formatNumber,
  formatPct,
  pct,
} from './admin'

describe('an app with almost no data yet', () => {
  it('does not turn nothing into NaN', () => {
    expect(pct(0, 0)).toBeNull()
    expect(formatPct(pct(0, 0))).toBe('—')
    expect(formatPct(pct(0, 10))).toBe('0%')
    expect(formatPct(pct(3, 4))).toBe('75%')
  })

  it('says nothing rather than zero for an empty median', () => {
    expect(formatNumber(null)).toBe('—')
    expect(formatNumber(undefined)).toBe('—')
    expect(formatNumber(0)).toBe('0')
    expect(formatNumber(2.5)).toBe('2.5')
  })

  it('draws a flat chart instead of dividing by an empty range', () => {
    expect(barHeights([0, 0, 0])).toEqual([0, 0, 0])
    expect(barHeights([])).toEqual([])
    expect(barHeights([1, 2, 4])).toEqual([0.25, 0.5, 1])
  })
})

describe('durations', () => {
  it('reads as a game length, not a number of minutes', () => {
    expect(formatDuration(45)).toBe('45m')
    expect(formatDuration(215)).toBe('3h 35m')
    expect(formatDuration(null)).toBe('—')
  })

  it('switches to days once hours stop being readable', () => {
    expect(formatHours(3.2)).toBe('3.2h')
    expect(formatHours(72)).toBe('3.0d')
    expect(formatHours(null)).toBe('—')
  })
})
