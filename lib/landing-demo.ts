// The public demo's game. Invented players and amounts only: nothing here is,
// or may ever be derived from, a real group, player, balance or payment handle.
// Pure, like lib/settle.ts, so it can be tested with no I/O. It runs the same
// money helpers and the same settle() the real app uses.

import { centsToChips, chipsToCents } from './money'
import { settle, type Net, type Transfer } from './settle'

export const DEMO_BUY_IN_CENTS = 2000
export const DEMO_CHIPS_PER_DOLLAR = 100

export type DemoPlayer = { id: string; name: string }

export const DEMO_PLAYERS: readonly DemoPlayer[] = [
  { id: 'dana', name: 'Dana' },
  { id: 'marcus', name: 'Marcus' },
  { id: 'priya', name: 'Priya' },
  { id: 'theo', name: 'Theo' },
  { id: 'lena', name: 'Lena' },
  { id: 'sam', name: 'Sam' },
]

// Append-only, like the real thing: a correction voids an entry, it never
// removes one.
export type DemoBuyIn = { id: number; playerId: string; voided: boolean }

/** Buy-ins already on the table when the demo opens: ten, a $200 pot. */
const SEED_BUY_INS: Record<string, number> = {
  dana: 2,
  marcus: 1,
  priya: 3,
  theo: 1,
  lena: 2,
  sam: 1,
}

export function seedBuyIns(): DemoBuyIn[] {
  const out: DemoBuyIn[] = []
  for (const p of DEMO_PLAYERS) {
    for (let i = 0; i < SEED_BUY_INS[p.id]; i++) {
      out.push({ id: out.length + 1, playerId: p.id, voided: false })
    }
  }
  return out
}

/** Chip counts as typed; null is "not counted yet", which is not zero. */
export type DemoCounts = Record<string, number | null>

/** A count that is $3 short of the pot, so the settle gate has work to do. */
export function seedCounts(): DemoCounts {
  return {
    dana: 3600,
    marcus: 0,
    priya: 1100,
    theo: 4500,
    lena: 6500,
    sam: 4000,
  }
}

export function buyInCount(buyIns: readonly DemoBuyIn[], playerId: string) {
  return buyIns.filter((b) => b.playerId === playerId && !b.voided).length
}

export function inCents(buyIns: readonly DemoBuyIn[], playerId: string) {
  return buyInCount(buyIns, playerId) * DEMO_BUY_IN_CENTS
}

export function potCents(buyIns: readonly DemoBuyIn[]) {
  return buyIns.filter((b) => !b.voided).length * DEMO_BUY_IN_CENTS
}

export function potChips(buyIns: readonly DemoBuyIn[]) {
  return centsToChips(potCents(buyIns), DEMO_CHIPS_PER_DOLLAR)
}

export function countedChips(counts: DemoCounts) {
  return Object.values(counts).reduce<number>((s, c) => s + (c ?? 0), 0)
}

export function allCounted(counts: DemoCounts) {
  return DEMO_PLAYERS.every((p) => counts[p.id] !== null)
}

/** Pot minus counted, in chips. Positive is short, negative is over. */
export function differenceChips(
  buyIns: readonly DemoBuyIn[],
  counts: DemoCounts
) {
  return potChips(buyIns) - countedChips(counts)
}

export function canSettle(buyIns: readonly DemoBuyIn[], counts: DemoCounts) {
  return allCounted(counts) && differenceChips(buyIns, counts) === 0
}

export function outCents(counts: DemoCounts, playerId: string) {
  return chipsToCents(counts[playerId] ?? 0, DEMO_CHIPS_PER_DOLLAR)
}

export function demoNets(
  buyIns: readonly DemoBuyIn[],
  counts: DemoCounts
): Net[] {
  return DEMO_PLAYERS.map((p) => ({
    memberId: p.id,
    netCents: outCents(counts, p.id) - inCents(buyIns, p.id),
  }))
}

/** The settlement, or null while the counts do not balance. */
export function demoTransfers(
  buyIns: readonly DemoBuyIn[],
  counts: DemoCounts
): Transfer[] | null {
  return canSettle(buyIns, counts) ? settle(demoNets(buyIns, counts)) : null
}

export function playerName(id: string) {
  return DEMO_PLAYERS.find((p) => p.id === id)?.name ?? id
}
