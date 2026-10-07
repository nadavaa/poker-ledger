import { describe, expect, it } from 'vitest'
import {
  dayRange,
  gameDetail,
  gameListItem,
  inRange,
  mapBalances,
  mapOutstandingDebt,
  mapStats,
  myStanding,
  nameMap,
  seatsView,
  type GameRow,
  type SettlementRow,
  type SignupRow,
} from './map'

const NY = 'America/New_York'

const game = (over: Partial<GameRow> = {}): GameRow => ({
  id: 'g1',
  name: 'Labor Day',
  scheduled_at: '2026-09-07T00:00:00Z',
  started_at: null,
  settled_at: null,
  location: 'Dean’s',
  seat_limit: 8,
  status: 'scheduled',
  admin_member_id: 'admin',
  ...over,
})

const signups = (n: number): SignupRow[] =>
  Array.from({ length: n }, (_, i) => ({
    member_id: `m${i}`,
    status: 'confirmed' as const,
    signup_order: i,
  }))

describe('seats', () => {
  it('says 9/8 · 1 over, never clamped', () => {
    expect(seatsView(9, 8).summary).toBe('9/8 · 1 over')
    expect(seatsView(8, 8).summary).toBe('8/8 · table full')
    expect(seatsView(5, 8).summary).toBe('5/8 · 3 free')
  })

  it('frees the seat of someone who cashed out and left', () => {
    const item = gameListItem({
      game: game({ status: 'active' }),
      timezone: NY,
      signups: signups(9),
      leftTable: 1,
      myMemberId: 'm0',
    })
    expect(item.seats.summary).toBe('8/8 · table full')
  })
})

describe('my standing', () => {
  const list: SignupRow[] = [
    ...signups(2),
    { member_id: 'w1', status: 'waitlist', signup_order: 10 },
    { member_id: 'w2', status: 'waitlist', signup_order: 11 },
    { member_id: 'gone', status: 'withdrawn', signup_order: 5 },
  ]
  it('seated', () => expect(myStanding(list, 'm0').i_am).toBe('seated'))
  it('waitlisted with a 1-based position by signup order', () => {
    expect(myStanding(list, 'w1')).toEqual({
      i_am: 'waitlisted',
      waitlist_position: 1,
    })
    expect(myStanding(list, 'w2').waitlist_position).toBe(2)
  })
  it('withdrawn and absent are both not signed up', () => {
    expect(myStanding(list, 'gone').i_am).toBe('not_signed_up')
    expect(myStanding(list, 'nobody').i_am).toBe('not_signed_up')
    expect(myStanding(list, null).i_am).toBe('not_signed_up')
  })
})

describe('game dates', () => {
  it('dates a game by started_at, falling back to the schedule', () => {
    const played = gameListItem({
      game: game({
        status: 'settled',
        started_at: '2026-09-06T23:30:00Z',
        scheduled_at: '2026-09-07T00:00:00Z',
      }),
      timezone: NY,
      signups: [],
      leftTable: 0,
      myMemberId: null,
    })
    expect(played.played_at.iso).toBe('2026-09-06T23:30:00.000Z')
    expect(played.played_at.local).toBe('Sun, Sep 6, 7:30 PM')

    const planned = gameListItem({
      game: game(),
      timezone: NY,
      signups: [],
      leftTable: 0,
      myMemberId: null,
    })
    expect(planned.played_at.iso).toBe('2026-09-07T00:00:00.000Z')
  })

  it('reads a date range in the group zone', () => {
    const range = dayRange('2026-09-01', '2026-09-30', NY)
    // 11pm on the 30th in New York is still September.
    expect(inRange('2026-10-01T03:00:00Z', range)).toBe(true)
    // Midnight on the 1st in New York is 04:00Z.
    expect(inRange('2026-09-01T03:59:00Z', range)).toBe(false)
    expect(inRange('2026-09-01T04:00:00Z', range)).toBe(true)
    expect(inRange('2026-10-01T04:00:00Z', range)).toBe(false)
  })

  it('refuses a malformed date with a short instruction', () => {
    expect(() => dayRange('9/1/26', undefined, NY)).toThrow(/2026-09-30/)
  })
})

