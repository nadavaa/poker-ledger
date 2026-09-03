import { describe, expect, it } from 'vitest'
import {
  describeEdit,
  isEditable,
  lockReason,
  planSeatLimit,
  validateEdit,
  type EditFields,
  type EditableField,
  type GameStatus,
} from './game-edit'

const ALL: EditableField[] = [
  'name',
  'location',
  'scheduledAt',
  'seatLimit',
  'buyinCents',
  'chipsPerDollar',
]

const fields = (over: Partial<EditFields> = {}): EditFields => ({
  name: 'Tuesday',
  location: "Nadav's",
  scheduledAt: '2099-01-01T20:00',
  seatLimit: '8',
  buyinCents: '5000',
  chipsPerDollar: '100',
  ...over,
})

describe('a scheduled game', () => {
  it('lets every field be edited', () => {
    for (const f of ALL) {
      expect(lockReason('scheduled', f)).toBeNull()
    }
    expect(isEditable('scheduled')).toBe(true)
  })
})

describe('an active game', () => {
  it('still takes a name and a location', () => {
    expect(lockReason('active', 'name')).toBeNull()
    expect(lockReason('active', 'location')).toBeNull()
  })

  it('locks everything the money was priced against', () => {
    for (const f of ['scheduledAt', 'seatLimit', 'buyinCents', 'chipsPerDollar'] as const) {
      expect(lockReason('active', f)).toBeTruthy()
    }
  })

  it('says why the chip ratio in particular is frozen', () => {
    expect(lockReason('active', 'chipsPerDollar')).toContain('stack')
    expect(lockReason('active', 'buyinCents')).toContain('pot')
  })
})

describe('a finished game', () => {
  it('is not editable at all, and says which kind of finished', () => {
    for (const status of ['settled', 'cancelled', 'reconciling'] as GameStatus[]) {
      expect(isEditable(status)).toBe(false)
      for (const f of ALL) expect(lockReason(status, f)).toBeTruthy()
    }
    expect(lockReason('cancelled', 'name')).toContain('called off')
    expect(lockReason('settled', 'name')).toContain('finished')
  })
})

describe('validateEdit', () => {
  it('accepts a sane form', () => {
    const { errors } = validateEdit(fields())
    expect(errors).toEqual({})
  })

  it('rejects a date that is not a date', () => {
    expect(validateEdit(fields({ scheduledAt: 'next tuesday' })).errors.scheduledAt)
      .toBeTruthy()
    expect(validateEdit(fields({ scheduledAt: '' })).errors.scheduledAt).toBeTruthy()
  })

  it('warns about a past date but allows it', () => {
    const now = new Date('2026-09-03T00:00:00Z')
    const p = validateEdit(fields({ scheduledAt: '2026-08-01T20:00' }), now)
    expect(p.errors.scheduledAt).toBeUndefined()
    expect(p.warnings.scheduledAt).toContain('past')
  })

  it('requires a positive buy-in and chip ratio', () => {
    expect(validateEdit(fields({ buyinCents: '0' })).errors.buyinCents).toBeTruthy()
    expect(validateEdit(fields({ buyinCents: '-100' })).errors.buyinCents).toBeTruthy()
    expect(validateEdit(fields({ chipsPerDollar: '0' })).errors.chipsPerDollar).toBeTruthy()
    expect(validateEdit(fields({ chipsPerDollar: '-1' })).errors.chipsPerDollar).toBeTruthy()
  })

  it('requires at least one seat', () => {
    expect(validateEdit(fields({ seatLimit: '0' })).errors.seatLimit).toBeTruthy()
    expect(validateEdit(fields({ seatLimit: '1' })).errors.seatLimit).toBeUndefined()
    expect(validateEdit(fields({ seatLimit: '2.5' })).errors.seatLimit).toBeTruthy()
  })
})

describe('planSeatLimit', () => {
  it('fills the new seats from the waitlist, in order', () => {
    expect(planSeatLimit({ next: 10, confirmedCount: 8, waitlistCount: 3 })).toEqual({
      ok: true,
      promotes: 2,
    })
  })

  it('promotes only as many as are actually waiting', () => {
    expect(planSeatLimit({ next: 12, confirmedCount: 8, waitlistCount: 1 })).toEqual({
      ok: true,
      promotes: 1,
    })
    expect(planSeatLimit({ next: 12, confirmedCount: 8, waitlistCount: 0 })).toEqual({
      ok: true,
      promotes: 0,
    })
  })

  it('blocks lowering below the confirmed count instead of demoting anyone', () => {
    const r = planSeatLimit({ next: 6, confirmedCount: 8, waitlistCount: 0 })
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.reason).toContain('waitlist')
    expect(r.ok === false && r.reason).toContain('8')
  })

  it('allows lowering down to exactly the confirmed count', () => {
    expect(planSeatLimit({ next: 8, confirmedCount: 8, waitlistCount: 2 })).toEqual({
      ok: true,
      promotes: 0,
    })
  })

  it('refuses a table with no seats', () => {
    expect(planSeatLimit({ next: 0, confirmedCount: 0, waitlistCount: 0 }).ok).toBe(false)
  })
})

describe('describeEdit', () => {
  const fmt = {
    money: (c: number) => `$${(c / 100).toFixed(2)}`,
    when: () => '8:30 PM',
  }
  const edit = (field: string, newValue: string | null) => ({
    field,
    oldValue: null,
    newValue,
    editedByName: 'Nadav',
  })

  it('says what a player cares about, not which column moved', () => {
    expect(describeEdit(edit('scheduled_at', '2026-09-06T20:30'), fmt)).toBe(
      'Nadav changed the start time to 8:30 PM'
    )
    expect(describeEdit(edit('location', "Guy's place"), fmt)).toBe(
      "Nadav moved the game to Guy's place"
    )
    expect(describeEdit(edit('default_buyin_cents', '5000'), fmt)).toBe(
      'Nadav changed the buy-in to $50.00'
    )
    expect(describeEdit(edit('seat_limit', '10'), fmt)).toBe(
      'Nadav changed the table to 10 seats'
    )
  })

  it('handles a field being cleared', () => {
    expect(describeEdit(edit('location', null), fmt)).toContain('removed')
    expect(describeEdit(edit('name', null), fmt)).toContain('removed')
  })
})
