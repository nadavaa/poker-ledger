import { describe, expect, it } from 'vitest'
import { overfillPrompt } from '../seats'
import {
  localToInstant,
  planAddPlayer,
  planCancelGame,
  planCloseOut,
  planCreateGame,
  planEditGame,
  planSeatFromWaitlist,
  type AddPlayerFacts,
  type CreateGameFacts,
  type EditGameFacts,
} from './admin-plan'

const NY = 'America/New_York'
const NOW = new Date('2026-10-05T12:00:00Z')

describe('local time to an instant', () => {
  it('uses the group zone, not the server, across the fall-back boundary', () => {
    // Clocks go back on Sunday Nov 1, 2026. 8 PM is EDT the night before and
    // EST the night after: the UTC hour differs by one.
    const before = localToInstant('2026-10-31', '20:00', NY)
    const after = localToInstant('2026-11-01', '20:00', NY)
    expect(before).toEqual({ ok: true, iso: '2026-11-01T00:00:00.000Z' })
    expect(after).toEqual({ ok: true, iso: '2026-11-02T01:00:00.000Z' })
  })

  it('and across the spring-forward boundary', () => {
    // Clocks go forward Sunday Mar 14, 2027.
    expect(localToInstant('2027-03-13', '20:00', NY)).toEqual({ ok: true, iso: '2027-03-14T01:00:00.000Z' })
    expect(localToInstant('2027-03-14', '20:00', NY)).toEqual({ ok: true, iso: '2027-03-15T00:00:00.000Z' })
  })

  it('reads the same wall clock in a different zone as a different instant', () => {
    expect(localToInstant('2026-10-09', '20:00', 'America/Los_Angeles')).toEqual({
      ok: true,
      iso: '2026-10-10T03:00:00.000Z',
    })
  })

  it('refuses a time that never happens when the clocks skip an hour', () => {
    const r = localToInstant('2027-03-14', '02:30', NY)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toMatch(/does not exist/)
  })

  it('refuses a date that is not real, rather than rolling it forward', () => {
    expect(localToInstant('2026-02-30', '20:00', NY).ok).toBe(false)
  })

  it('refuses the wrong shape with an example', () => {
    for (const [d, t] of [['10/9/2026', '20:00'], ['2026-10-09', '8pm'], ['2026-10-09', '8:00']]) {
      const r = localToInstant(d, t, NY)
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.reason).toMatch(/YYYY-MM-DD/)
    }
  })
})

const create = (over: Partial<CreateGameFacts> = {}): CreateGameFacts => ({
  groupName: 'Tuesday',
  timezone: NY,
  date: '2026-10-09',
  time: '20:00',
  defaults: { seatLimit: 9, buyinCents: 5000, chipsPerDollar: 2 },
  playing: true,
  sameTimeGame: null,
  now: NOW,
  ...over,
})

