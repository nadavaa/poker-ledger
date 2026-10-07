import { describe, expect, it } from 'vitest'
import {
  gameDetail,
  gameListItem,
  mapBalances,
  mapGroups,
  mapStats,
  type GameRow,
} from '../map'
import {
  appLink,
  balancesView,
  contextLine,
  debtView,
  gamesView,
  groupsView,
  membersView,
  safeOrigin,
  SCREEN_OF_TOOL,
  gameCardView,
  parseResult,
  sideOfZero,
  statsView,
  stepOf,
  streakWords,
  standingWords,
} from './shape'

// Feed the shapers what the real mappers produce, not a hand-written copy, so
// a change to a tool's output breaks here rather than in a phone.
const text = (o: unknown, isError = false) => ({
  isError,
  content: [{ type: 'text', text: typeof o === 'string' ? o : JSON.stringify(o) }],
})

const TZ = 'America/New_York'

describe('parseResult', () => {
  it('reads the text content as an object', () => {
    expect(parseResult(text({ a: 1 }))).toEqual({ ok: true, data: { a: 1 } })
  })
  it('passes a refusal through in its own words', () => {
    expect(parseResult(text('Game not found.', true))).toEqual({
      ok: false,
      message: 'Game not found.',
    })
  })
  it('does not throw on garbage, empty or non-object results', () => {
    for (const r of [text('not json'), text('[1]'), text('7'), { content: [] }, null]) {
      expect(parseResult(r as never).ok).toBe(false)
    }
  })
})

describe('statsView', () => {
  const rows = [
    { game_id: 'a', played_at: '2026-09-01T02:00:00Z', net_cents: 5000, buyin_cents: 2000 },
    { game_id: 'b', played_at: '2026-09-08T02:00:00Z', net_cents: -8000, buyin_cents: 4000 },
    { game_id: 'c', played_at: '2026-09-15T02:00:00Z', net_cents: -1000, buyin_cents: 2000 },
  ]

  it('gives one point per settled game with the running balance, oldest first', () => {
    const v = statsView(mapStats(rows, TZ))
    if (v.kind !== 'chart') throw new Error('expected a chart')
    expect(v.points.map((p) => p.running.cents)).toEqual([5000, -3000, -4000])
    expect(v.points.map((p) => p.net.cents)).toEqual([5000, -8000, -1000])
    expect(v.lifetime.cents).toBe(-4000)
    expect(v.games).toBe(3)
    expect(v.winRatePercent).toBe(33)
    expect(v.streak).toMatchObject({ kind: 'loss', length: 2 })
    // The server's own words, not a second formatter.
    expect(v.points[0].net.display).toBe('$50')
    expect(v.points[1].running.display).toBe('-$30')
    expect(v.points[0].date).toBe('Aug 31, 2026')
    // What the stats screen shows beyond the chart.
    expect(v.wins).toBe(1)
    expect(v.losses).toBe(2)
    expect(v.best?.net.cents).toBe(5000)
    expect(v.worst?.net.cents).toBe(-8000)
    expect(v.boughtIn?.cents).toBe(8000)
    expect(v.average?.display).toBe('-$13.33')
    expect(v.longestLoss).toBe(2)
  })

  it('shows an empty season as a message, not an empty chart', () => {
    const v = statsView(mapStats([], TZ))
    expect(v).toEqual({ kind: 'empty', message: 'No settled games in that range.' })
  })

  it('handles a single game', () => {
    const v = statsView(mapStats(rows.slice(0, 1), TZ))
    if (v.kind !== 'chart') throw new Error('expected a chart')
    expect(v.points).toHaveLength(1)
  })

  it('skips a point it cannot read instead of failing the chart', () => {
    const data = mapStats(rows, TZ) as unknown as Record<string, unknown>
    ;(data.per_game as unknown[])[1] = { game_id: 'b' }
    const v = statsView(data)
    if (v.kind !== 'chart') throw new Error('expected a chart')
    expect(v.points).toHaveLength(2)
  })

  it('says which side of zero in words', () => {
    expect(sideOfZero(1)).toBe('up')
    expect(sideOfZero(-1)).toBe('down')
    expect(sideOfZero(0)).toBe('even')
  })

  it('words a streak', () => {
    expect(streakWords('win', 1)).toBe('1 win in a row')
    expect(streakWords('win', 3)).toBe('3 wins in a row')
    expect(streakWords('loss', 1)).toBe('1 loss in a row')
    expect(streakWords('loss', 2)).toBe('2 losses in a row')
    expect(streakWords('none', 0)).toBe('No streak')
  })
})

