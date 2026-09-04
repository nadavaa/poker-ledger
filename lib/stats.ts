// Per-player statistics for one group.
//
// Pure by design, same as lib/settle.ts: no imports from Supabase, Next, or
// React. Input is one entry per settled game; output is the numbers a player
// sees on their stats tab.

export type GameResult = {
  gameId: string
  /** Cashout minus buy-ins plus adjustments, in integer cents. */
  netCents: number
  buyinCents: number
  /** ISO timestamp. Ordering for streaks is by this, ascending. */
  playedAt: string
}

export type StreakKind = 'win' | 'loss' | 'none'
export type Streak = { kind: StreakKind; length: number }

export type Stats = {
  gamesPlayed: number
  totalNetCents: number
  /** Rounded to whole cents; money stays integral. */
  averageNetCents: number
  totalBoughtInCents: number
  wins: number
  losses: number
  breakEvens: number
  /** Wins over games played, 0..1. A break-even game is not a win. */
  winRate: number
  best: GameResult
  worst: GameResult
  currentStreak: Streak
  longestWinStreak: number
  longestLossStreak: number
}

export type BalancePoint = {
  gameId: string
  playedAt: string
  /** Cumulative net after this game. */
  balanceCents: number
}

/**
 * The running balance after each settled game, oldest first. This is the
 * shape of a season: the number people actually argue about is where the
 * line is now, but the story is how it got there.
 */
export function runningBalance(results: GameResult[]): BalancePoint[] {
  const ordered = [...results].sort(
    (a, b) =>
      a.playedAt.localeCompare(b.playedAt) ||
      a.gameId.localeCompare(b.gameId)
  )
  let balance = 0
  return ordered.map((r) => {
    balance += r.netCents
    return {
      gameId: r.gameId,
      playedAt: r.playedAt,
      balanceCents: balance,
    }
  })
}

/**
 * Returns null when there is nothing to report, so callers render an empty
 * state instead of a wall of zeroes and a NaN average.
 *
 * Callers pass settled games only — an unfinished game has no meaningful net.
 */
export function computeStats(results: GameResult[]): Stats | null {
  if (results.length === 0) return null

  const ordered = [...results].sort(
    (a, b) =>
      a.playedAt.localeCompare(b.playedAt) ||
      a.gameId.localeCompare(b.gameId)
  )

  let totalNetCents = 0
  let totalBoughtInCents = 0
  let wins = 0
  let losses = 0
  let breakEvens = 0

  let best = ordered[0]
  let worst = ordered[0]

  let kind: StreakKind = 'none'
  let length = 0
  let longestWinStreak = 0
  let longestLossStreak = 0

  for (const r of ordered) {
    totalNetCents += r.netCents
    totalBoughtInCents += r.buyinCents

    if (r.netCents > best.netCents) best = r
    if (r.netCents < worst.netCents) worst = r

    // Exactly zero is neither a win nor a loss: it ends a streak without
    // starting one.
    const outcome: StreakKind =
      r.netCents > 0 ? 'win' : r.netCents < 0 ? 'loss' : 'none'

    if (outcome === 'win') wins++
    else if (outcome === 'loss') losses++
    else breakEvens++

    if (outcome === 'none') {
      kind = 'none'
      length = 0
      continue
    }

    if (outcome === kind) length++
    else {
      kind = outcome
      length = 1
    }

    if (outcome === 'win') longestWinStreak = Math.max(longestWinStreak, length)
    else longestLossStreak = Math.max(longestLossStreak, length)
  }

  const gamesPlayed = ordered.length

  return {
    gamesPlayed,
    totalNetCents,
    averageNetCents: Math.round(totalNetCents / gamesPlayed),
    totalBoughtInCents,
    wins,
    losses,
    breakEvens,
    winRate: wins / gamesPlayed,
    best,
    worst,
    currentStreak: { kind, length },
    longestWinStreak,
    longestLossStreak,
  }
}
