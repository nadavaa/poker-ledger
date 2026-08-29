import { describe, expect, it } from 'vitest'
import { formatPhone, resolvePaymentOptions } from './payment'

const VENMO = 'gilad'
const PHONE = '+15551234567'

describe('resolvePaymentOptions', () => {
  it('offers venmo alone when that is all there is', () => {
    const r = resolvePaymentOptions({ profileVenmo: VENMO })
    expect(r.primary).toEqual({ method: 'venmo', value: VENMO })
    expect(r.secondary).toBeNull()
  })

  it('offers zelle alone when that is all there is', () => {
    const r = resolvePaymentOptions({ profilePhone: PHONE })
    expect(r.primary).toEqual({ method: 'zelle', value: PHONE })
    expect(r.secondary).toBeNull()
  })

  it('leads with venmo when both are on file and venmo is preferred', () => {
    const r = resolvePaymentOptions({
      profileVenmo: VENMO,
      profilePhone: PHONE,
      preferred: 'venmo',
    })
    expect(r.primary?.method).toBe('venmo')
    expect(r.secondary?.method).toBe('zelle')
  })

  it('leads with zelle when both are on file and zelle is preferred', () => {
    const r = resolvePaymentOptions({
      profileVenmo: VENMO,
      profilePhone: PHONE,
      preferred: 'zelle',
    })
    expect(r.primary?.method).toBe('zelle')
    expect(r.secondary?.method).toBe('venmo')
  })

  it('still offers both when no preference is set', () => {
    const r = resolvePaymentOptions({
      profileVenmo: VENMO,
      profilePhone: PHONE,
    })
    expect(r.primary).not.toBeNull()
    expect(r.secondary).not.toBeNull()
  })

  it('ignores a preference for a method they have not got', () => {
    const r = resolvePaymentOptions({
      profileVenmo: VENMO,
      preferred: 'zelle',
    })
    expect(r.primary).toEqual({ method: 'venmo', value: VENMO })
    expect(r.secondary).toBeNull()
  })

  it('offers nothing when neither is on file', () => {
    expect(resolvePaymentOptions({})).toEqual({
      primary: null,
      secondary: null,
    })
    expect(
      resolvePaymentOptions({ profileVenmo: '  ', profilePhone: '' })
    ).toEqual({ primary: null, secondary: null })
  })

  it('lets the member row override the profile, for both methods', () => {
    const r = resolvePaymentOptions({
      memberVenmo: '@group-handle',
      profileVenmo: VENMO,
      memberPhone: '+15559998888',
      profilePhone: PHONE,
      preferred: 'venmo',
    })
    expect(r.primary).toEqual({ method: 'venmo', value: 'group-handle' })
    expect(r.secondary).toEqual({ method: 'zelle', value: '+15559998888' })
  })

  it('falls back to the profile when the override is blank', () => {
    const r = resolvePaymentOptions({
      memberVenmo: null,
      profileVenmo: VENMO,
      memberPhone: '   ',
      profilePhone: PHONE,
      preferred: 'zelle',
    })
    expect(r.primary).toEqual({ method: 'zelle', value: PHONE })
    expect(r.secondary).toEqual({ method: 'venmo', value: VENMO })
  })
})

describe('formatPhone', () => {
  it('renders E.164 as a US number', () => {
    expect(formatPhone('+15551234567')).toBe('(555) 123-4567')
  })

  it('leaves anything unexpected alone', () => {
    expect(formatPhone('+442071234567')).toBe('+442071234567')
  })
})
