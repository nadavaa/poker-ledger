import { describe, expect, it } from 'vitest'
import {
  planConfirmReceived,
  planJoinAction,
  planMarkPaid,
  planWithdrawAction,
  type GameFacts,
  type TransferFacts,
} from './plan'
import type { SignupRow } from './map'

const game = (over: Partial<GameFacts> = {}): GameFacts => ({
  name: 'Sunday Game',
  groupName: 'Tuesday',
  timezone: 'America/New_York',
  status: 'scheduled',
  scheduledAt: '2026-10-04T18:30:00Z',
  startedAt: null,
  seatLimit: 2,
  ...over,
})

const s = (member_id: string, status: SignupRow['status'], order: number): SignupRow => ({
  member_id,
  status,
  signup_order: order,
})

describe('join', () => {
  it('seats you when there is room, and says so', () => {
    const p = planJoinAction({ game: game(), signups: [s('a', 'confirmed', 1)], leftTable: 0, myMemberId: 'me' })
    expect(p).toMatchObject({ kind: 'confirm', outcome: 'confirmed', position: null })
    if (p.kind === 'confirm') expect(p.text).toMatch(/2\/2/)
  })

  it('waitlists you, with your position, when it is full', () => {
    const p = planJoinAction({
      game: game(),
      signups: [s('a', 'confirmed', 1), s('b', 'confirmed', 2), s('w', 'waitlist', 3)],
      leftTable: 0,
      myMemberId: 'me',
    })
    expect(p).toMatchObject({ kind: 'confirm', outcome: 'waitlisted', position: 2 })
  })

  it('counts a seat freed by someone who cashed out and left', () => {
    const p = planJoinAction({
      game: game({ status: 'scheduled' }),
      signups: [s('a', 'confirmed', 1), s('b', 'confirmed', 2)],
      leftTable: 1,
      myMemberId: 'me',
    })
    expect(p).toMatchObject({ outcome: 'confirmed' })
  })

  it('queues you for the admin when the game is already running', () => {
    const p = planJoinAction({ game: game({ status: 'active' }), signups: [], leftTable: 0, myMemberId: 'me' })
    expect(p).toMatchObject({ kind: 'confirm', outcome: 'needs_approval', position: 1 })
    if (p.kind === 'confirm') expect(p.text).toMatch(/admin has to seat you/)
  })

  it.each([
    ['settled', /settled/],
    ['cancelled', /cancelled/],
    ['reconciling', /being counted/],
  ] as const)('refuses a %s game with a reason', (status, re) => {
    const p = planJoinAction({ game: game({ status }), signups: [], leftTable: 0, myMemberId: 'me' })
    expect(p.kind).toBe('refuse')
    if (p.kind === 'refuse') expect(p.reason).toMatch(re)
  })

  it('is idempotent: already seated or waitlisted is reported, not repeated', () => {
    const seated = planJoinAction({ game: game(), signups: [s('me', 'confirmed', 1)], leftTable: 0, myMemberId: 'me' })
    expect(seated).toMatchObject({ kind: 'already', status: 'seated' })
    const waiting = planJoinAction({
      game: game(),
      signups: [s('a', 'confirmed', 1), s('b', 'confirmed', 2), s('me', 'waitlist', 3)],
      leftTable: 0,
      myMemberId: 'me',
    })
    expect(waiting).toMatchObject({ kind: 'already', status: 'waitlisted', position: 1 })
  })

  it('treats a withdrawn signup as not signed up, so you can come back', () => {
    const p = planJoinAction({ game: game(), signups: [s('me', 'withdrawn', 1)], leftTable: 0, myMemberId: 'me' })
    expect(p.kind).toBe('confirm')
  })
})

