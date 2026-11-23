import { describe, expect, it } from 'vitest'
import {
  centsToWholeDollars,
  formatWholeDollars,
  roundToWholeDollar,
  wholeDollarsInput,
} from './money'

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

describe('wholeDollarsInput', () => {
  it('keeps digits only', () => {
    expect(wholeDollarsInput('600')).toBe('600')
    expect(wholeDollarsInput('$1,200')).toBe('1200')
    expect(wholeDollarsInput('')).toBe('')
  })
  it('drops everything from the decimal point on, never joins the cents', () => {
    expect(wholeDollarsInput('600.50')).toBe('600')
    expect(wholeDollarsInput('50.')).toBe('50')
    expect(wholeDollarsInput('.75')).toBe('')
  })
})

describe('formatWholeDollars', () => {
  it('rounds totals to whole dollars, halves away from zero', () => {
    expect(
      [0, 4999, 5050, -1250, -1249, 123456789, 115000].map(formatWholeDollars),
    ).toEqual(['$0', '$50', '$51', '-$13', '-$12', '$1,234,568', '$1,150'])
  })

  it('never shows a sign on an amount that rounds to zero', () => {
    expect(formatWholeDollars(-40)).toBe('$0')
    expect(roundToWholeDollar(-40)).toBe(0)
    expect(Object.is(roundToWholeDollar(-40), -0)).toBe(false)
    expect(roundToWholeDollar(30)).toBe(0)
  })
})
