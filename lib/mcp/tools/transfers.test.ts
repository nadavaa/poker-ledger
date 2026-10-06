import { beforeEach, describe, expect, it, vi } from 'vitest'
import { call, fakeServer, makeFakeDb, mockAuth, type FakeConfig } from './harness'

const T = '7a1f0000-0000-4000-8000-000000000001'

const settlement = (over: Record<string, unknown> = {}) => ({
  id: T,
  game_id: 'g1',
  from_member_id: 'me',
  to_member_id: 'gilad',
  amount_cents: 8000,
  status: 'pending',
  kind: 'poker',
  ...over,
})

const world = (s: Record<string, unknown>, extra: Partial<FakeConfig> = {}): FakeConfig => ({
  tables: {
    settlements: [s],
    games: [
      {
        id: 'g1',
        group_id: 'grp',
        scheduled_at: '2026-10-02T23:00:00Z',
        started_at: null,
        groups: { timezone: 'America/New_York' },
      },
    ],
    // Looked up by profile for "me", and by member id for the other person.
    group_members: (eq) =>
      eq.profile_id
        ? [{ id: 'me' }]
        : [{ display_name: 'Gilad', profiles: { display_name: 'Gilad' } }],
  },
  ...extra,
})

async function setup(config: FakeConfig) {
  vi.resetModules()
  const fake = makeFakeDb(config)
  mockAuth(fake.db)
  const { registerTransferTools } = await import('./transfers')
  const s = fakeServer()
  registerTransferTools(s.server)
  return { ...fake, handlers: s.handlers }
}

const updates = (calls: { kind: string; name: string; args: unknown }[]) =>
  calls.filter((c) => c.kind === 'update')

beforeEach(() => vi.resetModules())

