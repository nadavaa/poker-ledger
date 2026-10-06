import { beforeEach, describe, expect, it, vi } from 'vitest'
import { call, fakeServer, makeFakeDb, mockAuth, type FakeConfig } from './harness'

const GAME = '6f1f0000-0000-4000-8000-000000000001'

const game = (over: Record<string, unknown> = {}) => ({
  id: GAME,
  group_id: 'grp',
  name: 'Sunday Game',
  scheduled_at: '2026-10-04T18:30:00Z',
  started_at: null,
  status: 'scheduled',
  seat_limit: 2,
  groups: { name: 'Tuesday', timezone: 'America/New_York' },
  ...over,
})

async function setup(config: FakeConfig) {
  vi.resetModules()
  const fake = makeFakeDb(config)
  mockAuth(fake.db)
  const { registerSignupTools } = await import('./signups')
  const s = fakeServer()
  registerSignupTools(s.server)
  return { ...fake, handlers: s.handlers }
}

const open = (signups: unknown[] = []): FakeConfig => ({
  tables: {
    games: [game()],
    game_signups: signups,
    cashouts: [],
    group_members: [{ id: 'me' }],
  },
  rpc: {
    join_game_by_link: () => ({
      data: [
        {
          group_id: 'grp',
          group_name: 'Tuesday',
          game_name: 'Sunday Game',
          scheduled_at: '2026-10-04T18:30:00Z',
          game_status: 'scheduled',
          outcome: 'confirmed',
          waitlist_position: null,
        },
      ],
      error: null,
    }),
    can_withdraw_from_game: () => ({ data: true, error: null }),
  },
})

const rpcCalls = (calls: { kind: string; name: string }[], name: string) =>
  calls.filter((c) => c.kind === 'rpc' && c.name === name).length

beforeEach(() => vi.resetModules())

describe('join_game', () => {
  it('previews first and changes nothing', async () => {
    const t = await setup(open())
    const r = await call(t.handlers, 'join_game', { game_id: GAME })
    expect(r.json).toMatchObject({ needs_confirmation: true })
    expect(r.json?.confirmation_token).toEqual(expect.any(String))
    expect(String(r.json?.preview)).toMatch(/Sunday Game/)
    expect(rpcCalls(t.calls, 'join_game_by_link')).toBe(0)
  })

  it('commits with the token, through the game-link function, once', async () => {
    const t = await setup(open())
    const preview = await call(t.handlers, 'join_game', { game_id: GAME })
    const done = await call(t.handlers, 'join_game', {
      game_id: GAME,
      confirmation_token: preview.json?.confirmation_token,
    })
    expect(done.json).toMatchObject({ changed: true, outcome: 'confirmed' })
    expect(rpcCalls(t.calls, 'join_game_by_link')).toBe(1)
  })

  it('refuses a replayed token and does not join twice', async () => {
    const t = await setup(open())
    const preview = await call(t.handlers, 'join_game', { game_id: GAME })
    const token = preview.json?.confirmation_token
    await call(t.handlers, 'join_game', { game_id: GAME, confirmation_token: token })
    const again = await call(t.handlers, 'join_game', { game_id: GAME, confirmation_token: token })
    expect(again.isError).toBe(true)
    expect(again.text).toMatch(/already used/)
    expect(rpcCalls(t.calls, 'join_game_by_link')).toBe(1)
  })

  it('refuses a token from a preview of a different game', async () => {
    const t = await setup(open())
    const preview = await call(t.handlers, 'join_game', { game_id: GAME })
    const other = '6f1f0000-0000-4000-8000-000000000002'
    const r = await call(t.handlers, 'join_game', {
      game_id: other,
      confirmation_token: preview.json?.confirmation_token,
    })
    expect(r.isError).toBe(true)
    expect(r.text).toMatch(/arguments changed/)
    expect(rpcCalls(t.calls, 'join_game_by_link')).toBe(0)
  })

  it('is idempotent: already seated is a plain answer with no token and no write', async () => {
    const t = await setup(open([{ member_id: 'me', status: 'confirmed', signup_order: 1 }]))
    const r = await call(t.handlers, 'join_game', { game_id: GAME })
    expect(r.isError).toBe(false)
    expect(r.json).toMatchObject({ changed: false })
    expect(String(r.json?.message)).toMatch(/already have a seat/)
    expect(r.json).not.toHaveProperty('confirmation_token')
    expect(rpcCalls(t.calls, 'join_game_by_link')).toBe(0)
  })

  it('never reaches the join function for a game outside the user\'s groups', async () => {
    // Row-level security returns no row for a group the user is not in.
    const config = open()
    config.tables!.games = []
    const t = await setup(config)
    const r = await call(t.handlers, 'join_game', { game_id: GAME })
    expect(r.isError).toBe(true)
    expect(r.text).toMatch(/not in one of your groups/)
    expect(rpcCalls(t.calls, 'join_game_by_link')).toBe(0)
  })

  it('refuses a settled game with a short reason', async () => {
    const config = open()
    config.tables!.games = [game({ status: 'settled' })]
    const t = await setup(config)
    const r = await call(t.handlers, 'join_game', { game_id: GAME })
    expect(r.isError).toBe(true)
    expect(r.text).toMatch(/settled/)
  })

  it('fails closed when no confirmation secret is configured', async () => {
    const t = await setup(open())
    delete process.env.MCP_CONFIRM_SECRET
    const r = await call(t.handlers, 'join_game', { game_id: GAME })
    expect(r.isError).toBe(true)
    expect(r.text).toMatch(/not switched on/)
  })
})

