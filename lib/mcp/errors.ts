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
  [/10-digit US phone|not a valid US phone/i, 'That is not a valid US phone number. Use 10 digits, like (212) 555-0123.'],
]

/**
 * Refusals the database words well enough to pass on as they are: they say
 * what is wrong and what to do, with no table or policy names in them.
 */
const PASS_THROUGH = [
  /^\d+ players are confirmed\. Move someone to the waitlist first\.?$/i,
  /^the game has started — only the name and location can change now\.?$/i,
  /^this game is finished; nothing can be edited\.?$/i,
  /^a game needs at least one seat\.?$/i,
  /^seat limit must be at least 2\.?$/i,
  /^this game has \d+ unpaid settlement\(s\); resolve them first\.?$/i,
  /^a settled game cannot be cancelled; it holds results other players depend on\.?$/i,
  /^only the game admin or the group owner can cancel a game\.?$/i,
  /^only the game admin can (add players|change the roster)\.?$/i,
  /^this game is closed\.?$/i,
  /^pick an active member of this group\.?$/i,
  /^that player is already in this game\.?$/i,
  /^that player is not on the waitlist\.?$/i,
  /^game is full: \d+ of \d+ seats taken$/i,
]

export function friendlyDbError(
  error: Failure,
  fallback = 'Poker Ledger could not do that. Nothing was changed.'
): string {
  const message = error?.message ?? ''
  if (PASS_THROUGH.some((re) => re.test(message.trim()))) return message.trim()
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
