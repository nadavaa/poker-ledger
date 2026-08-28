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
