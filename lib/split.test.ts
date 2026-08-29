import { describe, expect, it } from 'vitest'
import { previewSplit, splitOrder, type Participant } from './split'

/** Participants in signup order, optionally with a fixed amount. */
function people(...fixed: (number | null)[]): Participant[] {
  return fixed.map((f, i) => ({
    memberId: `p${i}`,
    signupOrder: i + 1,
    fixedCents: f,
  }))
}

const sum = (shares: { shareCents: number }[]) =>
  shares.reduce((s, x) => s + x.shareCents, 0)

describe('splitOrder', () => {
  it('splits evenly when it divides', () => {
    const shares = splitOrder(10000, people(null, null, null, null))
    expect(shares.map((s) => s.shareCents)).toEqual([2500, 2500, 2500, 2500])
    expect(sum(shares)).toBe(10000)
  })

  it('gives the odd cents to the earliest signups', () => {
    // 10.00 three ways is 3.33 with a penny left over.
    const shares = splitOrder(1000, people(null, null, null))
    expect(shares.map((s) => s.shareCents)).toEqual([334, 333, 333])
    expect(sum(shares)).toBe(1000)
  })

  it('spreads two leftover cents across the first two', () => {
    const shares = splitOrder(1001, people(null, null, null))
    expect(shares.map((s) => s.shareCents)).toEqual([334, 334, 333])
    expect(sum(shares)).toBe(1001)
  })

  it('handles every share being fixed', () => {
    const shares = splitOrder(5000, people(2000, 1500, 1500))
    expect(shares.map((s) => s.shareCents)).toEqual([2000, 1500, 1500])
    expect(shares.every((s) => s.isFixed)).toBe(true)
    expect(sum(shares)).toBe(5000)
  })

  it('mixes fixed and even shares', () => {
    // 150.00 total, 50.00 fixed, 100.00 across four = 25.00 each.
    const shares = splitOrder(15000, people(5000, null, null, null, null))
    expect(shares.map((s) => s.shareCents)).toEqual([
      5000, 2500, 2500, 2500, 2500,
    ])
    expect(sum(shares)).toBe(15000)
  })

  it('treats the payer as a participant like anyone else', () => {
    // The payer ate too: four people, one of whom fronted the money.
    const shares = splitOrder(8000, people(null, null, null, null))
    expect(shares).toHaveLength(4)
    expect(shares.every((s) => s.shareCents === 2000)).toBe(true)
    expect(sum(shares)).toBe(8000)
  })

  it('gives a single participant the whole total', () => {
    const shares = splitOrder(4237, people(null))
    expect(shares[0].shareCents).toBe(4237)
    expect(sum(shares)).toBe(4237)
  })

  it('refuses fixed amounts exceeding the total', () => {
    expect(() => splitOrder(5000, people(3000, 3000))).toThrow(
      /more than the total/
    )
  })

  it('refuses an all-fixed split that misses the total', () => {
    expect(() => splitOrder(5000, people(2000, 2000))).toThrow(
      /do not add up to the total/
    )
  })

  it('refuses an empty or non-positive order', () => {
    expect(() => splitOrder(1000, [])).toThrow(/at least one person/)
    expect(() => splitOrder(0, people(null))).toThrow(/greater than zero/)
    expect(() => splitOrder(-500, people(null))).toThrow(/greater than zero/)
  })

  it('always sums to the total, across many awkward divisions', () => {
    for (let total = 1; total <= 400; total++) {
      for (let n = 1; n <= 9; n++) {
        const shares = splitOrder(total, people(...Array(n).fill(null)))
        expect(sum(shares)).toBe(total)
      }
    }
  })
})

describe('previewSplit', () => {
  it('reports the footer numbers', () => {
    const p = previewSplit(15000, people(5000, null, null, null, null))
    expect(p.assignedCents).toBe(5000)
    expect(p.remainderCents).toBe(10000)
    expect(p.evenCount).toBe(4)
    expect(p.perHeadCents).toBe(2500)
    expect(p.error).toBeNull()
  })

  it('warns rather than blocks when fixed shares use up the total', () => {
    const p = previewSplit(5000, people(5000, null, null))
    expect(p.error).toBeNull()
    expect(p.warning).toMatch(/down for nothing/)
  })

  it('surfaces errors without throwing', () => {
    expect(previewSplit(0, people(null)).error).toMatch(/greater than zero/)
    expect(previewSplit(1000, []).error).toMatch(/at least one person/)
    expect(previewSplit(1000, people(2000)).error).toMatch(/more than the total/)
  })
})
