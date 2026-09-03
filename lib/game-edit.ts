// Which parts of a game can still be changed, and what a change is called.
//
// The trigger on `games` is the enforcement — this is the same rule written
// where the form can read it, so a locked field is drawn greyed out with a
// reason instead of failing on save.

export type GameStatus =
  | 'scheduled'
  | 'active'
  | 'reconciling'
  | 'settled'
  | 'cancelled'

export type EditableField =
  | 'name'
  | 'location'
  | 'scheduledAt'
  | 'seatLimit'
  | 'buyinCents'
  | 'chipsPerDollar'

/** Snapshotted onto the game at creation and priced into every buy-in. */
const SNAPSHOT_FIELDS: EditableField[] = [
  'scheduledAt',
  'seatLimit',
  'buyinCents',
  'chipsPerDollar',
]

/** Nothing at all can be edited once the game is finished. */
export function isEditable(status: GameStatus): boolean {
  return status === 'scheduled' || status === 'active'
}

/**
 * null when the field is editable, otherwise the reason it isn't — shown
 * next to the greyed-out input rather than hiding it, so the admin can see
 * the value and understand why it's fixed.
 */
export function lockReason(
  status: GameStatus,
  field: EditableField
): string | null {
  if (!isEditable(status)) {
    return status === 'cancelled'
      ? 'This game was called off.'
      : 'This game is finished.'
  }
  if (status === 'active' && SNAPSHOT_FIELDS.includes(field)) {
    return field === 'chipsPerDollar'
      ? 'Locked once play starts — changing it would rewrite what every stack is worth.'
      : field === 'buyinCents'
        ? 'Locked once play starts — money is already in the pot at this amount.'
        : 'Locked once play starts.'
  }
  return null
}

export type EditFields = {
  name: string
  location: string
  scheduledAt: string
  seatLimit: string
  buyinCents: string
  chipsPerDollar: string
}

export type EditProblems = {
  errors: Partial<Record<EditableField, string>>
  /** Allowed, but worth saying out loud before they save. */
  warnings: Partial<Record<EditableField, string>>
}

/**
 * A game logged after the fact is a real thing people do, so a past date is a
 * warning and never a block.
 */
export function validateEdit(
  f: EditFields,
  now: Date = new Date()
): EditProblems {
  const errors: EditProblems['errors'] = {}
  const warnings: EditProblems['warnings'] = {}

  if (f.name.trim() === '' && f.name !== '') errors.name = 'Give it a name or leave it blank.'

  const when = new Date(f.scheduledAt)
  if (!f.scheduledAt || Number.isNaN(when.getTime())) {
    errors.scheduledAt = "That isn't a real date."
  } else if (when.getTime() < now.getTime()) {
    warnings.scheduledAt = "That's in the past. Fine if you're logging a game that already happened."
  }

  const seats = Number(f.seatLimit)
  if (!Number.isInteger(seats) || seats < 1) {
    errors.seatLimit = 'A game needs at least one seat.'
  }

  const buyin = Number(f.buyinCents)
  if (!Number.isFinite(buyin) || buyin <= 0) {
    errors.buyinCents = 'The buy-in has to be more than nothing.'
  }

  const ratio = Number(f.chipsPerDollar)
  if (!Number.isFinite(ratio) || ratio <= 0) {
    errors.chipsPerDollar = 'The chip ratio has to be more than zero.'
  }

  return { errors, warnings }
}

export type SeatLimitChange =
  | { ok: true; promotes: number }
  | { ok: false; reason: string }

/**
 * Raising the limit fills the new seats from the waitlist in order. Lowering
 * it below the people already confirmed is refused rather than picking
 * somebody to demote — that's a decision about people, not a number.
 */
export function planSeatLimit({
  next,
  confirmedCount,
  waitlistCount,
}: {
  next: number
  confirmedCount: number
  waitlistCount: number
}): SeatLimitChange {
  if (!Number.isInteger(next) || next < 1) {
    return { ok: false, reason: 'A game needs at least one seat.' }
  }
  if (next < confirmedCount) {
    return {
      ok: false,
      reason: `${confirmedCount} players are confirmed. Move someone to the waitlist first.`,
    }
  }
  return {
    ok: true,
    promotes: Math.max(0, Math.min(waitlistCount, next - confirmedCount)),
  }
}

export type GameEdit = {
  field: string
  oldValue: string | null
  newValue: string | null
  editedByName: string
}

/**
 * What the feed says. Named for what a player cares about — the time moved,
 * the venue moved — not for the column that changed.
 */
export function describeEdit(
  edit: GameEdit,
  format: { money: (cents: number) => string; when: (iso: string) => string }
): string {
  const who = edit.editedByName
  const to = edit.newValue
  switch (edit.field) {
    case 'scheduled_at':
      return `${who} changed the start time to ${format.when(to ?? '')}`
    case 'location':
      return to
        ? `${who} moved the game to ${to}`
        : `${who} removed the location`
    case 'name':
      return to ? `${who} renamed the game to ${to}` : `${who} removed the name`
    case 'seat_limit':
      return `${who} changed the table to ${to} seats`
    case 'default_buyin_cents':
      return `${who} changed the buy-in to ${format.money(Number(to))}`
    case 'chips_per_dollar':
      return `${who} changed the chip ratio to ${to} per dollar`
    default:
      return `${who} edited the game`
  }
}