describe('mark_transfer_paid', () => {
  it('previews in plain words and writes nothing', async () => {
    const t = await setup(world(settlement()))
    const r = await call(t.handlers, 'mark_transfer_paid', { transfer_id: T })
    expect(String(r.json?.preview)).toMatch(/You're marking that you paid Gilad \$80 for poker from Oct 2, 2026/)
    expect(r.json?.next_step).toMatch(/wait for an explicit yes/)
    expect(updates(t.calls)).toHaveLength(0)
  })

  it('commits with the token: the same update the Paid button makes', async () => {
    const t = await setup(world(settlement()))
    const p = await call(t.handlers, 'mark_transfer_paid', { transfer_id: T })
    const done = await call(t.handlers, 'mark_transfer_paid', {
      transfer_id: T,
      confirmation_token: p.json?.confirmation_token,
    })
    expect(done.json).toMatchObject({ changed: true, status: 'paid' })
    expect(updates(t.calls)).toEqual([
      { kind: 'update', name: 'settlements', args: { status: 'paid' } },
    ])
  })

  it('will not commit without a valid token, or twice with one', async () => {
    const t = await setup(world(settlement()))
    const bad = await call(t.handlers, 'mark_transfer_paid', { transfer_id: T, confirmation_token: 'forged.token' })
    expect(bad.isError).toBe(true)

    const p = await call(t.handlers, 'mark_transfer_paid', { transfer_id: T })
    const token = p.json?.confirmation_token
    await call(t.handlers, 'mark_transfer_paid', { transfer_id: T, confirmation_token: token })
    const replay = await call(t.handlers, 'mark_transfer_paid', { transfer_id: T, confirmation_token: token })
    expect(replay.isError).toBe(true)
    expect(updates(t.calls)).toHaveLength(1)
  })

  it('a token from a mark-paid preview cannot confirm receipt', async () => {
    const t = await setup(world(settlement({ from_member_id: 'gilad', to_member_id: 'me' })))
    // I am the payee here, so the confirm tool is the legitimate one; the
    // paid-preview token must still not work on it.
    const forged = await call(t.handlers, 'mark_transfer_paid', { transfer_id: T })
    expect(forged.isError).toBe(true) // payee cannot mark paid at all
  })

  it('refuses when the user is the payee, not the payer', async () => {
    const t = await setup(world(settlement({ from_member_id: 'gilad', to_member_id: 'me' })))
    const r = await call(t.handlers, 'mark_transfer_paid', { transfer_id: T })
    expect(r.isError).toBe(true)
    expect(r.text).toMatch(/who owes/)
  })

  it('says a transfer between other people does not exist (row-level security)', async () => {
    const config = world(settlement())
    config.tables!.settlements = []
    const t = await setup(config)
    const r = await call(t.handlers, 'mark_transfer_paid', { transfer_id: T })
    expect(r.isError).toBe(true)
    expect(r.text).toMatch(/not found, or it is not yours/)
  })

  it('is idempotent: already paid is a plain answer', async () => {
    const t = await setup(world(settlement({ status: 'paid' })))
    const r = await call(t.handlers, 'mark_transfer_paid', { transfer_id: T })
    expect(r.isError).toBe(false)
    expect(r.json).toMatchObject({ changed: false })
    expect(r.json).not.toHaveProperty('confirmation_token')
  })

  it('turns a trigger refusal into a short sentence', async () => {
    const config = world(settlement())
    config.updates = {
      settlements: { data: null, error: { message: 'only the payer can mark this paid', code: 'P0001' } },
    }
    const t = await setup(config)
    const p = await call(t.handlers, 'mark_transfer_paid', { transfer_id: T })
    const r = await call(t.handlers, 'mark_transfer_paid', { transfer_id: T, confirmation_token: p.json?.confirmation_token })
    expect(r.isError).toBe(true)
    expect(r.text).toBe('Only the person who owes this transfer can mark it paid.')
  })
})

describe('confirm_transfer_received', () => {
  const mine = (status: string) =>
    settlement({ from_member_id: 'gilad', to_member_id: 'me', status })

  it('previews, warns it cannot be undone, then commits', async () => {
    const t = await setup(world(mine('paid')))
    const p = await call(t.handlers, 'confirm_transfer_received', { transfer_id: T })
    expect(String(p.json?.preview)).toMatch(/cannot be undone/)
    const done = await call(t.handlers, 'confirm_transfer_received', {
      transfer_id: T,
      confirmation_token: p.json?.confirmation_token,
    })
    expect(done.json).toMatchObject({ changed: true, status: 'confirmed' })
    expect(updates(t.calls)).toEqual([
      { kind: 'update', name: 'settlements', args: { status: 'confirmed' } },
    ])
  })

  it('follows the database: allowed while the payer has not marked it paid', async () => {
    const t = await setup(world(mine('pending')))
    const p = await call(t.handlers, 'confirm_transfer_received', { transfer_id: T })
    expect(p.json).toMatchObject({ needs_confirmation: true })
    expect(String(p.json?.preview)).toMatch(/has not marked it paid/)
  })

  it('refuses when the user is the payer', async () => {
    const t = await setup(world(settlement({ status: 'paid' })))
    const r = await call(t.handlers, 'confirm_transfer_received', { transfer_id: T })
    expect(r.isError).toBe(true)
    expect(r.text).toMatch(/person being paid/)
    expect(updates(t.calls)).toHaveLength(0)
  })

  it('is idempotent once confirmed', async () => {
    const t = await setup(world(mine('confirmed')))
    const r = await call(t.handlers, 'confirm_transfer_received', { transfer_id: T })
    expect(r.json).toMatchObject({ changed: false })
  })

  it('an update that matches no row, as row-level security does, is a refusal', async () => {
    const config = world(mine('paid'))
    config.updates = { settlements: { data: [], error: null } }
    const t = await setup(config)
    const p = await call(t.handlers, 'confirm_transfer_received', { transfer_id: T })
    const r = await call(t.handlers, 'confirm_transfer_received', { transfer_id: T, confirmation_token: p.json?.confirmation_token })
    expect(r.isError).toBe(true)
    expect(r.text).toMatch(/Nothing was changed/)
  })

  it('never lets a preview token for one transfer confirm another', async () => {
    const t = await setup(world(mine('paid')))
    const p = await call(t.handlers, 'confirm_transfer_received', { transfer_id: T })
    const other = '7a1f0000-0000-4000-8000-000000000002'
    const r = await call(t.handlers, 'confirm_transfer_received', { transfer_id: other, confirmation_token: p.json?.confirmation_token })
    expect(r.isError).toBe(true)
    expect(updates(t.calls)).toHaveLength(0)
  })
})
