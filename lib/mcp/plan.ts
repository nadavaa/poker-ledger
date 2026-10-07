// What a write tool is about to do, and how to say it, decided from facts.
//
// Pure: the tool reads the rows, this decides between "refuse", "nothing to
// do" and "needs a yes", and writes the sentence the user is asked to approve.
// It decides the same things the database will — the database stays the
// authority, and the commit goes through it regardless — so that the answer
// comes before the write, in words.

import { planJoin, type GameStatus } from '../game-join'
import { formatCents } from '../money'
import { seatLabel } from '../seats'
import { formatTime } from '../time'
import { myStanding, type SignupRow } from './map'

export type GameFacts = {
  name: string | null
  groupName: string
  timezone: string
  status: GameStatus
  scheduledAt: string
  startedAt: string | null
  seatLimit: number
}

export function label(g: GameFacts): string {
  const when = formatTime(g.startedAt ?? g.scheduledAt, g.timezone, 'when')
  return `${g.name ? `${g.name}, ` : ''}${when} — ${g.groupName}`
}

const ordinal = (n: number) => `#${n}`

// ------------------------------------------------------------------ join

export type JoinPlan =
  | { kind: 'already'; status: 'seated' | 'waitlisted'; position: number | null; text: string }
  | { kind: 'refuse'; reason: string }
  | {
      kind: 'confirm'
      outcome: 'confirmed' | 'waitlisted' | 'needs_approval'
      position: number | null
      text: string
    }

export function planJoinAction(args: {
  game: GameFacts
  signups: SignupRow[]
  /** Confirmed players who cashed out and left. Their seats are free. */
  leftTable: number
  myMemberId: string | null
}): JoinPlan {
  const { game, signups, leftTable, myMemberId } = args
  const mine = myStanding(signups, myMemberId)

  if (mine.i_am === 'seated') {
    return {
      kind: 'already',
      status: 'seated',
      position: null,
      text: `You already have a seat in ${label(game)}.`,
    }
  }
  if (mine.i_am === 'waitlisted') {
    return {
      kind: 'already',
      status: 'waitlisted',
      position: mine.waitlist_position,
      text: `You are already on the waitlist (${ordinal(mine.waitlist_position!)}) for ${label(game)}.`,
    }
  }

  const confirmed = signups.filter((s) => s.status === 'confirmed').length
  const taken = Math.max(0, confirmed - leftTable)
  const waiting = signups.filter((s) => s.status === 'waitlist').length

  const outcome = planJoin({
    gameStatus: game.status,
    alreadySignedUp: false,
    seatsTaken: taken,
    seatLimit: game.seatLimit,
  })

  switch (outcome) {
    case 'confirmed':
      return {
        kind: 'confirm',
        outcome,
        position: null,
        text:
          `Sign up for ${label(game)}? There is room, so you would get a seat ` +
          `(${seatLabel(taken + 1, game.seatLimit)}).`,
      }
    case 'waitlisted':
      return {
        kind: 'confirm',
        outcome,
        position: waiting + 1,
        text:
          `Sign up for ${label(game)}? The game is full ` +
          `(${seatLabel(taken, game.seatLimit)}), so you would join the waitlist at ` +
          `${ordinal(waiting + 1)} and take the first seat that frees up.`,
      }
    case 'needs_approval':
      return {
        kind: 'confirm',
        outcome,
        position: waiting + 1,
        text:
          `Ask to join ${label(game)}? The game is already running, so you would ` +
          `be added to the queue (${ordinal(waiting + 1)}) and the game admin has to seat you.`,
      }
    default:
      return {
        kind: 'refuse',
        reason:
          game.status === 'settled'
            ? 'That game is already settled, so it is closed to new players.'
            : game.status === 'cancelled'
              ? 'That game was cancelled.'
              : 'That game is being counted, so it is closed to new players.',
      }
  }
}

// -------------------------------------------------------------- withdraw

export type WithdrawPlan =
  | { kind: 'already'; text: string }
  | { kind: 'refuse'; reason: string }
  | { kind: 'confirm'; text: string }