describe('withdraw_from_game', () => {
  const seated = [{ member_id: 'me', status: 'confirmed', signup_order: 1 }]

  it('previews, then withdraws with the token', async () => {
    const t = await setup(open(seated))
    const preview = await call(t.handlers, 'withdraw_from_game', { game_id: GAME })
    expect(preview.json).toMatchObject({ needs_confirmation: true })
    expect(t.calls.filter((c) => c.kind === 'update')).toHaveLength(0)

    const done = await call(t.handlers, 'withdraw_from_game', {
      game_id: GAME,
      confirmation_token: preview.json?.confirmation_token,
    })
    expect(done.json).toMatchObject({ changed: true, outcome: 'withdrawn' })
    expect(t.calls.filter((c) => c.kind === 'update' && c.name === 'game_signups')).toEqual([
      { kind: 'update', name: 'game_signups', args: { status: 'withdrawn' } },
    ])
  })

  it('refuses once the buy-in is in the pot, as the database says', async () => {
    const config = open(seated)
    config.tables!.games = [game({ status: 'active' })]
    config.rpc!.can_withdraw_from_game = () => ({ data: false, error: null })
    const t = await setup(config)
    const r = await call(t.handlers, 'withdraw_from_game', { game_id: GAME })
    expect(r.isError).toBe(true)
    expect(r.text).toMatch(/buy-in is in the pot|once your buy-in/)
  })

  it('follows the database: an active game with no buy-in can be left', async () => {
    const config = open(seated)
    config.tables!.games = [game({ status: 'active' })]
    const t = await setup(config)
    const r = await call(t.handlers, 'withdraw_from_game', { game_id: GAME })
    expect(r.json).toMatchObject({ needs_confirmation: true })
  })

  it('refuses a game that is being counted', async () => {
    const config = open(seated)
    config.tables!.games = [game({ status: 'reconciling' })]
    const t = await setup(config)
    const r = await call(t.handlers, 'withdraw_from_game', { game_id: GAME })
    expect(r.isError).toBe(true)
    expect(r.text).toMatch(/roster is fixed/)
  })

  it('turns a row-level-security refusal (zero rows) into a clear sentence', async () => {
    const config = open(seated)
    config.updates = { game_signups: { data: [], error: null } }
    const t = await setup(config)
    const preview = await call(t.handlers, 'withdraw_from_game', { game_id: GAME })
    const r = await call(t.handlers, 'withdraw_from_game', {
      game_id: GAME,
      confirmation_token: preview.json?.confirmation_token,
    })
    expect(r.isError).toBe(true)
    expect(r.text).toMatch(/did not allow that/)
    expect(r.text).not.toMatch(/policy|42501|violates/)
  })

  it('is idempotent: not signed up is a plain answer', async () => {
    const t = await setup(open([]))
    const r = await call(t.handlers, 'withdraw_from_game', { game_id: GAME })
    expect(r.isError).toBe(false)
    expect(r.json).toMatchObject({ changed: false })
    expect(r.json).not.toHaveProperty('confirmation_token')
  })
})

describe('the agent marker', () => {
  const recorded = (calls: { kind: string; name: string; args: unknown }[]) =>
    calls.filter((c) => c.name === 'record_agent_action').map((c) => c.args)

  it('labels a join and a withdrawal, but only after they commit', async () => {
    const t = await setup(open())
    const p = await call(t.handlers, 'join_game', { game_id: GAME })
    expect(recorded(t.calls)).toEqual([])
    await call(t.handlers, 'join_game', { game_id: GAME, confirmation_token: p.json?.confirmation_token })
    expect(recorded(t.calls)).toEqual([{ p_action: 'joined', p_game_id: GAME }])
  })

  it('labels a withdrawal', async () => {
    const t = await setup(open([{ member_id: 'me', status: 'confirmed', signup_order: 1 }]))
    const p = await call(t.handlers, 'withdraw_from_game', { game_id: GAME })
    await call(t.handlers, 'withdraw_from_game', { game_id: GAME, confirmation_token: p.json?.confirmation_token })
    expect(recorded(t.calls)).toEqual([{ p_action: 'withdrew', p_game_id: GAME }])
  })

  it('does not label a join that did not create a signup', async () => {
    const config = open()
    config.rpc!.join_game_by_link = () => ({
      data: [{ group_id: 'grp', group_name: 'T', game_name: null, scheduled_at: '2026-10-04T18:30:00Z', game_status: 'settled', outcome: 'over', waitlist_position: null }],
      error: null,
    })
    const t = await setup(config)
    const p = await call(t.handlers, 'join_game', { game_id: GAME })
    await call(t.handlers, 'join_game', { game_id: GAME, confirmation_token: p.json?.confirmation_token })
    expect(recorded(t.calls)).toEqual([])
  })
})