describe('game detail', () => {
  const people = [
    { member_id: 'admin', display_name: 'Gilad' },
    { member_id: 'm0', display_name: 'Old Name', profile_name: 'Dean' },
    { member_id: 'm1', display_name: 'Sam' },
  ]
  const totals = [
    { member_id: 'm0', display_name: 'Dean', buyin_cents: 10000, cashout_cents: 15000, adjustment_cents: 0, net_cents: 5000 },
    { member_id: 'm1', display_name: 'Sam', buyin_cents: 10000, cashout_cents: 5000, adjustment_cents: 0, net_cents: -5000 },
  ]

  it('shows no money at all for a scheduled game', () => {
    const d = gameDetail({
      game: game(),
      timezone: NY,
      groupName: 'Tuesday',
      signups: signups(2),
      people,
      // Even if something handed us totals, a scheduled game has no money.
      totals,
      settlements: [],
      myMemberId: 'm0',
    })
    expect(d.money).toBeNull()
    expect(d.settlements).toBeNull()
    expect(JSON.stringify(d)).not.toMatch(/cents/)
  })

  it('uses the living profile name, not the snapshot', () => {
    const d = gameDetail({
      game: game(),
      timezone: NY,
      groupName: 'Tuesday',
      signups: signups(2),
      people,
      totals: [],
      settlements: [],
      myMemberId: 'm0',
    })
    expect(d.roster[0]).toMatchObject({ name: 'Dean', is_me: true })
  })

  it('shows buy-ins but no results while the game is being played', () => {
    const d = gameDetail({
      game: game({ status: 'active' }),
      timezone: NY,
      groupName: 'Tuesday',
      signups: signups(2),
      people,
      totals,
      settlements: [],
      myMemberId: 'm0',
    })
    expect(d.money?.pot.cents).toBe(20000)
    expect(d.money?.players[0]).not.toHaveProperty('net')
    expect(d.money?.players[0]).not.toHaveProperty('cashed_out')
    expect(d.settlements).toBeNull()
  })

  it('shows results, biggest winner first, once settled', () => {
    const d = gameDetail({
      game: game({ status: 'settled' }),
      timezone: NY,
      groupName: 'Tuesday',
      signups: signups(2),
      people,
      totals: [...totals].reverse(),
      settlements: [],
      myMemberId: 'm0',
    })
    expect(d.money?.players.map((p) => p.name)).toEqual(['Dean', 'Sam'])
    expect(d.money?.players[0].net).toEqual({ cents: 5000, display: '$50' })
  })

  it('passes along only the settlement rows it was given', () => {
    const rows: SettlementRow[] = [
      { id: 's1', from_member_id: 'm1', to_member_id: 'm0', amount_cents: 5000, status: 'paid', kind: 'poker' },
    ]
    const d = gameDetail({
      game: game({ status: 'settled' }),
      timezone: NY,
      groupName: 'Tuesday',
      signups: signups(2),
      people,
      totals,
      settlements: rows,
      myMemberId: 'm0',
    })
    expect(d.settlements).toHaveLength(1)
    expect(d.settlements?.[0]).toMatchObject({ from: 'Sam', to: 'Dean', my_part: 'payee', transfer_id: 's1' })
  })

  it('gives the game admin a transfer id for every transfer, to close one out', () => {
    const rows: SettlementRow[] = [
      { id: 's3', from_member_id: 'm0', to_member_id: 'm1', amount_cents: 100, status: 'pending', kind: 'poker' },
    ]
    const d = gameDetail({
      game: game({ status: 'settled' }),
      timezone: NY,
      groupName: 'Tuesday',
      signups: signups(2),
      people,
      totals,
      settlements: rows,
      myMemberId: 'admin', // the game's admin, a party to neither side
    })
    expect(d.settlements?.[0]).toMatchObject({ transfer_id: 's3', my_part: 'bystander' })
  })

  it('gives no transfer id for a transfer between two other people', () => {
    const rows: SettlementRow[] = [
      { id: 's2', from_member_id: 'm1', to_member_id: 'admin', amount_cents: 100, status: 'pending', kind: 'poker' },
    ]
    const d = gameDetail({
      game: game({ status: 'settled' }),
      timezone: NY,
      groupName: 'Tuesday',
      signups: signups(2),
      people,
      totals,
      settlements: rows,
      myMemberId: 'm0',
    })
    expect(d.settlements?.[0]).not.toHaveProperty('transfer_id')
  })
})

describe('stats', () => {
  it('reports an empty range as a sentence, not zeros and NaN', () => {
    const s = mapStats([], NY)
    expect(s.games_played).toBe(0)
    expect(JSON.stringify(s)).not.toMatch(/NaN/)
  })

  it('carries per-game nets with a running total, oldest first', () => {
    const s = mapStats(
      [
        { game_id: 'b', played_at: '2026-09-13T00:00:00Z', net_cents: -2000, buyin_cents: 5000 },
        { game_id: 'a', played_at: '2026-09-06T00:00:00Z', net_cents: 7000, buyin_cents: 5000 },
      ],
      NY
    ) as Extract<ReturnType<typeof mapStats>, { lifetime_net: unknown }>
    expect(s.lifetime_net.cents).toBe(5000)
    expect(s.per_game.map((g) => g.game_id)).toEqual(['a', 'b'])
    expect(s.per_game[1].running_net.cents).toBe(5000)
    expect(s.biggest_loss?.net.cents).toBe(-2000)
    expect(s.current_streak).toEqual({ kind: 'loss', length: 1 })
  })
})

