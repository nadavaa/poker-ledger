import { describe, expect, it } from 'vitest'
import { computeStats, runningBalance, type GameResult } from './stats'

/** Games one day apart, in the order given. */
function games(...nets: number[]): GameResult[] {
  return nets.map((netCents, i) => ({
    gameId: `g${i}`,
    netCents,
    buyinCents: 5000,
    playedAt: `2026-08-${String(i + 1).padStart(2, '0')}T20:00:00.000Z`,
  }))
}

describe('computeStats', () => {
  it('returns null for no settled games', () => {
    expect(computeStats([])).toBeNull()
  })

  it('handles a single winning game', () => {
    const s = computeStats(games(2500))!
    expect(s.gamesPlayed).toBe(1)
    expect(s.totalNetCents).toBe(2500)
    expect(s.averageNetCents).toBe(2500)
    expect(s.totalBoughtInCents).toBe(5000)
    expect(s.winRate).toBe(1)
    expect(s.currentStreak).toEqual({ kind: 'win', length: 1 })
    expect(s.longestWinStreak).toBe(1)
    expect(s.longestLossStreak).toBe(0)
    expect(s.best.netCents).toBe(2500)
    expect(s.worst.netCents).toBe(2500)
  })

  it('handles all wins', () => {
    const s = computeStats(games(100, 200, 300))!
    expect(s.wins).toBe(3)
    expect(s.losses).toBe(0)
    expect(s.currentStreak).toEqual({ kind: 'win', length: 3 })
    expect(s.longestWinStreak).toBe(3)
    expect(s.longestLossStreak).toBe(0)
    expect(s.best.netCents).toBe(300)
    expect(s.worst.netCents).toBe(100)
    expect(s.winRate).toBe(1)
  })

  it('handles all losses', () => {
    const s = computeStats(games(-100, -200, -300))!
    expect(s.losses).toBe(3)
    expect(s.currentStreak).toEqual({ kind: 'loss', length: 3 })
    expect(s.longestLossStreak).toBe(3)
    expect(s.longestWinStreak).toBe(0)
    expect(s.winRate).toBe(0)
    expect(s.totalNetCents).toBe(-600)
    expect(s.averageNetCents).toBe(-200)
  })

  it('handles alternating results', () => {
    const s = computeStats(games(100, -100, 100, -100))!
    expect(s.longestWinStreak).toBe(1)
    expect(s.longestLossStreak).toBe(1)
    expect(s.currentStreak).toEqual({ kind: 'loss', length: 1 })
    expect(s.totalNetCents).toBe(0)
    expect(s.winRate).toBe(0.5)
  })

  it('lets a break-even game end a streak without starting one', () => {
    const s = computeStats(games(100, 100, 0, 100))!
    expect(s.longestWinStreak).toBe(2)
    expect(s.breakEvens).toBe(1)
    // The zero broke the run of two, so the tail is a fresh streak of one.
    expect(s.currentStreak).toEqual({ kind: 'win', length: 1 })
    expect(s.wins).toBe(3)
    expect(s.winRate).toBe(0.75)
  })

  it('handles a break-even game at the start', () => {
    const s = computeStats(games(0, -100, -100))!
    expect(s.breakEvens).toBe(1)
    expect(s.longestLossStreak).toBe(2)
    expect(s.currentStreak).toEqual({ kind: 'loss', length: 2 })
  })

  it('reports no streak when the most recent game was break-even', () => {
    const s = computeStats(games(100, 100, 0))!
    expect(s.longestWinStreak).toBe(2)
    expect(s.currentStreak).toEqual({ kind: 'none', length: 0 })
  })

  it('handles every game breaking even', () => {
    const s = computeStats(games(0, 0, 0))!
    expect(s.wins).toBe(0)
    expect(s.losses).toBe(0)
    expect(s.breakEvens).toBe(3)
    expect(s.winRate).toBe(0)
    expect(s.currentStreak).toEqual({ kind: 'none', length: 0 })
    expect(s.longestWinStreak).toBe(0)
    expect(s.longestLossStreak).toBe(0)
    expect(s.averageNetCents).toBe(0)
  })

  it('orders by date, not input order', () => {
    // Fed newest-first; the streak should still read chronologically.
    const unordered: GameResult[] = [
      { gameId: 'c', netCents: -100, buyinCents: 5000, playedAt: '2026-08-03T20:00:00.000Z' },
      { gameId: 'a', netCents: 100, buyinCents: 5000, playedAt: '2026-08-01T20:00:00.000Z' },
      { gameId: 'b', netCents: 100, buyinCents: 5000, playedAt: '2026-08-02T20:00:00.000Z' },
    ]
    const s = computeStats(unordered)!
    expect(s.longestWinStreak).toBe(2)
    expect(s.currentStreak).toEqual({ kind: 'loss', length: 1 })
  })

  it('rounds the average to whole cents', () => {
    const s = computeStats(games(100, 101))!
    expect(Number.isInteger(s.averageNetCents)).toBe(true)
    expect(s.averageNetCents).toBe(101) // 100.5 rounds up
  })
})

describe('runningBalance', () => {
  it('accumulates oldest first', () => {
    expect(runningBalance(games(100, -30, 50)).map((p) => p.balanceCents)).toEqual(
      [100, 70, 120]
    )
  })

  it('orders by date, not input order', () => {
    const unordered: GameResult[] = [
      { gameId: 'b', netCents: -50, buyinCents: 5000, playedAt: '2026-08-02T20:00:00.000Z' },
      { gameId: 'a', netCents: 200, buyinCents: 5000, playedAt: '2026-08-01T20:00:00.000Z' },
    ]
    expect(runningBalance(unordered).map((p) => p.balanceCents)).toEqual([200, 150])
  })

  it('is empty for no games', () => {
    expect(runningBalance([])).toEqual([])
  })
})
