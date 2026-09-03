import { describe, expect, it } from 'vitest'
import {
  cashoutFor,
  hasLeftTable,
  isEntered,
  prefilledChips,
  stillToCount,
  tableState,
  type CashoutRecord,
} from './table'

const at = '2026-09-03T23:12:00.000Z'
const rec = (
  memberId: string,
  chips: number,
  leftTable = true
): CashoutRecord => ({ memberId, chips, recordedAt: at, leftTable })

// One chip to the dollar throughout, so a chip figure and a cent figure are
// a clean factor of 100 apart and the conversion still goes through
// lib/money rather than being inlined here.
const RATIO = 1

describe('tableState', () => {
  it('leaves the pot alone and takes the leaver off the table', () => {
    const s = tableState({
      potChips: 1000,
      potCents: 100000,
      cashouts: [rec('a', 300)],
      chipsPerDollar: RATIO,
    })
    expect(s.cashedOutChips).toBe(300)
    expect(s.chipsOnTable).toBe(700)
    expect(s.centsOnTable).toBe(100000 - 30000)
    expect(s.overdrawn).toBe(false)
  })

  it('ignores counts recorded at the end of the game', () => {
    const s = tableState({
      potChips: 1000,
      potCents: 100000,
      cashouts: [rec('a', 300, false), rec('b', 200)],
      chipsPerDollar: RATIO,
    })
    expect(s.cashedOutChips).toBe(200)
    expect(s.chipsOnTable).toBe(800)
  })

  it('warns when more chips have been paid out than were bought', () => {
    const s = tableState({
      potChips: 1000,
      potCents: 100000,
      cashouts: [rec('a', 600), rec('b', 500)],
      chipsPerDollar: RATIO,
    })
    expect(s.cashedOutChips).toBe(1100)
    expect(s.chipsOnTable).toBe(-100)
    expect(s.overdrawn).toBe(true)
  })

  it('does not warn when the table is exactly emptied', () => {
    const s = tableState({
      potChips: 1000,
      potCents: 100000,
      cashouts: [rec('a', 1000)],
      chipsPerDollar: RATIO,
    })
    expect(s.chipsOnTable).toBe(0)
    expect(s.overdrawn).toBe(false)
  })

  it('is a no-op before anyone leaves', () => {
    const s = tableState({
      potChips: 1000,
      potCents: 100000,
      cashouts: [],
      chipsPerDollar: RATIO,
    })
    expect(s.chipsOnTable).toBe(1000)
    expect(s.centsOnTable).toBe(100000)
    expect(s.overdrawn).toBe(false)
  })
})

describe('a zero-chip cash out', () => {
  it('counts as entered — they busted, they did not go uncounted', () => {
    expect(isEntered(0)).toBe(true)
    expect(isEntered(null)).toBe(false)
    expect(isEntered(undefined)).toBe(false)
  })

  it('takes them off the table and out of the still-to-count list', () => {
    const cashouts = [rec('busted', 0)]
    expect(hasLeftTable('busted', cashouts)).toBe(true)
    expect(prefilledChips(cashouts)).toEqual({ busted: '0' })

    const prefilled = prefilledChips(cashouts)
    const players = [{ memberId: 'busted' }, { memberId: 'still-here' }]
    const left = stillToCount(players, (p) =>
      prefilled[p.memberId] === undefined ? null : Number(prefilled[p.memberId])
    )
    expect(left.map((p) => p.memberId)).toEqual(['still-here'])
  })

  it('still empties their seat', () => {
    const s = tableState({
      potChips: 1000,
      potCents: 100000,
      cashouts: [rec('busted', 0)],
      chipsPerDollar: RATIO,
    })
    expect(s.chipsOnTable).toBe(1000)
    expect(s.overdrawn).toBe(false)
  })
})

describe('cash out then end the game', () => {
  const cashouts = [rec('left-early', 450)]

  it('arrives at the counting screen already entered', () => {
    const prefilled = prefilledChips(cashouts)
    expect(prefilled['left-early']).toBe('450')
    expect(isEntered(Number(prefilled['left-early']))).toBe(true)
  })

  it('carries the time it was recorded', () => {
    expect(cashoutFor('left-early', cashouts)?.recordedAt).toBe(at)
    expect(cashoutFor('nobody', cashouts)).toBeNull()
  })

  it('counts three at the table as three, not five', () => {
    const players = [
      { memberId: 'left-early' },
      { memberId: 'also-left' },
      { memberId: 'a' },
      { memberId: 'b' },
      { memberId: 'c' },
    ]
    const prefilled = prefilledChips([rec('left-early', 450), rec('also-left', 120)])
    const left = stillToCount(players, (p) =>
      prefilled[p.memberId] === undefined ? null : Number(prefilled[p.memberId])
    )
    expect(left).toHaveLength(3)
  })
})

describe('undo', () => {
  it('restores the ability to buy in', () => {
    const before = [rec('stayed', 200)]
    expect(hasLeftTable('stayed', before)).toBe(true)

    const after = before.filter((c) => c.memberId !== 'stayed')
    expect(hasLeftTable('stayed', after)).toBe(false)
    expect(cashoutFor('stayed', after)).toBeNull()
  })

  it('puts their chips back on the table', () => {
    const pot = { potChips: 1000, potCents: 100000, chipsPerDollar: RATIO }
    expect(tableState({ ...pot, cashouts: [rec('stayed', 200)] }).chipsOnTable)
      .toBe(800)
    expect(tableState({ ...pot, cashouts: [] }).chipsOnTable).toBe(1000)
  })

  it('leaves other players cashed out', () => {
    const after = [rec('gone', 300)]
    expect(hasLeftTable('gone', after)).toBe(true)
    expect(hasLeftTable('stayed', after)).toBe(false)
  })
})
