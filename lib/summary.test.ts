import { describe, expect, it } from 'vitest'
import { gameSummary, settledGameSummary } from './summary'

const rows = [
  { name: 'Gilad', buyinCents: 5000, netCents: 8000 },
  { name: 'Dean', buyinCents: 5000, netCents: -8000 },
  { name: 'Sam', buyinCents: 5000, netCents: 0 },
]
const names = new Map([
  ['g', 'Gilad Bregman'],
  ['d', 'Dean K'],
])
const transfers = [
  { fromMemberId: 'd', toMemberId: 'g', amountCents: 8000, status: 'confirmed' },
  { fromMemberId: 'x', toMemberId: 'g', amountCents: 100, status: 'pending' },
]

describe('the settled-game summary', () => {
  it('is exactly gameSummary fed from the game screen\'s rows', () => {
    const viaShared = settledGameSummary({ title: 'Friday game', rows, transfers, names })
    const byHand = gameSummary({
      title: 'Friday game',
      potCents: 15000,
      players: [
        { name: 'Gilad', netCents: 8000 },
        { name: 'Dean', netCents: -8000 },
        { name: 'Sam', netCents: 0 },
      ],
      transfers: [
        { fromName: 'Dean K', toName: 'Gilad Bregman', amountCents: 8000, confirmed: true },
        { fromName: 'Someone', toName: 'Gilad Bregman', amountCents: 100, confirmed: false },
      ],
    })
    expect(viaShared).toBe(byHand)
  })

  it('reads the way it is pasted into the chat', () => {
    expect(settledGameSummary({ title: 'Friday game', rows, transfers, names })).toBe(
      [
        '🃏 Friday game',
        '$150 pot · 3 players',
        '',
        'Gilad  +$80',
        'Sam  $0',
        'Dean  -$80',
        '',
        'Payments',
        '✅ Dean K → Gilad Bregman  $80',
        '• Someone → Gilad Bregman  $1',
        '',
        '1 of 2 settled',
      ].join('\n')
    )
  })
})
