import { describe, expect, it } from 'vitest'
import { formatPhone, parseUsPhone, resolvePaymentOptions } from './payment'

const VENMO = 'gilad'
const PHONE = '+15552345678'

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
    expect(formatPhone('+15552345678')).toBe('(555) 234-5678')
  })

  it('leaves anything unexpected alone', () => {
    expect(formatPhone('+442071234567')).toBe('+442071234567')
  })
})

describe('parseUsPhone', () => {
  it('normalises anything a person might type to E.164', () => {
    for (const typed of [
      '5552345678',
      '(555) 234-5678',
      '555-234-5678',
      '+1 555 234 5678',
      '1 (555) 234 5678',
    ]) {
      expect(parseUsPhone(typed)).toEqual({ value: '+15552345678', valid: true })
    }
  })

  it('treats an empty field as valid and unset', () => {
    expect(parseUsPhone('')).toEqual({ value: null, valid: true })
    expect(parseUsPhone('   ')).toEqual({ value: null, valid: true })
    expect(parseUsPhone(null)).toEqual({ value: null, valid: true })
  })

  it('rejects wrong lengths and impossible codes', () => {
    expect(parseUsPhone('12345').valid).toBe(false)
    expect(parseUsPhone('555123456789').valid).toBe(false)
    expect(parseUsPhone('0551234567').valid).toBe(false) // area code starts 0
    expect(parseUsPhone('1551234567').valid).toBe(false) // area code starts 1
    expect(parseUsPhone('5550234567').valid).toBe(false) // exchange starts 0
  })

  it('round-trips with formatPhone', () => {
    const { value } = parseUsPhone('(555) 234-5678')
    expect(formatPhone(value!)).toBe('(555) 234-5678')
    expect(parseUsPhone(formatPhone(value!)).value).toBe(value)
  })
})
