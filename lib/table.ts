// What is still on the table, and who is still sitting at it.
//
// Pure: the active game screen, the counting screen and their tests all read
// the same answers, so "3 players left" cannot mean one thing in the tracker
// and another in the header.

import { chipsToCents } from './money'

export type CashoutRecord = {
  memberId: string
  chips: number
  recordedAt: string
  /** Recorded mid-game: this player got up and left. */
  leftTable: boolean
}

/** 0 is a real count — the player busted. Only null is "not counted yet". */
export function isEntered(chips: number | null | undefined): boolean {
  return chips !== null && chips !== undefined
}

export function hasLeftTable(
  memberId: string,
  cashouts: CashoutRecord[]
): boolean {
  return cashouts.some((c) => c.memberId === memberId && c.leftTable)
}

export function cashoutFor(
  memberId: string,
  cashouts: CashoutRecord[]
): CashoutRecord | null {
  return cashouts.find((c) => c.memberId === memberId) ?? null
}

export type TableState = {
  cashedOutChips: number
  cashedOutCents: number
  /** Pot minus what has already been paid out. */
  chipsOnTable: number
  centsOnTable: number
  /** More chips handed back than were ever bought. Provably an error. */
  overdrawn: boolean
}

/**
 * The pot is unchanged by a cash out — it is the sum of the buy-ins and
 * always will be. What changes is how much of it is still in play.
 */
export function tableState({
  potChips,
  potCents,
  cashouts,
  chipsPerDollar,
}: {
  potChips: number
  potCents: number
  /** Only players who left mid-game have been paid out. */
  cashouts: CashoutRecord[]
  chipsPerDollar: number
}): TableState {
  const out = cashouts.filter((c) => c.leftTable)
  const cashedOutChips = out.reduce((s, c) => s + c.chips, 0)
  const cashedOutCents = out.reduce(
    (s, c) => s + chipsToCents(c.chips, chipsPerDollar),
    0
  )
  return {
    cashedOutChips,
    cashedOutCents,
    chipsOnTable: potChips - cashedOutChips,
    centsOnTable: potCents - cashedOutCents,
    overdrawn: cashedOutChips > potChips,
  }
}

/**
 * The chip counts the counting screen opens with. A player who cashed out
 * mid-game arrives already entered, so the admin is not asked to count a
 * stack that left two hours ago.
 */
export function prefilledChips(
  cashouts: CashoutRecord[]
): Record<string, string> {
  return Object.fromEntries(cashouts.map((c) => [c.memberId, String(c.chips)]))
}

/** Players still to count — never anyone who already cashed out. */
export function stillToCount<T extends { memberId: string }>(
  players: T[],
  entered: (p: T) => number | null
): T[] {
  return players.filter((p) => !isEntered(entered(p)))
}
