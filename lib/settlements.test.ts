import { describe, expect, it } from 'vitest'
import {
  canConfirm,
  canPay,
  settlementRole,
  type SettlementParties,
} from './settlements'

const transfer: SettlementParties = {
  fromMemberId: 'member-x',
  toMemberId: 'member-y',
}

describe('settlementRole', () => {
  it('puts the from_member on the paying side', () => {
    expect(settlementRole(transfer, 'member-x')).toBe('payer')
  })

  it('puts the to_member on the receiving side', () => {
    expect(settlementRole(transfer, 'member-y')).toBe('payee')
  })

  it('treats everyone else as a bystander, admin included', () => {
    expect(settlementRole(transfer, 'member-z')).toBe('bystander')
    expect(settlementRole(transfer, null)).toBe('bystander')
  })
})

describe('who gets which action', () => {
  it('gives the payer a pay action and the payee none', () => {
    const payer = settlementRole(transfer, 'member-x')
    const payee = settlementRole(transfer, 'member-y')

    expect(canPay(payer)).toBe(true)
    expect(canPay(payee)).toBe(false)
  })

  it('gives the payee a confirm action and the payer none', () => {
    const payer = settlementRole(transfer, 'member-x')
    const payee = settlementRole(transfer, 'member-y')

    expect(canConfirm(payee, 'pending')).toBe(true)
    expect(canConfirm(payer, 'pending')).toBe(false)
  })

  it('lets the payee confirm without the payer marking paid first', () => {
    const payee = settlementRole(transfer, 'member-y')
    expect(canConfirm(payee, 'pending')).toBe(true)
    expect(canConfirm(payee, 'paid')).toBe(true)
  })

  it('offers nothing once confirmed', () => {
    expect(canConfirm(settlementRole(transfer, 'member-y'), 'confirmed')).toBe(
      false
    )
  })

  it('gives a bystander nothing', () => {
    const bystander = settlementRole(transfer, 'member-z')
    expect(canPay(bystander)).toBe(false)
    expect(canConfirm(bystander, 'pending')).toBe(false)
  })
})
