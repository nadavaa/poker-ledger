import { describe, expect, it } from 'vitest'
import {
  allCounted,
  canSettle,
  differenceChips,
  demoNets,
  demoTransfers,
  potCents,
  seedBuyIns,
  seedCounts,
} from './landing-demo'

describe('landing demo game', () => {
  it('opens with a $200 pot and counts that are $3 short', () => {
    const buyIns = seedBuyIns()
    expect(potCents(buyIns)).toBe(20000)
    expect(differenceChips(buyIns, seedCounts())).toBe(300)
    expect(canSettle(buyIns, seedCounts())).toBe(false)
    expect(demoTransfers(buyIns, seedCounts())).toBeNull()
  })

  it('treats an empty count as not counted, not as zero', () => {
    const counts = { ...seedCounts(), marcus: null }
    expect(allCounted(counts)).toBe(false)
    expect(canSettle(seedBuyIns(), counts)).toBe(false)
  })

  it('settles to zero once the difference is assigned to one player', () => {
    const buyIns = seedBuyIns()
    const counts = { ...seedCounts(), sam: 4300 }
    expect(canSettle(buyIns, counts)).toBe(true)

    const nets = demoNets(buyIns, counts)
    expect(nets.reduce((s, n) => s + n.netCents, 0)).toBe(0)

    const transfers = demoTransfers(buyIns, counts)!
    expect(transfers.length).toBeLessThanOrEqual(5)
    const after = new Map(nets.map((n) => [n.memberId, n.netCents]))
    for (const t of transfers) {
      after.set(t.fromMemberId, after.get(t.fromMemberId)! + t.amountCents)
      after.set(t.toMemberId, after.get(t.toMemberId)! - t.amountCents)
    }
    expect([...after.values()].every((v) => v === 0)).toBe(true)
  })
})
