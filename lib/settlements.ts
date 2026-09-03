// Which side of a transfer you are on, and therefore what you can do about
// it. Pure: this is the decision that used to live inline in the settled
// view, where it was easy to get wrong.

export type SettlementParties = {
  fromMemberId: string
  toMemberId: string
}

/** Roles are per transfer, not per game: the game admin is a bystander on
 *  transfers between two other people. */
export type SettlementRole = 'payer' | 'payee' | 'bystander'

export function settlementRole(
  transfer: SettlementParties,
  myMemberId: string | null
): SettlementRole {
  if (!myMemberId) return 'bystander'
  if (transfer.fromMemberId === myMemberId) return 'payer'
  if (transfer.toMemberId === myMemberId) return 'payee'
  return 'bystander'
}

/** Only the payer gets a Venmo link. Settlement is one-directional. */
export function canPay(role: SettlementRole): boolean {
  return role === 'payer'
}

/** The payee closes it out, whether or not the payer marked it paid. */
export function canConfirm(role: SettlementRole, status: string): boolean {
  return role === 'payee' && status !== 'confirmed'
}

export type SettlementProgress = { total: number; confirmed: number }

/**
 * One payment between two people is one item, so poker and food between the
 * same pair count once — the pair is the unit, not the row.
 *
 * Scope is the viewer's, never the game's: a player is told about their own
 * transfers and nothing else. The admin gets all of them, because chasing
 * payments is the job.
 */
export function settlementProgress(
  transfers: (SettlementParties & { status: string })[],
  myMemberId: string | null,
  isAdmin: boolean
): SettlementProgress {
  const mine = isAdmin
    ? transfers
    : transfers.filter(
        (t) => t.fromMemberId === myMemberId || t.toMemberId === myMemberId
      )

  // Direction doesn't split a pair: A→B and B→A are the same two people.
  const pairs = new Map<string, boolean>()
  for (const t of mine) {
    const key = [t.fromMemberId, t.toMemberId].sort().join('|')
    const done = t.status === 'confirmed'
    // Paid-but-not-confirmed isn't done, and one unconfirmed row keeps the
    // whole pair open.
    pairs.set(key, (pairs.get(key) ?? true) && done)
  }

  let confirmed = 0
  for (const done of pairs.values()) if (done) confirmed++
  return { total: pairs.size, confirmed }
}
