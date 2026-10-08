import { describe, expect, it } from 'vitest'
import { gameDetail, orderedSignups, orderedTotals, type GameRow } from '../map'
import { gameFacts, gameListFacts, groupAvatar, personAvatar } from './meta'

describe('pictures', () => {
  it('builds a public address from a stored path, passes a web address through, and never invents one', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://proj.supabase.co'
    expect(personAvatar('u1/a.webp')).toBe('https://proj.supabase.co/storage/v1/object/public/avatars/u1/a.webp')
    expect(groupAvatar('g1/b.webp')).toBe('https://proj.supabase.co/storage/v1/object/public/group-avatars/g1/b.webp')
    expect(personAvatar('https://lh3.googleusercontent.com/x')).toBe('https://lh3.googleusercontent.com/x')
    expect(personAvatar(null)).toBeNull()
    expect(personAvatar('  ')).toBeNull()
  })
})

describe('order shared by the text and the pictures', () => {
  const game: GameRow = {
    id: 'g', name: 'G', scheduled_at: '2026-10-09T23:30:00Z', started_at: '2026-10-09T23:40:00Z',
    settled_at: '2026-10-10T03:00:00Z', location: null, seat_limit: 8, status: 'settled', admin_member_id: 'm1',
  }
  // Deliberately out of order, so a sort that differs between the two sides shows.
  const signups = [
    { member_id: 'm3', status: 'confirmed' as const, signup_order: 3 },
    { member_id: 'm1', status: 'confirmed' as const, signup_order: 1 },
    { member_id: 'm5', status: 'waitlist' as const, signup_order: 6 },
    { member_id: 'm2', status: 'confirmed' as const, signup_order: 2 },
    { member_id: 'm4', status: 'waitlist' as const, signup_order: 4 },
  ]
  const totals = [
    { member_id: 'm1', display_name: 'A', buyin_cents: 5000, cashout_cents: 2000, adjustment_cents: 0, net_cents: -3000 },
    { member_id: 'm2', display_name: 'B', buyin_cents: 5000, cashout_cents: 9000, adjustment_cents: 0, net_cents: 4000 },
    { member_id: 'm3', display_name: 'C', buyin_cents: 5000, cashout_cents: 4000, adjustment_cents: 0, net_cents: -1000 },
  ]
  const people = ['m1', 'm2', 'm3', 'm4', 'm5'].map((id) => ({ member_id: id, display_name: 'N' + id }))
  const text = gameDetail({
    game, timezone: 'America/New_York', groupName: 'G', signups, people, totals, settlements: [], myMemberId: 'm1',
  }) as unknown as {
    roster: { name: string }[]
    waitlist: { name: string }[]
    money: { players: { name: string }[] }
  }

  it('lists the roster and the waitlist in the order the pictures use', () => {
    const o = orderedSignups(signups)
    expect(text.roster.map((p) => p.name)).toEqual(o.confirmed.map((s) => 'N' + s.member_id))
    expect(text.waitlist.map((p) => p.name)).toEqual(o.waitlisted.map((s) => 'N' + s.member_id))
    expect(o.confirmed.map((s) => s.member_id)).toEqual(['m1', 'm2', 'm3'])
    expect(o.waitlisted.map((s) => s.member_id)).toEqual(['m4', 'm5'])
  })

  it('puts the biggest winner first once settled, and in stored order before that', () => {
    expect(orderedTotals(totals, true).map((t) => t.member_id)).toEqual(['m2', 'm3', 'm1'])
    expect(orderedTotals(totals, false).map((t) => t.member_id)).toEqual(['m1', 'm2', 'm3'])
    // The text's own player order is the same list.
    expect(text.money.players.map((p) => p.name)).toEqual(['Nm2', 'Nm3', 'Nm1'])
  })
})

describe('what a game row in the list shows', () => {
  const totals = [
    { game_id: 'a', member_id: 'me', buyin_cents: 5000, net_cents: 3000 },
    { game_id: 'a', member_id: 'x', buyin_cents: 5000, net_cents: -3000 },
    { game_id: 'b', member_id: 'me', buyin_cents: 5000, net_cents: 0 },
  ]
  it('has players, the pot and my result for a settled game', () => {
    const [a] = gameListFacts({ games: [{ id: 'a', status: 'settled' }], totals, myMemberId: 'me' })
    expect(a.players).toBe(2)
    expect(a.pot?.cents).toBe(10000)
    expect(a.myNet?.cents).toBe(3000)
  })
  it('has nothing for a game that has not finished, and no result for one still being counted', () => {
    const r = gameListFacts({
      games: [{ id: 'a', status: 'scheduled' }, { id: 'a', status: 'active' }, { id: 'b', status: 'reconciling' }],
      totals, myMemberId: 'me',
    })
    expect(r[0]).toEqual({ players: null, pot: null, myNet: null })
    expect(r[1]).toEqual({ players: null, pot: null, myNet: null })
    expect(r[2].myNet).toBeNull()
    expect(r[2].players).toBe(1)
  })
  it('has no result of mine for a game I was not in', () => {
    const [a] = gameListFacts({ games: [{ id: 'a', status: 'settled' }], totals, myMemberId: 'someone-else' })
    expect(a.myNet).toBeNull()
  })
})

describe('what the game banner needs', () => {
  const base = { groupId: 'grp', scheduledAt: '2026-10-09T23:30:00Z', buyinCents: 5000, chipsPerDollar: 2 }
  it('prices the buy-in in chips with the game\u2019s own ratio', () => {
    const f = gameFacts({ ...base, status: 'scheduled', now: Date.parse('2026-10-01T00:00:00Z') })
    expect(f.buyin).toEqual({ cents: 5000, display: '$50' })
    expect(f.chips).toBe(100)
    expect(f.groupId).toBe('grp')
  })
  it('is overdue only when it is still scheduled and the start time has passed', () => {
    const late = Date.parse('2026-10-10T00:00:00Z')
    expect(gameFacts({ ...base, status: 'scheduled', now: late }).overdue).toBe(true)
    expect(gameFacts({ ...base, status: 'active', now: late }).overdue).toBe(false)
    expect(gameFacts({ ...base, status: 'scheduled', now: Date.parse('2026-10-09T00:00:00Z') }).overdue).toBe(false)
  })
})
