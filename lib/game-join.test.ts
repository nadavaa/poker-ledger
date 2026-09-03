import { describe, expect, it } from 'vitest'
import {
  joinDestination,
  joinNotice,
  planJoin,
  type GameStatus,
  type JoinOutcome,
} from './game-join'

const plan = (
  gameStatus: GameStatus,
  opts: Partial<{
    alreadySignedUp: boolean
    seatsTaken: number
    seatLimit: number
  }> = {}
) =>
  planJoin({
    gameStatus,
    alreadySignedUp: false,
    seatsTaken: 0,
    seatLimit: 8,
    ...opts,
  })

describe('planJoin', () => {
  it('seats them in a scheduled game with room', () => {
    expect(plan('scheduled', { seatsTaken: 3 })).toBe('confirmed')
    expect(plan('scheduled', { seatsTaken: 7, seatLimit: 8 })).toBe('confirmed')
  })

  it('waitlists rather than seating over the limit', () => {
    expect(plan('scheduled', { seatsTaken: 8, seatLimit: 8 })).toBe('waitlisted')
    // Already over the limit because the admin overfilled it deliberately.
    expect(plan('scheduled', { seatsTaken: 9, seatLimit: 8 })).toBe('waitlisted')
  })

  it('never seats anyone into a game with money on the table', () => {
    expect(plan('active', { seatsTaken: 0, seatLimit: 8 })).toBe(
      'needs_approval'
    )
  })

  it('never signs anyone up for a game that is over', () => {
    expect(plan('settled')).toBe('over')
    expect(plan('cancelled')).toBe('over')
    // Chips are being counted; a new player would have no count.
    expect(plan('reconciling')).toBe('over')
  })

  it('sends someone already signed up straight through, whatever the state', () => {
    const states: GameStatus[] = [
      'scheduled',
      'active',
      'reconciling',
      'settled',
      'cancelled',
    ]
    for (const s of states) {
      expect(plan(s, { alreadySignedUp: true })).toBe('already')
    }
  })

  it('is the same answer every time it is asked', () => {
    // Five clicks on the same link, nothing changing underneath.
    const answers = Array.from({ length: 5 }, () =>
      plan('scheduled', { seatsTaken: 2 })
    )
    expect(new Set(answers).size).toBe(1)

    // And once they are in, every further click is the no-op branch.
    expect(plan('scheduled', { seatsTaken: 3, alreadySignedUp: true })).toBe(
      'already'
    )
  })
})

describe('joinDestination', () => {
  const ids = { gameId: 'g1', groupId: 'grp1' }

  it('lands on the game for everything that touched the game', () => {
    expect(joinDestination({ ...ids, outcome: 'confirmed' })).toBe(
      '/games/g1?joined=confirmed'
    )
    expect(joinDestination({ ...ids, outcome: 'waitlisted' })).toBe(
      '/games/g1?joined=waitlisted'
    )
    expect(joinDestination({ ...ids, outcome: 'needs_approval' })).toBe(
      '/games/g1?joined=needs_approval'
    )
  })

  it('sends an existing player to the game with nothing to say', () => {
    expect(joinDestination({ ...ids, outcome: 'already' })).toBe('/games/g1')
  })

  it('sends a finished game to the group, not the home page', () => {
    expect(joinDestination({ ...ids, outcome: 'over' })).toBe(
      '/groups/grp1?finished=1'
    )
  })

  it('never lands anyone on the home page', () => {
    const outcomes: JoinOutcome[] = [
      'already',
      'confirmed',
      'waitlisted',
      'needs_approval',
      'over',
    ]
    for (const outcome of outcomes) {
      expect(joinDestination({ ...ids, outcome })).not.toBe('/')
    }
  })
})

describe('joinNotice', () => {
  const ctx = { groupName: 'Tuesday Crew', when: 'Sat 6 Sep' }

  it('names the group and the date so they know what they joined', () => {
    for (const outcome of ['confirmed', 'waitlisted', 'needs_approval'] as const) {
      const n = joinNotice(outcome, ctx)!
      expect(n.title).toContain('Tuesday Crew')
      expect(n.title).toContain('Sat 6 Sep')
    }
  })

  it('says the waitlist position out loud rather than implying a seat', () => {
    const n = joinNotice('waitlisted', { ...ctx, position: 3 })!
    expect(n.title).toContain('#3')
    expect(n.detail).toContain('full')
    expect(n.tone).toBe('waiting')
  })

  it('says the admin has to seat them for a running game', () => {
    const n = joinNotice('needs_approval', ctx)!
    expect(n.detail).toContain('admin')
    expect(n.tone).toBe('waiting')
  })

  it('says nothing when there is nothing to say', () => {
    expect(joinNotice('already', ctx)).toBeNull()
    expect(joinNotice('over', ctx)).toBeNull()
  })
})