describe('create game', () => {
  it('shows the time as the group will see it, with the group defaults', () => {
    const p = planCreateGame(create({ location: "Dean's", name: 'Friday game' }))
    expect(p.kind).toBe('confirm')
    if (p.kind === 'confirm') {
      expect(p.text).toMatch(/"Friday game" for Tuesday on Fri, Oct 9, 8:00 PM \(America\/New_York\) at Dean's/)
      expect(p.text).toMatch(/9 seats, \$50 buy-in, 2 chips per \$1/)
      expect(p.text).toMatch(/game admin and take a seat/)
      expect(p.bind).toMatchObject({
        scheduled_at: '2026-10-10T00:00:00.000Z',
        seat_limit: 9,
        buyin_cents: 5000,
        chips_per_dollar: 2,
      })
    }
  })

  it('the instant it will store is the group zone either side of a DST change', () => {
    const a = planCreateGame(create({ date: '2026-10-31' }))
    const b = planCreateGame(create({ date: '2026-11-01' }))
    expect(a.kind === 'confirm' && a.bind.scheduled_at).toBe('2026-11-01T00:00:00.000Z')
    expect(b.kind === 'confirm' && b.bind.scheduled_at).toBe('2026-11-02T01:00:00.000Z')
    // And the words say 8:00 PM both times.
    expect(a.kind === 'confirm' && a.text).toMatch(/8:00 PM/)
    expect(b.kind === 'confirm' && b.text).toMatch(/8:00 PM/)
  })

  it('an override of the seat limit wins over the group default', () => {
    const p = planCreateGame(create({ seatLimit: 6 }))
    expect(p.kind === 'confirm' && p.bind.seat_limit).toBe(6)
  })

  it('refuses fewer than two seats, as create_game does', () => {
    const p = planCreateGame(create({ seatLimit: 1 }))
    expect(p).toMatchObject({ kind: 'refuse' })
  })

  it('says so when the creator is not taking a seat', () => {
    const p = planCreateGame(create({ playing: false }))
    expect(p.kind === 'confirm' && p.text).toMatch(/without a seat of your own/)
  })

  it('warns about the past, and about a game already at that time, without blocking', () => {
    const past = planCreateGame(create({ date: '2026-09-01' }))
    expect(past.kind === 'confirm' && past.text).toMatch(/in the past/)
    const dup = planCreateGame(create({ sameTimeGame: 'Friday game' }))
    expect(dup.kind === 'confirm' && dup.text).toMatch(/already a game at that time \(Friday game\)/)
  })

  it('refuses a bad time before showing a preview', () => {
    expect(planCreateGame(create({ date: '2027-03-14', time: '02:30' })).kind).toBe('refuse')
  })
})

const edit = (over: Partial<EditGameFacts> = {}, edits: EditGameFacts['edits'] = {}): EditGameFacts => ({
  isAdmin: true,
  status: 'scheduled',
  timezone: NY,
  current: { scheduledAt: '2026-10-10T00:00:00.000Z', name: 'Friday game', location: "Dean's", seatLimit: 9 },
  confirmedCount: 5,
  waitlistCount: 2,
  edits,
  ...over,
})

describe('edit game', () => {
  it('moves just the time, keeping the date, in the group zone', () => {
    const p = planEditGame(edit({}, { time: '19:00' }))
    expect(p.kind).toBe('confirm')
    if (p.kind === 'confirm') {
      expect(p.payload).toEqual({ scheduled_at: '2026-10-09T23:00:00.000Z' })
      expect(p.text).toMatch(/from Fri, Oct 9, 8:00 PM to Fri, Oct 9, 7:00 PM/)
    }
  })

  it('moves just the date, keeping the time', () => {
    const p = planEditGame(edit({}, { date: '2026-10-16' }))
    expect(p.kind === 'confirm' && p.payload).toEqual({ scheduled_at: '2026-10-17T00:00:00.000Z' })
  })

  it('raising the limit says how many waitlisted players take the seats', () => {
    const p = planEditGame(edit({}, { seatLimit: 11 }))
    expect(p.kind === 'confirm' && p.text).toMatch(/9 to 11 seats \(2 waitlisted players take the new seats/)
    expect(p.kind === 'confirm' && p.bind.promotes).toBe(2)
  })

  it('lowering below the confirmed count is refused with the app\'s reason', () => {
    const p = planEditGame(edit({}, { seatLimit: 4 }))
    expect(p).toEqual({ kind: 'refuse', reason: '5 players are confirmed. Move someone to the waitlist first.' })
  })

  it('refuses a time or seat change once the game has started, in the database\'s words', () => {
    const t = planEditGame(edit({ status: 'active' }, { time: '19:00' }))
    expect(t).toMatchObject({ kind: 'refuse', reason: expect.stringMatching(/has started — only the name and location/) })
    const s = planEditGame(edit({ status: 'active' }, { seatLimit: 12 }))
    expect(s.kind).toBe('refuse')
  })

  it('still lets the name and location change on a running game', () => {
    const p = planEditGame(edit({ status: 'active' }, { location: 'Gilad\'s' }))
    expect(p.kind).toBe('confirm')
  })

  it('refuses a finished or cancelled game', () => {
    expect(planEditGame(edit({ status: 'settled' }, { name: 'x' })).kind).toBe('refuse')
    expect(planEditGame(edit({ status: 'reconciling' }, { name: 'x' })).kind).toBe('refuse')
    expect(planEditGame(edit({ status: 'cancelled' }, { name: 'x' })).kind).toBe('refuse')
  })

  it('refuses someone who is not the game admin', () => {
    const p = planEditGame(edit({ isAdmin: false }, { name: 'x' }))
    expect(p).toEqual({ kind: 'refuse', reason: 'Only the game admin can edit this game.' })
  })

  it('an empty string clears; the same value is no change', () => {
    const clear = planEditGame(edit({}, { location: '' }))
    expect(clear.kind === 'confirm' && clear.payload).toEqual({ location: null })
    const same = planEditGame(edit({}, { name: 'Friday game', seatLimit: 9 }))
    expect(same.kind).toBe('already')
  })
})

const add = (over: Partial<AddPlayerFacts> = {}): AddPlayerFacts => ({
  isAdmin: true,
  status: 'scheduled',
  gameLabel: 'Friday game',
  seatLimit: 8,
  seatsTaken: 5,
  waitlistCount: 0,
  memberRequested: true,
  member: { id: 'm1', name: 'Dean', active: true, signup: null },
  activeMembers: [{ id: 'm1', name: 'Dean' }, { id: 'm2', name: 'Gilad' }],
  ...over,
})

describe('add player', () => {
  it('seats a member when there is room', () => {
    const p = planAddPlayer(add())
    expect(p.kind === 'confirm' && p.text).toMatch(/Add Dean to Friday game\? There is room, so they would get a seat \(6\/8\)/)
    expect(p.kind === 'confirm' && p.bind.outcome).toBe('seated')
  })

  it('waitlists a member when the table is full, and says adding never goes over', () => {
    const p = planAddPlayer(add({ seatsTaken: 8, waitlistCount: 2 }))
    expect(p.kind === 'confirm' && p.text).toMatch(/table is full \(8\/8\).*waitlist at #3/)
    expect(p.kind === 'confirm' && p.bind.outcome).toBe('waitlisted')
  })

  it('a guest is described as new to the group', () => {
    const p = planAddPlayer(add({ memberRequested: false, member: null, guestName: 'Sam' }))
    expect(p.kind === 'confirm' && p.text).toMatch(/Add Sam \(a guest, new to the group\)/)
  })

  it('refuses a guest who is really an existing member, naming the member_id', () => {
    const p = planAddPlayer(add({ memberRequested: false, member: null, guestName: ' dean ' }))
    expect(p.kind).toBe('refuse')
    if (p.kind === 'refuse') expect(p.reason).toMatch(/already a member called Dean.*member_id m1/)
  })

  it('needs exactly one of member or guest', () => {
    expect(planAddPlayer(add({ memberRequested: true, guestName: 'Sam' })).kind).toBe('refuse')
    expect(planAddPlayer(add({ memberRequested: false, member: null })).kind).toBe('refuse')
  })

  it('refuses a member who is not active in this group', () => {
    const p = planAddPlayer(add({ member: null }))
    expect(p.kind).toBe('refuse')
  })

  it('is idempotent: already seated or waitlisted is a plain answer', () => {
    expect(planAddPlayer(add({ member: { id: 'm1', name: 'Dean', active: true, signup: 'confirmed' } })).kind).toBe('already')
    const w = planAddPlayer(add({ member: { id: 'm1', name: 'Dean', active: true, signup: 'waitlist', waitlistPosition: 2 } }))
    expect(w.kind === 'already' && w.text).toMatch(/waitlist \(#2\).*seat_from_waitlist/)
  })

  it('a withdrawn player can be added back', () => {
    expect(planAddPlayer(add({ member: { id: 'm1', name: 'Dean', active: true, signup: 'withdrawn' } })).kind).toBe('confirm')
  })

  it('refuses a group owner who is not the game admin', () => {
    expect(planAddPlayer(add({ isAdmin: false }))).toEqual({
      kind: 'refuse',
      reason: 'Only the game admin can add players.',
    })
  })

  it('refuses a finished game', () => {
    expect(planAddPlayer(add({ status: 'settled' })).kind).toBe('refuse')
  })
})

describe('seat from waitlist', () => {
  const base = {
    isAdmin: true,
    status: 'scheduled' as const,
    gameLabel: 'Friday game',
    seatLimit: 8,
    seatsTaken: 8,
    name: 'Dean',
    signup: 'waitlist' as const,
  }

  it('uses the app\'s exact question when the table is full', () => {
    const p = planSeatFromWaitlist(base)
    expect(p.kind === 'confirm' && p.text).toBe(overfillPrompt('Dean', 8, 8))
    expect(p.kind === 'confirm' && p.text).toBe(
      'This game is full (8/8). Adding Dean will make it 9 players. Continue?'
    )
    expect(p.kind === 'confirm' && p.bind).toEqual({ overfill: true, seats_taken: 8 })
  })

  it('is a plain seat when there is room, and does not allow overfill', () => {
    const p = planSeatFromWaitlist({ ...base, seatsTaken: 6 })
    expect(p.kind === 'confirm' && p.text).toMatch(/Seat Dean from the waitlist in Friday game\? \(7\/8\)/)
    expect(p.kind === 'confirm' && p.bind).toEqual({ overfill: false, seats_taken: 6 })
  })

  it('a yes to a plain seat is not a yes to going over: the binding differs', () => {
    const plain = planSeatFromWaitlist({ ...base, seatsTaken: 7 })
    const full = planSeatFromWaitlist({ ...base, seatsTaken: 8 })
    expect(plain.kind === 'confirm' && plain.bind).not.toEqual(full.kind === 'confirm' && full.bind)
  })

  it('refuses non-admins, and people not on the waitlist', () => {
    expect(planSeatFromWaitlist({ ...base, isAdmin: false }).kind).toBe('refuse')
    expect(planSeatFromWaitlist({ ...base, signup: 'withdrawn' }).kind).toBe('refuse')
    expect(planSeatFromWaitlist({ ...base, signup: null }).kind).toBe('refuse')
  })

  it('is idempotent for someone already seated', () => {
    expect(planSeatFromWaitlist({ ...base, signup: 'confirmed' }).kind).toBe('already')
  })
})

describe('cancel game', () => {
  const base = {
    canCancel: true,
    status: 'active' as const,
    gameLabel: 'Friday game',
    unpaidTransfers: 0,
    buyinCount: 4,
    buyinTotalCents: 20000,
  }

  it('says what is kept and that no settlement will be computed', () => {
    const p = planCancelGame(base)
    expect(p.kind === 'confirm' && p.text).toMatch(/Cancel Friday game\? The roster and all 4 buy-ins totalling \$200 and the audit trail stay on the record, and it only means no settlement will be computed/)
  })

  it('a game with no buy-ins says only the roster', () => {
    const p = planCancelGame({ ...base, buyinCount: 0, buyinTotalCents: 0, status: 'scheduled' })
    expect(p.kind === 'confirm' && p.text).toMatch(/The roster and the audit trail/)
  })

  it('refuses a settled game, unpaid transfers, and the wrong person', () => {
    expect(planCancelGame({ ...base, status: 'settled' }).kind).toBe('refuse')
    const unpaid = planCancelGame({ ...base, unpaidTransfers: 2 })
    expect(unpaid.kind === 'refuse' && unpaid.reason).toMatch(/2 unpaid settlements/)
    expect(planCancelGame({ ...base, canCancel: false }).kind).toBe('refuse')
  })

  it('is idempotent once cancelled', () => {
    expect(planCancelGame({ ...base, status: 'cancelled' }).kind).toBe('already')
  })
})

describe('close out a transfer', () => {
  const base = {
    isGameAdmin: true,
    role: 'bystander' as const,
    status: 'pending' as const,
    kind: 'poker' as const,
    amountCents: 8000,
    payerName: 'Dean',
    payeeName: 'Gilad',
    gameDay: 'Oct 2, 2026',
  }

  it('says who is closing what, and that it records them as the closer', () => {
    const p = planCloseOut(base)
    expect(p.kind === 'confirm' && p.text).toMatch(/closing out Dean's \$80 poker payment to Gilad from Oct 2, 2026 as game admin, without Gilad confirming/)
    expect(p.kind === 'confirm' && p.text).toMatch(/closed out by you/)
  })

  it('refuses the payer on their own debt', () => {
    const p = planCloseOut({ ...base, role: 'payer' })
    expect(p.kind === 'refuse' && p.reason).toMatch(/cannot close out your own debt/)
  })

  it('points the payee at the confirm tool', () => {
    const p = planCloseOut({ ...base, role: 'payee' })
    expect(p.kind === 'refuse' && p.reason).toMatch(/confirm_transfer_received/)
  })

  it('refuses anyone who is not the game admin', () => {
    expect(planCloseOut({ ...base, isGameAdmin: false })).toEqual({
      kind: 'refuse',
      reason: 'Only the game admin can close out a transfer.',
    })
  })

  it('is idempotent once confirmed', () => {
    expect(planCloseOut({ ...base, status: 'confirmed' }).kind).toBe('already')
  })
})