describe('gameCardView', () => {
  const game: GameRow = {
    id: 'g1',
    name: 'Friday night',
    scheduled_at: '2026-10-09T23:30:00Z',
    started_at: null,
    settled_at: null,
    location: 'Dean’s place',
    seat_limit: 2,
    status: 'scheduled',
    admin_member_id: 'm1',
  }
  const people = ['m1', 'm2', 'm3', 'm4'].map((id) => ({
    member_id: id,
    display_name: id.toUpperCase(),
  }))
  const build = (
    me: string | null,
    signups: { member_id: string; status: 'confirmed' | 'waitlist' | 'withdrawn'; signup_order: number }[],
    over: Partial<GameRow> = {}
  ) =>
    gameCardView(
      gameDetail({
        game: { ...game, ...over },
        timezone: TZ,
        groupName: 'Kev’s game',
        signups,
        people,
        totals: [],
        settlements: [],
        myMemberId: me,
      }) as unknown as Record<string, unknown>
    )
  const base = [
    { member_id: 'm1', status: 'confirmed' as const, signup_order: 1 },
    { member_id: 'm2', status: 'confirmed' as const, signup_order: 2 },
    { member_id: 'm3', status: 'waitlist' as const, signup_order: 3 },
  ]

  it('offers Join to someone who is not signed up', () => {
    const v = build('m4', base)
    if (v?.kind !== 'card') throw new Error('expected a card')
    expect(v.standing).toEqual({ kind: 'none' })
    expect(v.action).toBe('join')
    expect(standingWords(v.standing)).toBe("You're not signed up")
  })

  it('offers Withdraw to someone who is seated', () => {
    const v = build('m2', base)
    if (v?.kind !== 'card') throw new Error('expected a card')
    expect(v.standing).toEqual({ kind: 'seated' })
    expect(v.action).toBe('withdraw')
    expect(v.roster.find((p) => p.isMe)?.name).toBe('M2')
  })

  it('shows a waitlist position and offers Withdraw', () => {
    const v = build('m3', [...base, { member_id: 'm4', status: 'waitlist', signup_order: 4 }])
    if (v?.kind !== 'card') throw new Error('expected a card')
    expect(v.standing).toEqual({ kind: 'waitlisted', position: 1 })
    expect(v.action).toBe('withdraw')
    expect(standingWords(v.standing)).toBe("You're on the waitlist, #1")
  })

  it('treats a withdrawn signup as not signed up', () => {
    const v = build('m4', [...base, { member_id: 'm4', status: 'withdrawn', signup_order: 5 }])
    if (v?.kind !== 'card') throw new Error('expected a card')
    expect(v.standing.kind).toBe('none')
  })

  it('says the group time and place, and never clamps seats over the limit', () => {
    const v = build('m4', [
      ...base,
      { member_id: 'm4', status: 'confirmed', signup_order: 6 },
    ])
    if (v?.kind !== 'card') throw new Error('expected a card')
    expect(v.seats).toBe('3/2 · 1 over')
    expect(v.when).toBe('Fri, Oct 9, 7:30 PM')
    expect(v.timezone).toBe(TZ)
    expect(v.location).toBe('Dean’s place')
  })

  it('has no money on a scheduled card', () => {
    const v = build('m2', base)
    expect(JSON.stringify(v)).not.toMatch(/cents|\$|buy/i)
  })

  it.each(['active', 'reconciling', 'settled', 'cancelled'] as const)(
    'gives a %s game a summary with no actions',
    (status) => {
      const v = build('m2', base, { status })
      if (v?.kind !== 'summary') throw new Error('expected a summary')
      expect(v.status).toBe(status)
      expect('action' in v).toBe(false)
    }
  )

  it('returns null for something that is not a game', () => {
    expect(gameCardView({})).toBeNull()
  })
})

