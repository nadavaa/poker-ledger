import { describe, expect, it } from 'vitest'
import { centsToWholeDollars } from './money'

describe('centsToWholeDollars', () => {
  it('shows whole dollars with no decimals', () => {
    expect(centsToWholeDollars(5000)).toBe('50')
    expect(centsToWholeDollars(120000)).toBe('1200')
    expect(centsToWholeDollars(0)).toBe('0')
  })
  it('rounds a stray remainder to the nearest dollar', () => {
    expect(centsToWholeDollars(5049)).toBe('50')
    expect(centsToWholeDollars(5050)).toBe('51')
  })
})
