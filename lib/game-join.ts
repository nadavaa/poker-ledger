// What a shared game link does when somebody opens it.
//
// The write happens in join_game_by_link(); this is the same decision table
// written down where it can be tested, and it is what decides which screen
// they land on and what it says. Keep the two in step — the function is the
// enforcement, this is the explanation.

export type GameStatus =
  | 'scheduled'
  | 'active'
  | 'reconciling'
  | 'settled'
  | 'cancelled'

export type JoinOutcome =
  /** Already in this game. Straight through, no message. */
  | 'already'
  /** Scheduled game with room: seated. */
  | 'confirmed'
  /** Scheduled game that's full: on the list, in order. */
  | 'waitlisted'
  /** Game is running: in the queue for the admin to seat. */
  | 'needs_approval'
  /** Settled, cancelled, or being counted: in the group, not in the game. */
  | 'over'

export type JoinResult = {
  groupId: string
  groupName: string
  gameName: string | null
  scheduledAt: string
  gameStatus: GameStatus
  outcome: JoinOutcome
  /** 1-based place in the queue, for the two outcomes that have one. */
  waitlistPosition: number | null
}

/**
 * The branch, from the facts. A link can never seat somebody over the limit
 * and can never seat anybody at all into a game with money on the table.
 */
export function planJoin({
  gameStatus,
  alreadySignedUp,
  seatsTaken,
  seatLimit,
}: {
  gameStatus: GameStatus
  alreadySignedUp: boolean
  seatsTaken: number
  seatLimit: number
}): JoinOutcome {
  if (alreadySignedUp) return 'already'
  if (gameStatus === 'scheduled') {
    return seatsTaken < seatLimit ? 'confirmed' : 'waitlisted'
  }
  if (gameStatus === 'active') return 'needs_approval'
  return 'over'
}

/** Where they end up. Never the home page — that's the case that breaks. */
export function joinDestination(r: {
  gameId: string
  groupId: string
  outcome: JoinOutcome
}): string {
  if (r.outcome === 'over') {
    return `/groups/${r.groupId}?finished=1`
  }
  if (r.outcome === 'already') {
    return `/games/${r.gameId}`
  }
  return `/games/${r.gameId}?joined=${r.outcome}`
}

export type JoinNotice = {
  tone: 'good' | 'waiting'
  title: string
  detail: string
}

/**
 * What the landing screen says. Always names the group and the date, so
 * somebody who followed a link from a chat knows what they just joined.
 */
export function joinNotice(
  outcome: JoinOutcome,
  {
    groupName,
    when,
    position,
  }: { groupName: string; when: string; position?: number | null }
): JoinNotice | null {
  switch (outcome) {
    case 'confirmed':
      return {
        tone: 'good',
        title: `You're in — ${groupName}, ${when}`,
        detail: 'You have a seat. Withdraw any time before it starts.',
      }
    case 'waitlisted':
      return {
        tone: 'waiting',
        title: `Waitlist${position ? ` · #${position}` : ''} — ${groupName}, ${when}`,
        detail:
          'The game is full. You take the first seat that comes free, in order.',
      }
    case 'needs_approval':
      return {
        tone: 'waiting',
        title: `Asked to join — ${groupName}, ${when}`,
        detail:
          'This game is already running, so the admin has to seat you. ' +
          "You're in the group either way.",
      }
    case 'over':
    case 'already':
      return null
  }
}