describe('stepOf', () => {
  it('reads a preview with its token', () => {
    expect(
      stepOf(
        text({
          needs_confirmation: true,
          preview: 'You would get a seat.',
          confirmation_token: 'tok',
        })
      )
    ).toEqual({ kind: 'preview', text: 'You would get a seat.', token: 'tok' })
  })

  it('reads a committed change', () => {
    expect(
      stepOf(text({ changed: true, outcome: 'confirmed', message: "You're in.", detail: 'See you there.' }))
    ).toEqual({ kind: 'done', message: "You're in.", detail: 'See you there.' })
  })

  it('reads "already signed up" as unchanged, not as an error', () => {
    expect(stepOf(text({ changed: false, message: 'You are already signed up.' }))).toEqual({
      kind: 'unchanged',
      message: 'You are already signed up.',
    })
  })

  it('shows a refusal in the server’s own words', () => {
    expect(stepOf(text('That confirmation was already used or has expired.', true))).toEqual({
      kind: 'refused',
      message: 'That confirmation was already used or has expired.',
    })
  })

  it('refuses a preview that arrives without a token', () => {
    expect(stepOf(text({ needs_confirmation: true, preview: 'x' })).kind).toBe('refused')
  })
})

describe('contextLine', () => {
  it('tells the model who did what, and that the user confirmed it', () => {
    const line = contextLine({
      action: 'join',
      title: 'Friday night',
      group: 'Kev’s game',
      message: "You're in.",
      seats: '2/2 · table full',
    })
    expect(line).toContain('joined Friday night')
    expect(line).toContain('confirmed it themselves')
    expect(line).toContain('2/2 · table full')
  })
})

