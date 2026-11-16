import { describe, expect, it } from 'vitest'
import { settle, settleByMethod, type Net, type Transfer } from './settle'

/** Apply the transfers to the starting nets; everyone should land on zero. */
function applyTransfers(nets: Net[], transfers: Transfer[]) {
  const balances = new Map(nets.map((n) => [n.memberId, n.netCents]))
  for (const t of transfers) {
    balances.set(t.fromMemberId, (balances.get(t.fromMemberId) ?? 0) + t.amountCents)
    balances.set(t.toMemberId, (balances.get(t.toMemberId) ?? 0) - t.amountCents)
  }
  return balances
}

function assertValid(nets: Net[]) {
  const transfers = settle(nets)

  expect(transfers.reduce((s, t) => s + t.amountCents, 0)).toBe(
    nets.filter((n) => n.netCents > 0).reduce((s, n) => s + n.netCents, 0)
  )

  for (const balance of applyTransfers(nets, transfers).values()) {
    expect(balance).toBe(0)
  }

  const movers = nets.filter((n) => n.netCents !== 0).length
  expect(transfers.length).toBeLessThanOrEqual(Math.max(movers - 1, 0))

  for (const t of transfers) {
    expect(t.fromMemberId).not.toBe(t.toMemberId)
    expect(t.amountCents).toBeGreaterThan(0)
  }

  return transfers
}

