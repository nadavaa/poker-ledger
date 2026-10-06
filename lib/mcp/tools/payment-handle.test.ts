import { beforeEach, describe, expect, it, vi } from 'vitest'
import { call, fakeServer, makeFakeDb, mockAuth, type FakeConfig } from './harness'
import { lastFour } from './payment-handle'

const saved = (venmo: string | null, phone: string | null) =>
  ({
    my_payment_details: () => ({
      data: [{ venmo_handle: venmo, phone_number: phone, preferred_payment_method: 'zelle' }],
      error: null,
    }),
    set_my_payment_details: () => ({ data: null, error: null }),
  }) satisfies FakeConfig['rpc']

async function setup(rpc: FakeConfig['rpc']) {
  vi.resetModules()
  const fake = makeFakeDb({ rpc })
  mockAuth(fake.db)
  const { registerPaymentHandleTool } = await import('./payment-handle')
  const s = fakeServer()
  registerPaymentHandleTool(s.server)
  return { ...fake, handlers: s.handlers }
}

const sent = (calls: { kind: string; name: string; args: unknown }[]) =>
  calls.find((c) => c.name === 'set_my_payment_details')?.args

beforeEach(() => vi.resetModules())

describe('update_payment_handle', () => {
  it('accepts a Venmo handle with the @ and stores it without', async () => {
    const t = await setup(saved(null, null))
    const r = await call(t.handlers, 'update_payment_handle', { venmo: '@gilad-g' })
    expect(r.json).toMatchObject({ saved: true, venmo: 'gilad-g' })
    expect(sent(t.calls)).toMatchObject({ p_venmo_handle: 'gilad-g' })
  })

  it('keeps what it was not told about: the phone and the preference survive a Venmo change', async () => {
    const t = await setup(saved('old', '+12125550123'))
    await call(t.handlers, 'update_payment_handle', { venmo: 'new' })
    expect(sent(t.calls)).toEqual({
      p_venmo_handle: 'new',
      p_phone: '+12125550123',
      p_preferred: 'zelle',
    })
  })

  it('shows only the last four digits of a phone, never the number', async () => {
    const t = await setup(saved(null, null))
    const r = await call(t.handlers, 'update_payment_handle', { zelle_phone: '(212) 555-0123' })
    expect(r.json).toMatchObject({ saved: true, zelle: 'ending 0123' })
    expect(r.text).not.toMatch(/555.?0123|5550123/)
    expect(sent(t.calls)).toMatchObject({ p_phone: '+12125550123' })
  })

  it('never echoes a stored phone it was only passing through', async () => {
    const t = await setup(saved(null, '+13125550987'))
    const r = await call(t.handlers, 'update_payment_handle', { venmo: 'x' })
    expect(r.text).not.toMatch(/5550987|555.?0987/)
    expect(r.json?.zelle).toBe('ending 0987')
  })

  it('an empty string removes a field', async () => {
    const t = await setup(saved('old', '+12125550123'))
    const r = await call(t.handlers, 'update_payment_handle', { zelle_phone: '' })
    expect(r.json).toMatchObject({ zelle: null, venmo: 'old' })
    expect(sent(t.calls)).toMatchObject({ p_phone: null, p_venmo_handle: 'old' })
  })

  it('applies the Settings validation', async () => {
    const t = await setup(saved(null, null))
    const email = await call(t.handlers, 'update_payment_handle', { venmo: 'me@example.com' })
    expect(email.isError).toBe(true)
    expect(email.text).toMatch(/@ at the front/)
    const phone = await call(t.handlers, 'update_payment_handle', { zelle_phone: '12345' })
    expect(phone.isError).toBe(true)
    expect(phone.text).toMatch(/valid US phone/)
    expect(sent(t.calls)).toBeUndefined()
  })

  it('needs something to save', async () => {
    const t = await setup(saved(null, null))
    const r = await call(t.handlers, 'update_payment_handle', {})
    expect(r.isError).toBe(true)
  })
})

describe('lastFour', () => {
  it('is the tail only', () => {
    expect(lastFour('+12125550123')).toBe('ending 0123')
    expect(lastFour(null)).toBeNull()
  })
})