describe('the app screens', () => {
  it('lists groups with my role', () => {
    const groups = groupsView({
      groups: mapGroups([{ id: 'g1', name: 'wef', timezone: null, role: 'owner' }]),
    })
    expect(groups).toEqual([
      { id: 'g1', name: 'wef', role: 'owner', timezone: 'America/New_York' },
    ])
    expect(groupsView({})).toEqual([])
  })

  it('lists a group\u2019s games with my standing and the real seat wording', () => {
    const game: GameRow = {
      id: 'g1', name: null, scheduled_at: '2026-10-09T00:00:00Z', started_at: null,
      settled_at: null, location: null, seat_limit: 2, status: 'scheduled', admin_member_id: 'm1',
    }
    const signups = [
      { member_id: 'm1', status: 'confirmed' as const, signup_order: 1 },
      { member_id: 'm2', status: 'confirmed' as const, signup_order: 2 },
      { member_id: 'm3', status: 'waitlist' as const, signup_order: 3 },
    ]
    const item = (me: string) =>
      gamesView({
        group: 'wef',
        games: [gameListItem({ game, timezone: TZ, signups, leftTable: 0, myMemberId: me })],
      }).games[0]
    expect(item('m3')).toMatchObject({
      id: 'g1',
      title: 'Thu, Oct 8, 8:00 PM',
      seats: '2/2 · table full',
      standing: { kind: 'waitlisted', position: 1 },
    })
    expect(item('m1').standing).toEqual({ kind: 'seated' })
    expect(item('m9').standing).toEqual({ kind: 'none' })
  })

  it('reads members, and tolerates nothing', () => {
    expect(
      membersView({ group: 'wef', members: [{ member_id: 'a', name: 'Dean' }, { nope: 1 }] })
    ).toEqual({ group: 'wef', members: [{ id: 'a', name: 'Dean' }] })
    expect(membersView({}).members).toEqual([])
  })

  it('reads results with their total', () => {
    const v = balancesView(
      mapBalances([
        {
          game_id: 'g', game_name: null, group_name: 'wef', timezone: TZ,
          played_at: '2026-09-17T00:00:00Z', buyin_cents: 5000, cashout_cents: 8000,
          adjustment_cents: 0, net_cents: 3000,
        },
      ]) as unknown as Record<string, unknown>
    )
    expect(v.total?.cents).toBe(3000)
    expect(v.games[0]).toMatchObject({ gameId: 'g', group: 'wef' })
    expect(v.games[0].net.display).toBe('$30')
  })

  it('keeps what I owe and what I am owed apart', () => {
    const v = debtView({
      i_owe: [{ game_id: 'g', group: 'wef', kind: 'poker', with: 'Roger', amount: { cents: 800, display: '$8' }, status_words: 'not paid yet' }],
      owed_to_me: [{ game_id: 'g', group: 'wef', kind: 'food', with: 'Izzy', amount: { cents: 250, display: '$2.50' }, status_words: 'not paid yet' }],
    })
    expect(v.iOwe).toHaveLength(1)
    expect(v.owedToMe[0]).toMatchObject({ kind: 'food', with: 'Izzy' })
    expect(debtView({})).toEqual({ iOwe: [], owedToMe: [] })
  })

  it('shows the pot and results on a game that has started, and none on a scheduled one', () => {
    const base: GameRow = {
      id: 'g1', name: 'Fri', scheduled_at: '2026-10-09T23:30:00Z', started_at: '2026-10-09T23:40:00Z',
      settled_at: '2026-10-10T03:00:00Z', location: null, seat_limit: 8, status: 'settled', admin_member_id: 'm1',
    }
    const view = (status: GameRow['status']) =>
      gameCardView(
        gameDetail({
          game: { ...base, status },
          timezone: TZ, groupName: 'wef',
          signups: [{ member_id: 'm1', status: 'confirmed', signup_order: 1 }],
          people: [{ member_id: 'm1', display_name: 'Me' }],
          totals: [{ member_id: 'm1', display_name: 'Me', buyin_cents: 5000, cashout_cents: 8000, adjustment_cents: 0, net_cents: 3000 }],
          settlements: [], myMemberId: 'm1',
        }) as unknown as Record<string, unknown>
      )
    const settled = view('settled')
    if (settled?.kind !== 'summary') throw new Error('expected a summary')
    expect(settled.money?.pot.cents).toBe(5000)
    expect(settled.money?.players[0]).toMatchObject({ isMe: true })
    expect(settled.money?.players[0].net?.cents).toBe(3000)
    const active = view('active')
    if (active?.kind !== 'summary') throw new Error('expected a summary')
    // Counts and nets are the reconciliation's business until it is settled.
    expect(active.money?.players[0].net).toBeNull()
    const scheduled = view('scheduled')
    expect(scheduled?.kind).toBe('card')
  })

  it('maps each tool to a screen', () => {
    expect(SCREEN_OF_TOOL.get_game).toBe('game')
    expect(SCREEN_OF_TOOL.list_my_groups).toBe('groups')
    expect(SCREEN_OF_TOOL.join_game).toBeUndefined()
  })

  it('only ever opens https or local addresses, and builds links from ids', () => {
    expect(safeOrigin('https://www.kevespoker.com/anything')).toBe('https://www.kevespoker.com')
    expect(safeOrigin('http://localhost:3000')).toBe('http://localhost:3000')
    expect(safeOrigin('http://evil.example')).toBeNull()
    expect(safeOrigin('javascript:alert(1)')).toBeNull()
    expect(safeOrigin('')).toBeNull()
    expect(appLink('https://x.app', { game: 'a b' })).toBe('https://x.app/games/a%20b')
    expect(appLink('https://x.app', { group: 'g' })).toBe('https://x.app/groups/g')
    expect(appLink(null, { group: 'g' })).toBeNull()
  })
})
