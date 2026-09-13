// Seats, said honestly. A game the admin has deliberately overfilled reads
// "9/8 · 1 over", never clamped to 8/8 and never hidden — the limit is a
// default, not a wall, and the number on screen is the number of chairs.

export type SeatState = 'open' | 'full' | 'over'

export function seatState(confirmed: number, limit: number): SeatState {
  if (confirmed > limit) return 'over'
  if (confirmed === limit) return 'full'
  return 'open'
}

/** "3 free", "table full", "1 over". */
export function seatNote(confirmed: number, limit: number): string {
  switch (seatState(confirmed, limit)) {
    case 'over':
      return `${confirmed - limit} over`
    case 'full':
      return 'table full'
    case 'open':
      return `${limit - confirmed} free`
  }
}

/** "9/8" — the real count against the nominal limit. */
export function seatLabel(confirmed: number, limit: number): string {
  return `${confirmed}/${limit}`
}

/**
 * What the admin is asked before seating someone over the limit. Says the
 * numbers, because "go over the limit?" without them is a question nobody
 * can answer.
 */
export function overfillPrompt(
  name: string,
  confirmed: number,
  limit: number
): string {
  return `This game is full (${confirmed}/${limit}). Adding ${name} will make it ${
    confirmed + 1
  } players. Continue?`
}

/**
 * The sequence the test pins: fill to the limit, promote one more as admin
 * with the overfill flag, and the count goes past the limit rather than
 * being refused or clamped. Self-signup at the limit still queues.
 */
export function applyPromotion({
  confirmed,
  limit,
  asAdmin,
  allowOverfill,
}: {
  confirmed: number
  limit: number
  asAdmin: boolean
  allowOverfill: boolean
}): { confirmed: number; status: 'confirmed' | 'waitlist' | 'refused' } {
  if (confirmed < limit) return { confirmed: confirmed + 1, status: 'confirmed' }
  if (asAdmin && allowOverfill) {
    return { confirmed: confirmed + 1, status: 'confirmed' }
  }
  return asAdmin
    ? { confirmed, status: 'refused' }
    : { confirmed, status: 'waitlist' }
}
