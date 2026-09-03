import { describe, expect, it } from 'vitest'
import {
  canConfirm,
  canPay,
  settlementProgress,
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

describe('settlementProgress', () => {
  const t = (
    from: string,
    to: string,
    status: string,
    id = `${from}${to}${status}`
  ) => ({ id, fromMemberId: from, toMemberId: to, status })

  it('counts only the viewer’s transfers for a player', () => {
    const rows = [
      t('me', 'a', 'pending'),
      t('me', 'b', 'pending'),
      t('c', 'd', 'pending'),
      t('e', 'f', 'confirmed'),
    ]
    expect(settlementProgress(rows, 'me', false)).toEqual({
      total: 2,
      confirmed: 0,
    })
  })

  it('counts the whole game for the admin', () => {
    const rows = [
      t('me', 'a', 'confirmed'),
      t('c', 'd', 'pending'),
      t('e', 'f', 'pending'),
    ]
    expect(settlementProgress(rows, 'me', true)).toEqual({
      total: 3,
      confirmed: 1,
    })
  })

  it('collapses poker and food between the same pair into one item', () => {
    const rows = [
      { ...t('me', 'a', 'pending'), id: 'poker' },
      { ...t('me', 'a', 'pending'), id: 'food' },
    ]
    expect(settlementProgress(rows, 'me', false)).toEqual({
      total: 1,
      confirmed: 0,
    })
  })

  it('leaves a pair open until every row under it is confirmed', () => {
    const rows = [
      { ...t('me', 'a', 'confirmed'), id: 'poker' },
      { ...t('me', 'a', 'pending'), id: 'food' },
    ]
    expect(settlementProgress(rows, 'me', false)).toEqual({
      total: 1,
      confirmed: 0,
    })

    const both = [
      { ...t('me', 'a', 'confirmed'), id: 'poker' },
      { ...t('me', 'a', 'confirmed'), id: 'food' },
    ]
    expect(settlementProgress(both, 'me', false)).toEqual({
      total: 1,
      confirmed: 1,
    })
  })

  it('treats a pair as one item regardless of direction', () => {
    const rows = [t('me', 'a', 'pending'), t('a', 'me', 'pending')]
    expect(settlementProgress(rows, 'me', false)).toEqual({
      total: 1,
      confirmed: 0,
    })
  })

  it('does not count paid as done', () => {
    expect(
      settlementProgress([t('me', 'a', 'paid')], 'me', false)
    ).toEqual({ total: 1, confirmed: 0 })
  })

  it('reports nothing when the viewer broke even', () => {
    const rows = [t('c', 'd', 'pending')]
    expect(settlementProgress(rows, 'me', false)).toEqual({
      total: 0,
      confirmed: 0,
    })
  })
})