/** Deterministic PRNG so a failure is reproducible from the seed. */
function mulberry32(seed: number) {
  return function () {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function randomZeroSumNets(rand: () => number, n: number): Net[] {
  const nets: Net[] = []
  let running = 0
  for (let i = 0; i < n - 1; i++) {
    // Realistic range: a few hundred dollars either way, in whole cents.
    const cents = Math.floor(rand() * 60001) - 30000
    running += cents
    nets.push({ memberId: `p${i}`, netCents: cents })
  }
  nets.push({ memberId: `p${n - 1}`, netCents: -running })
  return nets
}

describe('settle', () => {
  it('rejects nets that do not sum to zero', () => {
    expect(() =>
      settle([
        { memberId: 'a', netCents: 100 },
        { memberId: 'b', netCents: -99 },
      ])
    ).toThrow(/sum to zero/)
  })

  it('handles everyone breaking even', () => {
    const nets = Array.from({ length: 9 }, (_, i) => ({
      memberId: `p${i}`,
      netCents: 0,
    }))
    expect(assertValid(nets)).toHaveLength(0)
  })

  it('handles two players', () => {
    const transfers = assertValid([
      { memberId: 'a', netCents: -5000 },
      { memberId: 'b', netCents: 5000 },
    ])
    expect(transfers).toEqual([
      { fromMemberId: 'a', toMemberId: 'b', amountCents: 5000 },
    ])
  })

  it('handles one big winner and eight losers', () => {
    const nets: Net[] = [{ memberId: 'winner', netCents: 8 * 5000 }]
    for (let i = 0; i < 8; i++) {
      nets.push({ memberId: `loser${i}`, netCents: -5000 })
    }
    expect(assertValid(nets)).toHaveLength(8)
  })

  it('handles one big loser and eight winners', () => {
    const nets: Net[] = [{ memberId: 'loser', netCents: -8 * 5000 }]
    for (let i = 0; i < 8; i++) {
      nets.push({ memberId: `winner${i}`, netCents: 5000 })
    }
    expect(assertValid(nets)).toHaveLength(8)
  })

  it('handles exact offsetting pairs in one transfer each', () => {
    const nets: Net[] = [
      { memberId: 'a', netCents: 2500 },
      { memberId: 'b', netCents: -2500 },
      { memberId: 'c', netCents: 7500 },
      { memberId: 'd', netCents: -7500 },
    ]
    expect(assertValid(nets)).toHaveLength(2)
  })

  it('ignores players who broke even', () => {
    const transfers = assertValid([
      { memberId: 'a', netCents: -1000 },
      { memberId: 'flat', netCents: 0 },
      { memberId: 'b', netCents: 1000 },
    ])
    expect(transfers.map((t) => t.fromMemberId)).not.toContain('flat')
    expect(transfers.map((t) => t.toMemberId)).not.toContain('flat')
  })

  it('holds for 1000 random valid net arrays', () => {
    const rand = mulberry32(20260828)
    for (let run = 0; run < 1000; run++) {
      const n = 2 + Math.floor(rand() * 11) // 2..12 players
      assertValid(randomZeroSumNets(rand, n))
    }
  })

  it('throws on random non-zero-sum input', () => {
    const rand = mulberry32(7)
    for (let run = 0; run < 100; run++) {
      const nets = randomZeroSumNets(rand, 2 + Math.floor(rand() * 8))
      const skew = 1 + Math.floor(rand() * 5000)
      nets[0] = { ...nets[0], netCents: nets[0].netCents + skew }
      expect(() => settle(nets)).toThrow(/sum to zero/)
    }
  })
})

describe('settleByMethod', () => {
  function assertValidByMethod(nets: Net[], cashIds: Set<string>) {
    const transfers = settleByMethod(nets, cashIds)
    for (const balance of applyTransfers(nets, transfers).values()) {
      expect(balance).toBe(0)
    }
    const movers = nets.filter((n) => n.netCents !== 0).length
    expect(transfers.length).toBeLessThanOrEqual(Math.max(movers - 1, 0))
    for (const t of transfers) {
      expect(t.fromMemberId).not.toBe(t.toMemberId)
      expect(t.amountCents).toBeGreaterThan(0)
      const bothApp = !cashIds.has(t.fromMemberId) && !cashIds.has(t.toMemberId)
      expect(t.method).toBe(bothApp ? 'app' : 'cash')
    }
    const crossings = transfers.filter(
      (t) => cashIds.has(t.fromMemberId) !== cashIds.has(t.toMemberId)
    )
    expect(crossings.length).toBeLessThanOrEqual(1)
    return transfers
  }

  it('rejects nets that do not sum to zero', () => {
    expect(() =>
      settleByMethod([{ memberId: 'a', netCents: 1 }], new Set())
    ).toThrow()
  })

  it('matches settle() when everyone pays by app', () => {
    const nets: Net[] = [
      { memberId: 'a', netCents: -5000 },
      { memberId: 'b', netCents: 3000 },
      { memberId: 'c', netCents: 2000 },
    ]
    const t = assertValidByMethod(nets, new Set())
    expect(t.every((x) => x.method === 'app')).toBe(true)
    expect(
      t.map((x) => ({
        fromMemberId: x.fromMemberId,
        toMemberId: x.toMemberId,
        amountCents: x.amountCents,
      }))
    ).toEqual(settle(nets))
  })

  it('is all cash when everyone pays cash', () => {
    const nets: Net[] = [
      { memberId: 'a', netCents: -5000 },
      { memberId: 'b', netCents: 3000 },
      { memberId: 'c', netCents: 2000 },
    ]
    const t = assertValidByMethod(nets, new Set(['a', 'b', 'c']))
    expect(t.every((x) => x.method === 'cash')).toBe(true)
  })

  it('keeps balanced sides apart with no crossing', () => {
    const nets: Net[] = [
      { memberId: 'c1', netCents: -2000 },
      { memberId: 'c2', netCents: 2000 },
      { memberId: 'a1', netCents: -3000 },
      { memberId: 'a2', netCents: 3000 },
    ]
    const t = assertValidByMethod(nets, new Set(['c1', 'c2']))
    expect(t).toEqual([
      { fromMemberId: 'c1', toMemberId: 'c2', amountCents: 2000, method: 'cash' },
      { fromMemberId: 'a1', toMemberId: 'a2', amountCents: 3000, method: 'app' },
    ])
  })

  it('crosses once when the cash side is owed', () => {
    const nets: Net[] = [
      { memberId: 'c1', netCents: 4000 },
      { memberId: 'c2', netCents: -1000 },
      { memberId: 'a1', netCents: -2500 },
      { memberId: 'a2', netCents: -500 },
    ]
    const t = assertValidByMethod(nets, new Set(['c1', 'c2']))
    expect(t[0]).toEqual({
      fromMemberId: 'a1',
      toMemberId: 'c1',
      amountCents: 3000,
      method: 'cash',
    })
  })

  it('handles a lone cash player', () => {
    const nets: Net[] = [
      { memberId: 'c', netCents: -6000 },
      { memberId: 'a1', netCents: 4000 },
      { memberId: 'a2', netCents: 2000 },
    ]
    assertValidByMethod(nets, new Set(['c']))
  })

  it('handles everyone breaking even', () => {
    expect(
      settleByMethod(
        [
          { memberId: 'a', netCents: 0 },
          { memberId: 'b', netCents: 0 },
        ],
        new Set(['a'])
      )
    ).toEqual([])
  })

  it('holds for 1000 random nets with random cash players', () => {
    const rand = mulberry32(20261116)
    for (let i = 0; i < 1000; i++) {
      const n = 2 + Math.floor(rand() * 9)
      const nets = randomZeroSumNets(rand, n)
      const cashIds = new Set(
        nets.filter(() => rand() < 0.4).map((x) => x.memberId)
      )
      assertValidByMethod(nets, cashIds)
    }
  })
})