describe('stats with no wins or no losses', () => {
  const stats = (nets: number[]) =>
    mapStats(
      nets.map((n, i) => ({
        game_id: `g${i}`,
        played_at: `2026-09-0${i + 1}T00:00:00Z`,
        net_cents: n,
        buyin_cents: 5000,
      })),
      NY
    ) as Extract<ReturnType<typeof mapStats>, { lifetime_net: unknown }>

  it('never calls a losing game the biggest win', () => {
    const s = stats([-10700, -18800, -12800])
    expect(s.biggest_win).toBeNull()
    expect(s.biggest_loss?.net.cents).toBe(-18800)
  })

  it('never calls a winning game the biggest loss', () => {
    const s = stats([500, 2000])
    expect(s.biggest_loss).toBeNull()
    expect(s.biggest_win?.net.cents).toBe(2000)
  })

  it('treats a break-even game as neither', () => {
    const s = stats([0])
    expect(s.biggest_win).toBeNull()
    expect(s.biggest_loss).toBeNull()
  })
})

describe('balances', () => {
  it('lists what I ended each game with, newest first, and a total', () => {
    const b = mapBalances([
      { game_id: 'a', game_name: null, group_name: 'T', timezone: NY, played_at: '2026-09-06T00:00:00Z', buyin_cents: 5000, cashout_cents: 12000, adjustment_cents: 0, net_cents: 7000 },
      { game_id: 'b', game_name: null, group_name: 'T', timezone: NY, played_at: '2026-09-13T00:00:00Z', buyin_cents: 5000, cashout_cents: 3000, adjustment_cents: 0, net_cents: -2000 },
    ])
    expect(b.games.map((g) => g.game_id)).toEqual(['b', 'a'])
    expect(b.total_net).toEqual({ cents: 5000, display: '$50' })
  })
})

describe('outstanding debt', () => {
  const people = nameMap([
    { member_id: 'me', display_name: 'Me' },
    { member_id: 'gil', display_name: 'Gilad' },
    { member_id: 'dean', display_name: 'Dean' },
  ])
  const gameInfo = new Map([
    ['g1', { game_name: 'Labor Day', group_name: 'Tuesday', timezone: NY, played_at: '2026-09-07T00:00:00Z' }],
  ])
  const base = { game_id: 'g1' }
  const rows: SettlementRow[] = [
    { ...base, id: 'p1', from_member_id: 'me', to_member_id: 'gil', amount_cents: 8000, status: 'pending', kind: 'poker' },
    { ...base, id: 'f1', from_member_id: 'me', to_member_id: 'gil', amount_cents: 2500, status: 'pending', kind: 'food' },
    { ...base, id: 'p2', from_member_id: 'dean', to_member_id: 'me', amount_cents: 3000, status: 'paid', kind: 'poker' },
    { ...base, id: 'done', from_member_id: 'me', to_member_id: 'dean', amount_cents: 900, status: 'confirmed', kind: 'poker' },
    // I run the game, so I can see a transfer that is none of my business.
    { ...base, id: 'other', from_member_id: 'dean', to_member_id: 'gil', amount_cents: 4000, status: 'pending', kind: 'poker' },
  ]
  const payments = [
    { settlement_id: 'p1', member_venmo: null, profile_venmo: '@gilad-g', member_phone: '+15551234567', profile_phone: '+15551234567', preferred: 'zelle' },
    { settlement_id: 'f1', member_venmo: null, profile_venmo: 'gilad-g' },
  ]
  const out = mapOutstandingDebt({
    settlements: rows,
    gameInfo,
    people,
    myMemberIdForGame: () => 'me',
    payments,
  })

  it('keeps poker and food as separate lines and totals, never netted', () => {
    expect(out.i_owe.map((l) => l.kind)).toEqual(['poker', 'food'])
    expect(out.totals.i_owe.poker.cents).toBe(8000)
    expect(out.totals.i_owe.food.cents).toBe(2500)
    expect(out.totals.owed_to_me.poker.cents).toBe(3000)
    expect(out.totals.owed_to_me.food.cents).toBe(0)
  })

  it('drops confirmed rows and transfers between other people', () => {
    const ids = [...out.i_owe, ...out.owed_to_me].map((l) => l.transfer_id)
    expect(ids).not.toContain('done')
    expect(ids).not.toContain('other')
  })

  it('gives a Venmo link only for what I owe, with the @ stripped', () => {
    expect(out.i_owe[0].venmo_link).toBe(
      'https://venmo.com/gilad-g?txn=pay&amount=80.00&note=%E2%99%A0%EF%B8%8F'
    )
    expect(out.owed_to_me[0]).not.toHaveProperty('venmo_link')
  })

  it('reports the handshake status in words', () => {
    expect(out.owed_to_me[0].status).toBe('paid')
    expect(out.owed_to_me[0].status_words).toMatch(/confirm/)
  })

  it('never lets a phone number into the output', () => {
    expect(JSON.stringify(out)).not.toMatch(/5551234567|phone|zelle/i)
  })

  it('says so when the payee has no handle', () => {
    const none = mapOutstandingDebt({
      settlements: [rows[0]],
      gameInfo,
      people,
      myMemberIdForGame: () => 'me',
      payments: [{ settlement_id: 'p1', member_venmo: null, profile_venmo: null }],
    })
    expect(none.i_owe[0].venmo_link).toBeNull()
    expect(none.i_owe[0].payment_note).toMatch(/Venmo/)
  })
})
