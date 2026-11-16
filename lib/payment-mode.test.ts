import { describe, expect, it } from 'vitest'
import { isCashTransfer, parsePaymentMode, paymentModeLabel } from './payment-mode'

describe('payment mode', () => {
  it('parses only known modes', () => {
    expect(parsePaymentMode('cash')).toBe('cash')
    expect(parsePaymentMode('hybrid')).toBe('hybrid')
    expect(parsePaymentMode('online')).toBe('online')
    expect(parsePaymentMode('venmo')).toBeNull()
    expect(parsePaymentMode(null)).toBeNull()
  })

  it('labels hybrid as Mix', () => {
    expect(paymentModeLabel('hybrid')).toBe('Mix')
  })

  it('draws every transfer as cash in a cash game', () => {
    expect(isCashTransfer('cash', 'app')).toBe(true)
    expect(isCashTransfer('cash', undefined)).toBe(true)
  })

  it('follows the row method otherwise', () => {
    expect(isCashTransfer('hybrid', 'cash')).toBe(true)
    expect(isCashTransfer('hybrid', 'app')).toBe(false)
    expect(isCashTransfer('online', 'app')).toBe(false)
  })
})
