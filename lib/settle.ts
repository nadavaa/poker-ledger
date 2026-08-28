// Minimum-transfer settlement solver.
//
// Pure by design: no imports from Supabase, Next, or React, so it can be
// tested with no I/O. Input is a set of nets in integer cents; output is the
// list of payments that zeroes everyone out.
//
// Greedy largest-debtor-to-largest-creditor, not optimal. Finding the true
// minimum number of transfers means partitioning players into zero-sum
// subsets, which is subset-sum and NP-hard. Greedy guarantees at most n-1
// transfers — the same bound Splitwise uses — and at nine players the gap to
// optimal is at most a transfer or two.

export type Net = { memberId: string; netCents: number }
export type Transfer = {
  fromMemberId: string
  toMemberId: string
  amountCents: number
}

export function settle(nets: Net[]): Transfer[] {
  const total = nets.reduce((s, n) => s + n.netCents, 0)
  if (total !== 0) throw new Error(`Nets must sum to zero, got ${total}`)

  const debtors = nets
    .filter((n) => n.netCents < 0)
    .map((n) => ({ ...n, amt: -n.netCents }))
    .sort((a, b) => b.amt - a.amt)
  const creditors = nets
    .filter((n) => n.netCents > 0)
    .map((n) => ({ ...n, amt: n.netCents }))
    .sort((a, b) => b.amt - a.amt)

  const transfers: Transfer[] = []
  let i = 0
  let j = 0

  while (i < debtors.length && j < creditors.length) {
    const amount = Math.min(debtors[i].amt, creditors[j].amt)
    if (amount > 0) {
      transfers.push({
        fromMemberId: debtors[i].memberId,
        toMemberId: creditors[j].memberId,
        amountCents: amount,
      })
    }
    debtors[i].amt -= amount
    creditors[j].amt -= amount
    if (debtors[i].amt === 0) i++
    if (creditors[j].amt === 0) j++
  }

  return transfers
}