export function planWithdrawAction(args: {
  game: GameFacts
  signups: SignupRow[]
  myMemberId: string | null
  /** The database's own answer, from can_withdraw_from_game(). */
  databaseAllows: boolean
}): WithdrawPlan {
  const { game, signups, myMemberId, databaseAllows } = args
  const mine = myStanding(signups, myMemberId)

  if (mine.i_am === 'not_signed_up') {
    return {
      kind: 'already',
      text: `You are not signed up for ${label(game)}, so there is nothing to withdraw from.`,
    }
  }
  if (game.status !== 'scheduled' && game.status !== 'active') {
    return {
      kind: 'refuse',
      reason:
        'That game is being counted or has finished, so the roster is fixed. Ask the game admin if something is wrong.',
    }
  }
  if (!databaseAllows) {
    return {
      kind: 'refuse',
      reason:
        'You cannot withdraw once your buy-in is in the pot. Ask the game admin to remove you.',
    }
  }
  if (mine.i_am === 'waitlisted') {
    return {
      kind: 'confirm',
      text: `Leave the waitlist (${ordinal(mine.waitlist_position!)}) for ${label(game)}? Signing up again puts you at the back.`,
    }
  }
  return {
    kind: 'confirm',
    text:
      `Withdraw from ${label(game)} and give up your seat? The next person on the ` +
      `waitlist moves up. Signing up again puts you at the back of the line.`,
  }
}

// ------------------------------------------------------------- transfers

export type TransferFacts = {
  kind: 'poker' | 'food'
  amountCents: number
  status: 'pending' | 'paid' | 'confirmed' | 'deferred'
  /** The other person's name. */
  counterparty: string
  /** "Thu Oct 2": the night of the game. */
  gameDay: string
  role: 'payer' | 'payee' | 'bystander'
}

export type TransferPlan =
  | { kind: 'already'; text: string }
  | { kind: 'refuse'; reason: string }
  | { kind: 'confirm'; text: string }

const what = (t: TransferFacts) =>
  `${formatCents(t.amountCents)} for ${t.kind} from ${t.gameDay}`

/** I'm the payer and I say it's paid. */
export function planMarkPaid(t: TransferFacts): TransferPlan {
  if (t.role !== 'payer') {
    return {
      kind: 'refuse',
      reason: 'Only the person who owes this transfer can mark it paid.',
    }
  }
  if (t.status === 'confirmed') {
    return { kind: 'already', text: `That transfer to ${t.counterparty} is already confirmed received.` }
  }
  if (t.status === 'paid') {
    return {
      kind: 'already',
      text: `You already marked ${what(t)} paid to ${t.counterparty}. Waiting for them to confirm.`,
    }
  }
  if (t.status !== 'pending') {
    return { kind: 'refuse', reason: 'That transfer cannot be marked paid.' }
  }
  return {
    kind: 'confirm',
    text:
      `You're marking that you paid ${t.counterparty} ${what(t)}. ` +
      `Only say yes if the money has actually been sent. Confirm?`,
  }
}

/**
 * I'm the payee and I say it arrived. Like the app, this does not insist the
 * payer clicked first: money can arrive without anyone telling the app.
 */
export function planConfirmReceived(t: TransferFacts): TransferPlan {
  if (t.role !== 'payee') {
    return {
      kind: 'refuse',
      reason: 'Only the person being paid can confirm they received it.',
    }
  }
  if (t.status === 'confirmed') {
    return { kind: 'already', text: `That transfer from ${t.counterparty} is already confirmed.` }
  }
  if (t.status !== 'pending' && t.status !== 'paid') {
    return { kind: 'refuse', reason: 'That transfer cannot be confirmed.' }
  }
  const claim =
    t.status === 'paid'
      ? `${t.counterparty} marked it paid.`
      : `${t.counterparty} has not marked it paid in the app.`
  return {
    kind: 'confirm',
    // Not what(t): that ends "...from <day>", and this sentence already has a
    // "from <person>".
    text:
      `You're confirming that you received ${formatCents(t.amountCents)} from ` +
      `${t.counterparty} for ${t.kind} (the game on ${t.gameDay}). ` +
      `${claim} This closes the debt and cannot be undone. Only say yes if the money ` +
      `has actually arrived. Confirm?`,
  }
}