describe('withdraw', () => {
  const mine = [s('me', 'confirmed', 1)]

  it('previews giving up a seat', () => {
    const p = planWithdrawAction({ game: game(), signups: mine, myMemberId: 'me', databaseAllows: true })
    expect(p.kind).toBe('confirm')
  })

  it('previews leaving the waitlist differently', () => {
    const p = planWithdrawAction({
      game: game(),
      signups: [s('me', 'waitlist', 1)],
      myMemberId: 'me',
      databaseAllows: true,
    })
    expect(p.kind === 'confirm' && p.text).toMatch(/waitlist/)
  })

  it('follows the database: an active game with no buy-in is allowed', () => {
    const p = planWithdrawAction({ game: game({ status: 'active' }), signups: mine, myMemberId: 'me', databaseAllows: true })
    expect(p.kind).toBe('confirm')
  })

  it('follows the database: refuses once the buy-in is in the pot', () => {
    const p = planWithdrawAction({ game: game({ status: 'active' }), signups: mine, myMemberId: 'me', databaseAllows: false })
    expect(p).toMatchObject({ kind: 'refuse' })
    if (p.kind === 'refuse') expect(p.reason).toMatch(/buy-in/)
  })

  it('refuses once the game is being counted or over', () => {
    for (const status of ['reconciling', 'settled', 'cancelled'] as const) {
      const p = planWithdrawAction({ game: game({ status }), signups: mine, myMemberId: 'me', databaseAllows: false })
      expect(p.kind).toBe('refuse')
    }
  })

  it('is idempotent: not signed up, or already withdrawn, is a plain answer', () => {
    for (const signups of [[], [s('me', 'withdrawn', 1)]]) {
      const p = planWithdrawAction({ game: game(), signups, myMemberId: 'me', databaseAllows: true })
      expect(p.kind).toBe('already')
    }
  })
})

const t = (over: Partial<TransferFacts> = {}): TransferFacts => ({
  kind: 'poker',
  amountCents: 8000,
  status: 'pending',
  counterparty: 'Gilad',
  gameDay: 'Thu, Oct 2',
  role: 'payer',
  ...over,
})

describe('mark paid', () => {
  it('previews in the words the user will be asked to approve', () => {
    const p = planMarkPaid(t())
    expect(p.kind).toBe('confirm')
    if (p.kind === 'confirm') {
      expect(p.text).toMatch(/You're marking that you paid Gilad \$80 for poker from Thu, Oct 2/)
      expect(p.text).toMatch(/Confirm\?/)
    }
  })

  it('is only for the payer', () => {
    for (const role of ['payee', 'bystander'] as const) {
      expect(planMarkPaid(t({ role })).kind).toBe('refuse')
    }
  })

  it('is idempotent once paid or confirmed', () => {
    expect(planMarkPaid(t({ status: 'paid' })).kind).toBe('already')
    expect(planMarkPaid(t({ status: 'confirmed' })).kind).toBe('already')
  })

  it('names food as food, never as poker', () => {
    const p = planMarkPaid(t({ kind: 'food', amountCents: 2500 }))
    expect(p.kind === 'confirm' && p.text).toMatch(/\$25 for food/)
  })
})

describe('confirm received', () => {
  it('is only for the payee', () => {
    for (const role of ['payer', 'bystander'] as const) {
      expect(planConfirmReceived(t({ role })).kind).toBe('refuse')
    }
  })

  it('works from pending, like the app, and says the payer has not marked it', () => {
    const p = planConfirmReceived(t({ role: 'payee', status: 'pending' }))
    expect(p.kind).toBe('confirm')
    if (p.kind === 'confirm') expect(p.text).toMatch(/has not marked it paid/)
  })

  it('reads once, with one "from": the person, not a second one for the date', () => {
    const p = planConfirmReceived(t({ role: 'payee', status: 'paid' }))
    expect(p.kind === 'confirm' && p.text).toMatch(
      /You're confirming that you received \$80 from Gilad for poker \(the game on Thu, Oct 2\)/
    )
    expect(p.kind === 'confirm' && p.text.match(/ from /g)?.length).toBe(1)
  })

  it('works from paid, and warns it cannot be undone', () => {
    const p = planConfirmReceived(t({ role: 'payee', status: 'paid' }))
    expect(p.kind === 'confirm' && p.text).toMatch(/cannot be undone/)
  })

  it('is idempotent once confirmed', () => {
    expect(planConfirmReceived(t({ role: 'payee', status: 'confirmed' })).kind).toBe('already')
  })
})
