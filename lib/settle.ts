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

// ---------------------------------------------------------------------------
// Settling a game where some players pay in cash and some by app.
//
// Cash players settle among themselves and app players settle among
// themselves. Whatever one side owes the other as a whole crosses over in a
// single transfer, from the app side's biggest debtor to the cash side's
// biggest creditor (or the reverse). A transfer is by app only when both
// people pay by app, so the crossing one is cash.
//
// The n-1 bound still holds: (cash movers - 1) + (app movers - 1) + 1.

export type Method = 'app' | 'cash'
export type MethodTransfer = Transfer & { method: Method }

export function settleByMethod(
  nets: Net[],
  cashIds: ReadonlySet<string>
): MethodTransfer[] {
  const total = nets.reduce((s, n) => s + n.netCents, 0)
  if (total !== 0) throw new Error(`Nets must sum to zero, got ${total}`)

  const cash = nets.filter((n) => cashIds.has(n.memberId)).map((n) => ({ ...n }))
  const app = nets.filter((n) => !cashIds.has(n.memberId)).map((n) => ({ ...n }))

  const out: MethodTransfer[] = []
  // What the cash side is owed, in total, by the app side.
  const cross = cash.reduce((s, n) => s + n.netCents, 0)

  if (cross !== 0) {
    const [payers, payees] = cross > 0 ? [app, cash] : [cash, app]
    const amount = Math.abs(cross)
    const payer = payers.reduce((a, b) => (b.netCents < a.netCents ? b : a))
    const payee = payees.reduce((a, b) => (b.netCents > a.netCents ? b : a))
    out.push({
      fromMemberId: payer.memberId,
      toMemberId: payee.memberId,
      amountCents: amount,
      method: 'cash',
    })
    payer.netCents += amount
    payee.netCents -= amount
  }

  for (const t of settle(cash)) out.push({ ...t, method: 'cash' })
  for (const t of settle(app)) out.push({ ...t, method: 'app' })
  return out
}

// ---------------------------------------------------------------------------
// Re-settling a game after some payments already happened.
//
// A game can be unsettled to fix a buy-in or a chip count. Payments the payee
// already confirmed are real money that moved, so they are never erased:
// they are applied to the corrected nets first, and the solver only covers
// what is still owed. A confirmed payment that now overshoots simply leaves
// the receiver owing some of it back.

export function remainingNets(nets: Net[], alreadyPaid: Transfer[]): Net[] {
  const remaining = new Map(nets.map((n) => [n.memberId, n.netCents]))
  for (const t of alreadyPaid) {
    if (!remaining.has(t.fromMemberId) || !remaining.has(t.toMemberId)) {
      throw new Error(
        'A confirmed payment involves somebody who is no longer in this game'
      )
    }
    // Paying moves the payer toward zero from below and the receiver from above.
    remaining.set(t.fromMemberId, remaining.get(t.fromMemberId)! + t.amountCents)
    remaining.set(t.toMemberId, remaining.get(t.toMemberId)! - t.amountCents)
  }
  return nets.map((n) => ({ memberId: n.memberId, netCents: remaining.get(n.memberId)! }))
}
