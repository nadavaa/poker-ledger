import { beforeEach, describe, expect, it, vi } from 'vitest'
import { call, fakeServer, makeFakeDb, mockAuth, type FakeConfig } from './harness'

const GAME = '9a1f0000-0000-4000-8000-000000000001'
const GROUP = '9a1f0000-0000-4000-8000-0000000000aa'
const MEMBER = '9a1f0000-0000-4000-8000-0000000000bb'
const TRANSFER = '9a1f0000-0000-4000-8000-0000000000cc'

const game = (over: Record<string, unknown> = {}) => ({
  id: GAME,
  group_id: GROUP,
  name: 'Friday game',
  location: "Dean's",
  scheduled_at: '2026-10-10T00:00:00Z',
  started_at: null,
  status: 'scheduled',
  seat_limit: 8,
  admin_member_id: 'me',
  groups: { name: 'Tuesday', timezone: 'America/New_York' },
  ...over,
})

const confirmed = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ member_id: `p${i}`, status: 'confirmed', signup_order: i + 1 }))

const people = [
  { id: 'me', display_name: 'Nadav', is_active: true, profile_id: 'u1', profiles: { display_name: 'Nadav' } },
  { id: MEMBER, display_name: 'Dean', is_active: true, profile_id: null, profiles: null },
]

function world(over: Partial<FakeConfig['tables']> = {}, rpc: FakeConfig['rpc'] = {}): FakeConfig {
  return {
    tables: {
      games: [game()],
      game_signups: confirmed(5),
      cashouts: [],
      group_members: (eq) => (eq.profile_id ? [{ id: 'me' }] : people),
      groups: [
        { id: GROUP, name: 'Tuesday', timezone: 'America/New_York', default_seat_limit: 9, default_buyin_cents: 5000, chips_per_dollar: 2 },
      ],
      game_player_totals: [],
      settlements: [],
      ...over,
    },
    rpc: {
      can_admin_game: () => ({ data: true, error: null }),
      is_group_owner: () => ({ data: false, error: null }),
      add_player_to_game: () => ({ data: 'confirmed', error: null }),
      promote_to_confirmed: () => ({ data: 'confirmed', error: null }),
      cancel_game: () => ({ data: null, error: null }),
      create_game: () => ({ data: GAME, error: null }),
      ...rpc,
    },
  }
}

async function setup(config: FakeConfig) {
  vi.resetModules()
  const fake = makeFakeDb(config)
  mockAuth(fake.db)
  const { registerAdminTools } = await import('./admin')
  const s = fakeServer()
  registerAdminTools(s.server)
  return { ...fake, handlers: s.handlers }
}

type Call = { kind: string; name: string; args: unknown }
const rpcs = (calls: Call[], name: string) => calls.filter((c) => c.kind === 'rpc' && c.name === name)
const updates = (calls: Call[], table: string) => calls.filter((c) => c.kind === 'update' && c.name === table)

async function confirm(t: Awaited<ReturnType<typeof setup>>, tool: string, args: Record<string, unknown>) {
  const p = await call(t.handlers, tool, args)
  if (!p.json?.confirmation_token) return { preview: p, done: null }
  const done = await call(t.handlers, tool, { ...args, confirmation_token: p.json.confirmation_token })
  return { preview: p, done }
}

beforeEach(() => vi.resetModules())

