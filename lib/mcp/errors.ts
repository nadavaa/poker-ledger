// What the database said, in a sentence an agent can pass on. The database is
// the authority: these only translate its refusals, they never decide.

type Failure = { message?: string | null; code?: string | null } | null | undefined

const KNOWN: [RegExp, string][] = [
  [/only the payer can mark this paid/i, 'Only the person who owes this transfer can mark it paid.'],
  [/only a pending payment can be marked paid/i, 'That transfer is not waiting to be paid any more.'],
  [/already confirmed/i, 'That transfer is already confirmed.'],
  [/only the person being paid/i, 'Only the person being paid can confirm they received it.'],
  [/game is not open for signups/i, 'That game is not open for signups: it is being counted or has finished.'],
  [/no seats available/i, 'There is no free seat in that game.'],
  [/member is not in this group/i, 'You are not a member of that game\'s group.'],
  [/not authenticated/i, 'Not signed in. Reconnect the Poker Ledger connector.'],
  [/10-digit US phone|not a valid US phone/i, 'That is not a valid US phone number. Use 10 digits, like (555) 123-4567.'],
]

export function friendlyDbError(
  error: Failure,
  fallback = 'Poker Ledger could not do that. Nothing was changed.'
): string {
  const message = error?.message ?? ''
  for (const [pattern, text] of KNOWN) {
    if (pattern.test(message)) return text
  }
  // A row-level-security refusal on a withdrawal: the policy that stops you
  // walking out on money already in the pot.
  if (error?.code === '42501' || /row-level security/i.test(message)) {
    return 'The database did not allow that. Nothing was changed.'
  }
  return fallback
}

/**
 * RLS does not raise on an UPDATE it filters out: it reports success with
 * zero rows. So a write that touched nothing is a refusal, whatever the
 * database said.
 */
export const NOTHING_CHANGED =
  'The database did not allow that, or it already changed. Nothing was changed.'
