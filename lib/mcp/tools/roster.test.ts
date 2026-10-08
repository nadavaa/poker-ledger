import { beforeEach, describe, expect, it, vi } from 'vitest'
import { settledGameSummary } from '../../summary'
import { call, fakeServer, makeFakeDb, mockAuth, type FakeConfig } from './harness'

const GROUP = '8b1f0000-0000-4000-8000-0000000000aa'
const GAME = '8b1f0000-0000-4000-8000-000000000001'

async function setup(config: FakeConfig) {
  vi.resetModules()
  const fake = makeFakeDb(config)
  mockAuth(fake.db)
  const { registerRosterTools } = await import('./roster')
  const s = fakeServer()
  registerRosterTools(s.server)
  return { ...fake, handlers: s.handlers }
}

beforeEach(() => vi.resetModules())

describe('list_group_members', () => {
  it('returns member ids and names, and nothing else', async () => {
    const t = await setup({
      tables: {
        groups: [{ id: GROUP, name: 'Tuesday', timezone: 'America/New_York' }],
        // Even if a row carried more, the tool only reads and returns two things.
        group_members: [
          { id: 'm1', display_name: 'Old Name', role: 'owner', claim_code: 'SECRET', venmo_handle: 'dean-v', phone_number: '+12125550123', profiles: { display_name: 'Dean' } },
          { id: 'm2', display_name: 'Gilad', profiles: null },
        ],
      },
    })
    const r = await call(t.handlers, 'list_group_members', { group_id: GROUP })
    expect(r.json?.members).toEqual([
      { member_id: 'm1', name: 'Dean' },
      { member_id: 'm2', name: 'Gilad' },
    ])
    expect(r.text).not.toMatch(/SECRET|owner|venmo|\+1212|claim/i)
  })

  it('says not found for a group the user is not in', async () => {
    const t = await setup({ tables: { groups: [] } })
    const r = await call(t.handlers, 'list_group_members', { group_id: GROUP })
    expect(r.isError).toBe(true)
  })

  it('is data only: no picture data, and nothing for a screen', async () => {
    const t = await setup({
      tables: {
        groups: [{ id: GROUP, name: 'Tuesday', timezone: 'America/New_York' }],
        group_members: [{ id: 'm1', display_name: 'Amy', profile_id: 'u1', profiles: { display_name: 'Amy', avatar_url: 'u1/a.webp' } }],
      },
    })
    const raw = (await t.handlers.get('list_group_members')!({ group_id: GROUP } as never, {
      http: { authInfo: { token: 't', extra: { userId: 'u1' } } },
    } as never)) as { content: { text: string }[]; _meta?: unknown }
    expect(raw._meta).toBeUndefined()
    expect(raw.content[0].text).not.toMatch(/avatar|supabase|isMe/i)
  })
})

describe('get_whatsapp_summary', () => {
  const world = (over: Partial<FakeConfig['tables']> = {}, admin = true): FakeConfig => ({
    tables: {
      games: [
        {
          id: GAME,
          group_id: GROUP,
          name: 'Friday game',
          scheduled_at: '2026-10-10T00:00:00Z',
          started_at: null,
          status: 'settled',
          groups: { timezone: 'America/New_York' },
        },
      ],
      game_player_totals: [
        { member_id: 'g', display_name: 'Gilad', buyin_cents: 5000, net_cents: 8000 },
        { member_id: 'd', display_name: 'Dean', buyin_cents: 5000, net_cents: -8000 },
      ],
      settlements: [
        { from_member_id: 'd', to_member_id: 'g', amount_cents: 8000, status: 'confirmed' },
      ],
      group_members: [
        { id: 'g', display_name: 'Gilad (old)', profiles: { display_name: 'Gilad Bregman' } },
        { id: 'd', display_name: 'Dean', profiles: null },
      ],
      ...over,
    },
    rpc: { can_admin_game: () => ({ data: admin, error: null }) },
  })

  it('is exactly what the Copy button produces, from the same function', async () => {
    const t = await setup(world())
    const r = await call(t.handlers, 'get_whatsapp_summary', { game_id: GAME })
    const expected = settledGameSummary({
      title: 'Friday game',
      rows: [
        { name: 'Gilad', buyinCents: 5000, netCents: 8000 },
        { name: 'Dean', buyinCents: 5000, netCents: -8000 },
      ],
      transfers: [{ fromMemberId: 'd', toMemberId: 'g', amountCents: 8000, status: 'confirmed' }],
      names: new Map([
        ['g', 'Gilad Bregman'],
        ['d', 'Dean'],
      ]),
    })
    expect(r.json?.summary).toBe(expected)
    expect(String(r.json?.summary)).toMatch(/^🃏 Friday game\n\$100 pot · 2 players/)
    expect(String(r.json?.summary)).toMatch(/✅ Dean → Gilad Bregman  \$80/)
  })

  it('titles an unnamed game by the night it was played, in the group zone', async () => {
    const t = await setup(
      world({
        games: [
          { id: GAME, group_id: GROUP, name: null, scheduled_at: '2026-10-10T00:00:00Z', started_at: '2026-10-10T01:30:00Z', status: 'settled', groups: { timezone: 'America/New_York' } },
        ],
      })
    )
    const r = await call(t.handlers, 'get_whatsapp_summary', { game_id: GAME })
    expect(String(r.json?.summary)).toMatch(/^🃏 Oct 9, 2026\n/)
  })

  it('is for the game admin only', async () => {
    const t = await setup(world({}, false))
    const r = await call(t.handlers, 'get_whatsapp_summary', { game_id: GAME })
    expect(r.isError).toBe(true)
    expect(r.text).toBe('Only the game admin can get the summary.')
  })

  it('needs a settled game with payments', async () => {
    const open = await setup(
      world({
        games: [{ id: GAME, group_id: GROUP, name: 'x', scheduled_at: '2026-10-10T00:00:00Z', started_at: null, status: 'active', groups: { timezone: 'America/New_York' } }],
      })
    )
    expect((await call(open.handlers, 'get_whatsapp_summary', { game_id: GAME })).text).toMatch(/not settled yet/)
    const none = await setup(world({ settlements: [] }))
    expect((await call(none.handlers, 'get_whatsapp_summary', { game_id: GAME })).text).toMatch(/no payments/)
  })
})