describe('permission refusals come back short and clear', () => {
  it('a group owner who is not the game admin cannot add a player', async () => {
    const t = await setup(world({}, { can_admin_game: () => ({ data: false, error: null }), is_group_owner: () => ({ data: true, error: null }) }))
    const r = await call(t.handlers, 'add_player', { game_id: GAME, member_id: MEMBER })
    expect(r.isError).toBe(true)
    expect(r.text).toBe('Only the game admin can add players.')
    expect(rpcs(t.calls, 'add_player_to_game')).toHaveLength(0)
  })

  it('and the database refusal, if the check were skipped, is also one sentence', async () => {
    const t = await setup(world({}, { add_player_to_game: () => ({ data: null, error: { message: 'only the game admin can add players', code: 'P0001' } }) }))
    const { done } = await confirm(t, 'add_player', { game_id: GAME, member_id: MEMBER })
    expect(done?.isError).toBe(true)
    expect(done?.text).toBe('only the game admin can add players')
  })

  it('a payer cannot close out their own debt', async () => {
    const t = await setup(
      world({
        settlements: [{ id: TRANSFER, game_id: GAME, from_member_id: 'me', to_member_id: MEMBER, amount_cents: 8000, status: 'pending', kind: 'poker' }],
      })
    )
    const r = await call(t.handlers, 'close_out_transfer', { transfer_id: TRANSFER })
    expect(r.isError).toBe(true)
    expect(r.text).toMatch(/cannot close out your own debt/)
    expect(updates(t.calls, 'settlements')).toHaveLength(0)
  })

  it('a payee is pointed at confirm_transfer_received', async () => {
    const t = await setup(
      world({
        settlements: [{ id: TRANSFER, game_id: GAME, from_member_id: MEMBER, to_member_id: 'me', amount_cents: 8000, status: 'pending', kind: 'poker' }],
      })
    )
    const r = await call(t.handlers, 'close_out_transfer', { transfer_id: TRANSFER })
    expect(r.text).toMatch(/confirm_transfer_received/)
  })

  it('a non-admin cannot close out someone else\'s transfer', async () => {
    const t = await setup(
      world(
        {
          settlements: [{ id: TRANSFER, game_id: GAME, from_member_id: 'x', to_member_id: 'y', amount_cents: 8000, status: 'pending', kind: 'poker' }],
        },
        { can_admin_game: () => ({ data: false, error: null }) }
      )
    )
    const r = await call(t.handlers, 'close_out_transfer', { transfer_id: TRANSFER })
    expect(r.text).toBe('Only the game admin can close out a transfer.')
  })

  it('editing the time of a game that has started is refused in the database\'s words', async () => {
    const t = await setup(world({ games: [game({ status: 'active' })] }))
    const r = await call(t.handlers, 'edit_game', { game_id: GAME, time: '19:00' })
    expect(r.isError).toBe(true)
    expect(r.text).toBe('The game has started — only the name and location can change now.')
    expect(updates(t.calls, 'games')).toHaveLength(0)
  })

  it('a non-admin cannot edit, seat from the waitlist, or, unless owner, cancel', async () => {
    const t = await setup(world({}, { can_admin_game: () => ({ data: false, error: null }) }))
    expect((await call(t.handlers, 'edit_game', { game_id: GAME, name: 'x' })).text).toBe('Only the game admin can edit this game.')
    expect((await call(t.handlers, 'seat_from_waitlist', { game_id: GAME, member_id: MEMBER })).text).toBe('Only the game admin can change the roster.')
    expect((await call(t.handlers, 'cancel_game', { game_id: GAME })).text).toBe('Only the game admin or the group owner can cancel a game.')
  })

  it('a group owner who is not the admin CAN cancel, as the database allows', async () => {
    const t = await setup(world({}, { can_admin_game: () => ({ data: false, error: null }), is_group_owner: () => ({ data: true, error: null }) }))
    const { preview } = await confirm(t, 'cancel_game', { game_id: GAME })
    expect(preview.json).toMatchObject({ needs_confirmation: true })
  })

  it('cancelling with unpaid transfers is refused before the preview', async () => {
    const t = await setup(world({ settlements: [{ id: 'a' }, { id: 'b' }] }))
    const r = await call(t.handlers, 'cancel_game', { game_id: GAME })
    expect(r.isError).toBe(true)
    expect(r.text).toMatch(/2 unpaid settlements; resolve them first/)
  })

  it('a settled game cannot be cancelled', async () => {
    const t = await setup(world({ games: [game({ status: 'settled' })] }))
    const r = await call(t.handlers, 'cancel_game', { game_id: GAME })
    expect(r.text).toMatch(/settled game cannot be cancelled/)
  })
})

