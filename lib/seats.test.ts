import { describe, expect, it } from 'vitest'
import {
  applyPromotion,
  overfillPrompt,
  seatLabel,
  seatNote,
  seatState,
} from './seats'

describe('an overfilled game', () => {
  it('reads 9/8, never clamped to 8/8', () => {
    expect(seatLabel(9, 8)).toBe('9/8')
    expect(seatState(9, 8)).toBe('over')
    expect(seatNote(9, 8)).toBe('1 over')
    expect(seatNote(11, 8)).toBe('3 over')
  })

  it('still says full at exactly the limit and free below it', () => {
    expect(seatNote(8, 8)).toBe('table full')
    expect(seatNote(5, 8)).toBe('3 free')
  })

  it('asks the admin with the numbers in the question', () => {
    expect(overfillPrompt('Dean', 8, 8)).toBe(
      'This game is full (8/8). Adding Dean will make it 9 players. Continue?'
    )
  })
})

describe('promoting from the waitlist', () => {
  it('fills to the limit, then the admin goes one over on confirm', () => {
    let confirmed = 0
    const limit = 8
    for (let i = 0; i < limit; i++) {
      const r = applyPromotion({ confirmed, limit, asAdmin: true, allowOverfill: false })
      expect(r.status).toBe('confirmed')
      confirmed = r.confirmed
    }
    expect(confirmed).toBe(8)
    expect(seatNote(confirmed, limit)).toBe('table full')

    // The first tap at the limit is refused, which is what opens the prompt.
    const asked = applyPromotion({ confirmed, limit, asAdmin: true, allowOverfill: false })
    expect(asked.status).toBe('refused')
    expect(asked.confirmed).toBe(8)

    // Confirming seats them. The limit is not raised; the count passes it.
    const over = applyPromotion({ confirmed, limit, asAdmin: true, allowOverfill: true })
    expect(over.status).toBe('confirmed')
    expect(over.confirmed).toBe(9)
    expect(seatLabel(over.confirmed, limit)).toBe('9/8')
  })

  it('never lets a member self-seat past the limit', () => {
    const r = applyPromotion({ confirmed: 8, limit: 8, asAdmin: false, allowOverfill: true })
    expect(r.status).toBe('waitlist')
    expect(r.confirmed).toBe(8)
  })

  it('keeps going past the limit if the admin keeps confirming', () => {
    let confirmed = 8
    for (let i = 0; i < 3; i++) {
      confirmed = applyPromotion({ confirmed, limit: 8, asAdmin: true, allowOverfill: true }).confirmed
    }
    expect(confirmed).toBe(11)
    expect(seatNote(confirmed, 8)).toBe('3 over')
  })
})
