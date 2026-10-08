import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeServer, makeFakeDb, mockAuth, type FakeConfig } from './harness'

const GROUP = '8b1f0000-0000-4000-8000-0000000000aa'
const CTX = { http: { authInfo: { token: 't', extra: { userId: 'u1' } } } } as never

type Raw = { isError?: boolean; content: { text: string }[]; _meta?: Record<string, Record<string, unknown>> }

async function setup(config: FakeConfig) {
  vi.resetModules()
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://proj.supabase.co'
  const fake = makeFakeDb(config)
  mockAuth(fake.db)
  const { registerGroupTools } = await import('./groups')
  const s = fakeServer()
  registerGroupTools(s.server)
  const run = async (name: string) => (await s.handlers.get(name)!({} as never, CTX)) as Raw
  return { ...fake, handlers: s.handlers, run }
}

beforeEach(() => vi.resetModules())

describe('a lookup and its screen', () => {
  const world: FakeConfig = {
    tables: {
      group_members: [
        { id: 'm1', group_id: GROUP, role: 'owner', groups: { id: GROUP, name: 'wef', timezone: 'America/New_York', avatar_url: 'g/a.webp' } },
      ],
      member_lifetime: [{ member_id: 'm1', lifetime_net_cents: 15500 }],
    },
  }

  it('registers both tools', async () => {
    const t = await setup(world)
    expect([...t.handlers.keys()].sort()).toEqual(['list_my_groups', 'show_groups'])
  })

  it('gives the lookup and the screen the same text, to the byte', async () => {
    const t = await setup(world)
    const data = await t.run('list_my_groups')
    const shown = await t.run('show_groups')
    expect(shown.content[0].text).toBe(data.content[0].text)
    expect(JSON.parse(data.content[0].text).groups[0]).toMatchObject({ group_id: GROUP, name: 'wef', my_role: 'owner' })
  })

  it('hands the page its pictures and counts only through the screen', async () => {
    const t = await setup(world)
    const data = await t.run('list_my_groups')
    expect(data._meta).toBeUndefined()
    const shown = await t.run('show_groups')
    expect(shown._meta?.['poker-ledger/ui'].groups).toEqual([
      {
        id: GROUP,
        avatar: 'https://proj.supabase.co/storage/v1/object/public/group-avatars/g/a.webp',
        members: 1,
        lifetime: { cents: 15500, display: '$155' },
      },
    ])
  })
})