describe('create_game', () => {
  const args = { group_id: GROUP, date: '2026-10-31', time: '20:00', location: "Dean's", name: 'Halloween' }

  it('previews the time as the group sees it and writes nothing', async () => {
    const t = await setup(world())
    const r = await call(t.handlers, 'create_game', args)
    expect(String(r.json?.preview)).toMatch(/"Halloween" for Tuesday on Sat, Oct 31, 8:00 PM \(America\/New_York\) at Dean's/)
    expect(String(r.json?.preview)).toMatch(/9 seats, \$50 buy-in, 2 chips per \$1/)
    expect(rpcs(t.calls, 'create_game')).toHaveLength(0)
  })

  it('stores 8 PM local as the right instant either side of the clocks changing', async () => {
    const before = await setup(world())
    await confirm(before, 'create_game', { ...args, date: '2026-10-31' })
    const after = await setup(world())
    await confirm(after, 'create_game', { ...args, date: '2026-11-01' })
    expect((rpcs(before.calls, 'create_game')[0].args as Record<string, unknown>).p_scheduled_at).toBe('2026-11-01T00:00:00.000Z')
    expect((rpcs(after.calls, 'create_game')[0].args as Record<string, unknown>).p_scheduled_at).toBe('2026-11-02T01:00:00.000Z')
  })

  it('snapshots the group defaults it showed, exactly as the form does', async () => {
    const t = await setup(world())
    await confirm(t, 'create_game', args)
    expect(rpcs(t.calls, 'create_game')[0].args).toMatchObject({
      p_group_id: GROUP,
      p_seat_limit: 9,
      p_buyin_cents: 5000,
      p_chips_per_dollar: 2,
      p_playing: true,
      p_new_group_name: null,
    })
  })

  it('refuses an hour that does not exist', async () => {
    const t = await setup(world())
    const r = await call(t.handlers, 'create_game', { ...args, date: '2027-03-14', time: '02:30' })
    expect(r.isError).toBe(true)
    expect(r.text).toMatch(/does not exist in America\/New_York/)
  })

  it('a group the user is not in is not found', async () => {
    const config = world()
    config.tables!.groups = []
    const t = await setup(config)
    const r = await call(t.handlers, 'create_game', args)
    expect(r.isError).toBe(true)
    expect(r.text).toMatch(/not a member/)
  })

  it('a yes to one set of numbers does not cover changed group defaults', async () => {
    const config = world()
    const t = await setup(config)
    const p = await call(t.handlers, 'create_game', args)
    ;(config.tables!.groups as Record<string, unknown>[])[0].default_buyin_cents = 10000
    const r = await call(t.handlers, 'create_game', { ...args, confirmation_token: p.json?.confirmation_token })
    expect(r.isError).toBe(true)
    expect(r.text).toMatch(/arguments changed/)
    expect(rpcs(t.calls, 'create_game')).toHaveLength(0)
  })
})

describe('seat_from_waitlist over the limit', () => {
  const full = () =>
    world({
      game_signups: [...confirmed(8), { member_id: MEMBER, status: 'waitlist', signup_order: 9 }],
    })

  it('previews the app\'s own question and changes nothing without the token', async () => {
    const t = await setup(full())
    const r = await call(t.handlers, 'seat_from_waitlist', { game_id: GAME, member_id: MEMBER })
    expect(r.json?.preview).toBe('This game is full (8/8). Adding Dean will make it 9 players. Continue?')
    expect(rpcs(t.calls, 'promote_to_confirmed')).toHaveLength(0)
  })

  it('goes over only with the token, and says so to the database', async () => {
    const t = await setup(full())
    const { done } = await confirm(t, 'seat_from_waitlist', { game_id: GAME, member_id: MEMBER })
    expect(done?.json).toMatchObject({ changed: true })
    expect(rpcs(t.calls, 'promote_to_confirmed')[0].args).toMatchObject({ p_allow_overfill: true })
  })

  it('a seat that is merely free never turns on overfill', async () => {
    const config = world({ game_signups: [...confirmed(5), { member_id: MEMBER, status: 'waitlist', signup_order: 9 }] })
    const t = await setup(config)
    const { preview, done } = await confirm(t, 'seat_from_waitlist', { game_id: GAME, member_id: MEMBER })
    expect(preview.json?.preview).toMatch(/Seat Dean from the waitlist/)
    expect(done?.json).toMatchObject({ changed: true })
    expect(rpcs(t.calls, 'promote_to_confirmed')[0].args).toMatchObject({ p_allow_overfill: false })
  })

  it('a yes to a free seat is not a yes to going over if the table fills first', async () => {
    const config = world({ game_signups: [...confirmed(7), { member_id: MEMBER, status: 'waitlist', signup_order: 9 }] })
    const t = await setup(config)
    const p = await call(t.handlers, 'seat_from_waitlist', { game_id: GAME, member_id: MEMBER })
    expect(p.json?.preview).toMatch(/\(8\/8\)/)

    // Someone else is seated before the yes arrives: the table is now full.
    config.tables!.game_signups = [...confirmed(8), { member_id: MEMBER, status: 'waitlist', signup_order: 9 }]
    const r = await call(t.handlers, 'seat_from_waitlist', { game_id: GAME, member_id: MEMBER, confirmation_token: p.json?.confirmation_token })
    expect(r.isError).toBe(true)
    expect(r.text).toMatch(/arguments changed/)
    expect(rpcs(t.calls, 'promote_to_confirmed')).toHaveLength(0)
  })
})

describe('add_player', () => {
  it('adds a guest through the app\'s function and never returns a claim code', async () => {
    const t = await setup(world())
    const { preview, done } = await confirm(t, 'add_player', { game_id: GAME, guest_name: 'Sam' })
    expect(String(preview.json?.preview)).toMatch(/Add Sam \(a guest, new to the group\)/)
    expect(done?.json).toMatchObject({ changed: true, outcome: 'seated' })
    expect(rpcs(t.calls, 'add_player_to_game')[0].args).toEqual({ p_game_id: GAME, p_member_id: null, p_guest_name: 'Sam' })
    expect(JSON.stringify([preview.json, done?.json])).not.toMatch(/claim/i)
  })

  it('refuses a guest who is already a member, and names the member id', async () => {
    const t = await setup(world())
    const r = await call(t.handlers, 'add_player', { game_id: GAME, guest_name: 'dean' })
    expect(r.isError).toBe(true)
    expect(r.text).toContain(`member_id ${MEMBER}`)
    expect(rpcs(t.calls, 'add_player_to_game')).toHaveLength(0)
  })

  it('waitlists when the table is full, and says adding does not go over', async () => {
    const t = await setup(world({ game_signups: confirmed(8) }))
    const r = await call(t.handlers, 'add_player', { game_id: GAME, member_id: MEMBER })
    expect(String(r.json?.preview)).toMatch(/table is full \(8\/8\).*waitlist at #1/)
  })

  it('a yes to a seat does not cover a waitlist spot if the table fills first', async () => {
    const config = world({ game_signups: confirmed(7) })
    const t = await setup(config)
    const p = await call(t.handlers, 'add_player', { game_id: GAME, member_id: MEMBER })
    config.tables!.game_signups = confirmed(8)
    const r = await call(t.handlers, 'add_player', { game_id: GAME, member_id: MEMBER, confirmation_token: p.json?.confirmation_token })
    expect(r.isError).toBe(true)
    expect(rpcs(t.calls, 'add_player_to_game')).toHaveLength(0)
  })
})

describe('edit_game', () => {
  it('moves the time in the group zone and updates only what changed', async () => {
    const t = await setup(world())
    const { preview, done } = await confirm(t, 'edit_game', { game_id: GAME, time: '19:00' })
    expect(String(preview.json?.preview)).toMatch(/start time from Fri, Oct 9, 8:00 PM to Fri, Oct 9, 7:00 PM/)
    expect(done?.json).toMatchObject({ changed: true })
    expect(updates(t.calls, 'games')).toEqual([{ kind: 'update', name: 'games', args: { scheduled_at: '2026-10-09T23:00:00.000Z' } }])
  })

  it('lowering the seat limit below the confirmed count is refused, nobody demoted', async () => {
    const t = await setup(world({ game_signups: confirmed(6) }))
    const r = await call(t.handlers, 'edit_game', { game_id: GAME, seat_limit: 4 })
    expect(r.isError).toBe(true)
    expect(r.text).toBe('6 players are confirmed. Move someone to the waitlist first.')
    expect(updates(t.calls, 'games')).toHaveLength(0)
  })

  it('a zero-row update (row-level security) is a refusal, not a success', async () => {
    const config = world()
    config.updates = { games: { data: [], error: null } }
    const t = await setup(config)
    const { done } = await confirm(t, 'edit_game', { game_id: GAME, name: 'New name' })
    expect(done?.isError).toBe(true)
    expect(done?.text).toMatch(/Nothing was changed/)
  })
})

describe('close_out_transfer', () => {
  const transfer = { id: TRANSFER, game_id: GAME, from_member_id: 'dean', to_member_id: 'gilad', amount_cents: 8000, status: 'pending', kind: 'poker' }
  const cfg = () =>
    world({
      settlements: [transfer],
      group_members: (eq) =>
        eq.profile_id
          ? [{ id: 'me' }]
          : [
              { id: 'dean', display_name: 'Dean', is_active: true, profiles: null },
              { id: 'gilad', display_name: 'Gilad', is_active: true, profiles: null },
            ],
    })

  it('previews with both names, then makes the update the close-out button makes', async () => {
    const t = await setup(cfg())
    const { preview, done } = await confirm(t, 'close_out_transfer', { transfer_id: TRANSFER })
    expect(String(preview.json?.preview)).toMatch(/closing out Dean's \$80 poker payment to Gilad from Oct 9, 2026 as game admin/)
    expect(done?.json).toMatchObject({ changed: true, status: 'confirmed' })
    expect(updates(t.calls, 'settlements')).toEqual([{ kind: 'update', name: 'settlements', args: { status: 'confirmed' } }])
  })
})

describe('the agent marker for admin actions', () => {
  const marks = (calls: Call[]) => rpcs(calls, 'record_agent_action').map((c) => c.args)

  it('create, edit, cancel, add and seat are each labelled after they commit', async () => {
    const t1 = await setup(world())
    await confirm(t1, 'create_game', { group_id: GROUP, date: '2026-10-31', time: '20:00' })
    expect(marks(t1.calls)).toEqual([{ p_action: 'created_game', p_game_id: GAME }])

    const t2 = await setup(world())
    await confirm(t2, 'edit_game', { game_id: GAME, name: 'Renamed' })
    expect(marks(t2.calls)).toEqual([{ p_action: 'edited_game', p_game_id: GAME }])

    const t3 = await setup(world())
    await confirm(t3, 'cancel_game', { game_id: GAME })
    expect(marks(t3.calls)).toEqual([{ p_action: 'cancelled_game', p_game_id: GAME }])

    const t4 = await setup(world())
    await confirm(t4, 'add_player', { game_id: GAME, member_id: MEMBER })
    expect(marks(t4.calls)).toEqual([{ p_action: 'added_player', p_game_id: GAME, p_target_member_id: MEMBER }])

    const t5 = await setup(world({ game_signups: [...confirmed(5), { member_id: MEMBER, status: 'waitlist', signup_order: 9 }] }))
    await confirm(t5, 'seat_from_waitlist', { game_id: GAME, member_id: MEMBER })
    expect(marks(t5.calls)).toEqual([{ p_action: 'seated_player', p_game_id: GAME, p_target_member_id: MEMBER }])
  })

  it('nothing is labelled at preview time', async () => {
    const t = await setup(world())
    await call(t.handlers, 'edit_game', { game_id: GAME, name: 'Renamed' })
    expect(marks(t.calls)).toEqual([])
  })
})
