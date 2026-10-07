// What a game-admin action is about to do, decided from facts and said in
// words. Pure, like plan.ts: the tool reads the rows, this chooses between
// refusing, "nothing to do" and "needs a yes", and writes the sentence the
// user approves.
//
// None of this is authorization. The database refuses a non-admin whatever
// is said here; the checks exist so the refusal comes before the preview, in
// one clear sentence, instead of after a yes.

import { planSeatLimit } from '../game-edit'
import { formatCents } from '../money'
import { overfillPrompt, seatLabel } from '../seats'
import { fromZonedInput, formatTime, toZonedInput } from '../time'

export type AdminPlan<B extends Record<string, unknown> = Record<string, unknown>> =
  | { kind: 'refuse'; reason: string }
  | { kind: 'already'; text: string }
  | { kind: 'confirm'; text: string; bind: B }

const refuse = (reason: string): { kind: 'refuse'; reason: string } => ({
  kind: 'refuse',
  reason,
})

// ------------------------------------------------------------------ time

const DATE = /^\d{4}-\d{2}-\d{2}$/
const TIME = /^\d{2}:\d{2}$/

/**
 * "2026-10-09" + "20:00" read on the wall clock of the group's zone.
 *
 * fromZonedInput quietly rolls an impossible date forward (Feb 30 becomes
 * Mar 3) and slides a time that never happened (2:30 AM on the night clocks
 * go forward) to another hour. Neither is what anyone meant, so the result is
 * turned back into local time and must match what was asked.
 */
export function localToInstant(
  date: string,
  time: string,
  timeZone: string
): { ok: true; iso: string } | { ok: false; reason: string } {
  if (!DATE.test(date) || !TIME.test(time)) {
    return {
      ok: false,
      reason: 'Give the date as YYYY-MM-DD, like 2026-10-09, and the time as 24-hour HH:MM, like 20:00.',
    }
  }
  const asked = `${date}T${time}`
  let iso: string
  try {
    iso = fromZonedInput(asked, timeZone)
  } catch {
    return { ok: false, reason: 'That is not a real date and time.' }
  }
  if (toZonedInput(iso, timeZone) !== asked) {
    return {
      ok: false,
      reason: `${date} ${time} does not exist in ${timeZone}: either the date is not real or the clocks skip that hour. Pick another time.`,
    }
  }
  return { ok: true, iso }
}

// ------------------------------------------------------------ create game

export type CreateGameFacts = {
  groupName: string
  timezone: string
  date: string
  time: string
  name?: string
  location?: string
  /** What the group says, unless the caller overrides the seat limit. */
  defaults: { seatLimit: number; buyinCents: number; chipsPerDollar: number }
  seatLimit?: number
  playing: boolean
  /** A game already scheduled at that exact time in this group. */
  sameTimeGame: string | null
  now: Date
}

export type CreateGamePlan = AdminPlan<{
  scheduled_at: string
  seat_limit: number
  buyin_cents: number
  chips_per_dollar: number
  playing: boolean
}> & {
  /** What to hand create_game, when there is something to confirm. */
  values?: {
    scheduledAt: string
    seatLimit: number
    buyinCents: number
    chipsPerDollar: number
  }
}

export function planCreateGame(f: CreateGameFacts): CreateGamePlan {
  const when = localToInstant(f.date, f.time, f.timezone)
  if (!when.ok) return refuse(when.reason)

  const seatLimit = f.seatLimit ?? f.defaults.seatLimit
  // create_game's own rule.
  if (!Number.isInteger(seatLimit) || seatLimit < 2) {
    return refuse('A game needs at least 2 seats.')
  }

  const { buyinCents, chipsPerDollar } = f.defaults
  const place = f.location?.trim() ? ` at ${f.location.trim()}` : ''
  const title = f.name?.trim() ? `"${f.name.trim()}"` : 'a game'
  const notes: string[] = []
  if (new Date(when.iso).getTime() < f.now.getTime()) {
    notes.push("That time is in the past; fine if you are logging a game that already happened.")
  }
  if (f.sameTimeGame) {
    notes.push(`There is already a game at that time (${f.sameTimeGame}). Check this is not a duplicate.`)
  }

  const text =
    `Create ${title} for ${f.groupName} on ${formatTime(when.iso, f.timezone, 'when')} ` +
    `(${f.timezone})${place}? ${seatLimit} seats, ${formatCents(buyinCents)} buy-in, ` +
    `${Number(chipsPerDollar)} chips per $1. You will be the game admin` +
    `${f.playing ? ' and take a seat' : ', without a seat of your own'}.` +
    (notes.length ? ` ${notes.join(' ')}` : '')

  return {
    kind: 'confirm',
    text,
    // The numbers the user saw. If the group's defaults change before the
    // yes, the old yes does not cover the new numbers.
    bind: {
      scheduled_at: when.iso,
      seat_limit: seatLimit,
      buyin_cents: buyinCents,
      chips_per_dollar: Number(chipsPerDollar),
      playing: f.playing,
    },
    values: { scheduledAt: when.iso, seatLimit, buyinCents, chipsPerDollar },
  }
}

// -------------------------------------------------------------- edit game

export type EditGameFacts = {
  isAdmin: boolean
  status: 'scheduled' | 'active' | 'reconciling' | 'settled' | 'cancelled'
  timezone: string
  current: {
    scheduledAt: string
    name: string | null
    location: string | null
    seatLimit: number
  }
  confirmedCount: number
  waitlistCount: number
  edits: {
    date?: string
    time?: string
    name?: string
    location?: string
    seatLimit?: number
  }
}

export type EditPayload = {
  scheduled_at?: string
  name?: string | null
  location?: string | null
  seat_limit?: number
}

export function planEditGame(f: EditGameFacts): AdminPlan<{ changes: EditPayload; promotes: number }> & {
  payload?: EditPayload
} {
  if (!f.isAdmin) return refuse('Only the game admin can edit this game.')
  if (f.status === 'cancelled') return refuse('That game was cancelled; nothing can be edited.')
  if (f.status !== 'scheduled' && f.status !== 'active') {
    return refuse('That game is finished; nothing can be edited.')
  }

  const { edits, current: cur } = f
  const payload: EditPayload = {}
  const lines: string[] = []
  let promotes = 0

  // ---- time
  if (edits.date !== undefined || edits.time !== undefined) {
    const local = toZonedInput(cur.scheduledAt, f.timezone) // 2026-09-06T20:00
    const when = localToInstant(
      edits.date ?? local.slice(0, 10),
      edits.time ?? local.slice(11, 16),
      f.timezone
    )
    if (!when.ok) return refuse(when.reason)
    if (Date.parse(when.iso) !== Date.parse(cur.scheduledAt)) {
      if (f.status !== 'scheduled') {
        // The database's own words.
        return refuse('The game has started — only the name and location can change now.')
      }
      payload.scheduled_at = when.iso
      lines.push(
        `the start time from ${formatTime(cur.scheduledAt, f.timezone, 'when')} to ${formatTime(when.iso, f.timezone, 'when')}`
      )
    }
  }

  // ---- seats
  if (edits.seatLimit !== undefined && edits.seatLimit !== cur.seatLimit) {
    if (f.status !== 'scheduled') {
      return refuse('The game has started — only the name and location can change now.')
    }
    const change = planSeatLimit({
      next: edits.seatLimit,
      confirmedCount: f.confirmedCount,
      waitlistCount: f.waitlistCount,
    })
    if (!change.ok) return refuse(change.reason)
    payload.seat_limit = edits.seatLimit
    promotes = change.promotes
    lines.push(
      `the table from ${cur.seatLimit} to ${edits.seatLimit} seats` +
        (promotes > 0
          ? ` (${promotes} waitlisted ${promotes === 1 ? 'player takes' : 'players take'} the new ${promotes === 1 ? 'seat' : 'seats'}, in order)`
          : '')
    )
  }

  // ---- words. Empty clears; omitted leaves alone.
  if (edits.name !== undefined) {
    const next = edits.name.trim() === '' ? null : edits.name.trim()
    if (next !== (cur.name ?? null)) {
      payload.name = next
      lines.push(next ? `the name to "${next}"` : 'the name (remove it)')
    }
  }
  if (edits.location !== undefined) {
    const next = edits.location.trim() === '' ? null : edits.location.trim()
    if (next !== (cur.location ?? null)) {
      payload.location = next
      lines.push(next ? `the location to ${next}` : 'the location (remove it)')
    }
  }

  if (lines.length === 0) {
    return { kind: 'already', text: 'Nothing to change: the game already has those details.' }
  }
  return {
    kind: 'confirm',
    text: `Change ${lines.join('; ')}? Everyone in the group can see the change.`,
    bind: { changes: payload, promotes },
    payload,
  }
}

// ------------------------------------------------------------- add player

export type AddPlayerFacts = {
  isAdmin: boolean
  status: 'scheduled' | 'active' | 'reconciling' | 'settled' | 'cancelled'
  gameLabel: string
  seatLimit: number
  /** seats_taken: confirmed, minus anyone who cashed out and left. */
  seatsTaken: number
  waitlistCount: number
  /** An existing member, or a guest to create. Exactly one. */
  member?: {
    id: string
    name: string
    active: boolean
    signup: 'confirmed' | 'waitlist' | 'withdrawn' | null
    waitlistPosition?: number | null
  } | null
  memberRequested: boolean
  guestName?: string
  /** Active members, for catching a guest who is really someone already here. */
  activeMembers: { id: string; name: string }[]
}

export function planAddPlayer(
  f: AddPlayerFacts
): AdminPlan<{ outcome: 'seated' | 'waitlisted'; who: string }> {
  if (!f.isAdmin) return refuse('Only the game admin can add players.')
  if (f.status !== 'scheduled' && f.status !== 'active') {
    return refuse('That game is closed to new players.')
  }
  const guest = f.guestName?.trim()
  if (f.memberRequested === !!guest) {
    return refuse('Give either member_id (from list_group_members) or guest_name, not both and not neither.')
  }

  let name: string
  let who: string
  if (f.memberRequested) {
    const m = f.member
    if (!m || !m.active) {
      return refuse('That is not an active member of this group. Call list_group_members for valid member_ids.')
    }
    if (m.signup === 'confirmed') {
      return { kind: 'already', text: `${m.name} is already seated in ${f.gameLabel}.` }
    }
    if (m.signup === 'waitlist') {
      return {
        kind: 'already',
        text: `${m.name} is already on the waitlist${m.waitlistPosition ? ` (#${m.waitlistPosition})` : ''} for ${f.gameLabel}. Use seat_from_waitlist to seat them.`,
      }
    }
    name = m.name
    who = m.id
  } else {
    const clash = f.activeMembers.find(
      (m) => m.name.trim().toLowerCase() === guest!.toLowerCase()
    )
    if (clash) {
      return refuse(
        `There is already a member called ${clash.name} in this group (member_id ${clash.id}). Use that member_id, or give the guest a different name.`
      )
    }
    name = guest!
    who = `guest:${guest!.toLowerCase()}`
  }

  const room = f.seatsTaken < f.seatLimit
  const kind = f.memberRequested ? '' : ' (a guest, new to the group)'
  return {
    kind: 'confirm',
    text: room
      ? `Add ${name}${kind} to ${f.gameLabel}? There is room, so they would get a seat (${seatLabel(f.seatsTaken + 1, f.seatLimit)}).`
      : `Add ${name}${kind} to ${f.gameLabel}? The table is full (${seatLabel(f.seatsTaken, f.seatLimit)}), so they would join the waitlist at #${f.waitlistCount + 1}. Adding someone never takes the table over its limit; seat_from_waitlist does, after asking.`,
    bind: { outcome: room ? 'seated' : 'waitlisted', who },
  }
}

// ------------------------------------------------------ seat from waitlist

export type SeatFacts = {
  isAdmin: boolean
  status: 'scheduled' | 'active' | 'reconciling' | 'settled' | 'cancelled'
  gameLabel: string
  seatLimit: number
  seatsTaken: number
  name: string
  signup: 'confirmed' | 'waitlist' | 'withdrawn' | null
}

export function planSeatFromWaitlist(
  f: SeatFacts
): AdminPlan<{ overfill: boolean; seats_taken: number }> {
  if (!f.isAdmin) return refuse('Only the game admin can change the roster.')
  if (f.status !== 'scheduled' && f.status !== 'active') {
    return refuse('That game is closed to roster changes.')
  }
  if (f.signup === null) return refuse(`${f.name} is not in this game.`)
  if (f.signup === 'confirmed') {
    return { kind: 'already', text: `${f.name} is already seated in ${f.gameLabel}.` }
  }
  if (f.signup !== 'waitlist') return refuse(`${f.name} is not on the waitlist.`)

  const full = f.seatsTaken >= f.seatLimit
  return {
    kind: 'confirm',
    // The app's own question, word for word, when the table is full.
    text: full
      ? overfillPrompt(f.name, f.seatsTaken, f.seatLimit)
      : `Seat ${f.name} from the waitlist in ${f.gameLabel}? (${seatLabel(f.seatsTaken + 1, f.seatLimit)})`,
    bind: { overfill: full, seats_taken: f.seatsTaken },
  }
}

// ------------------------------------------------------------ cancel game

export type CancelFacts = {
  canCancel: boolean
  status: 'scheduled' | 'active' | 'reconciling' | 'settled' | 'cancelled'
  gameLabel: string
  /** What the caller can see of unpaid transfers: all of them for the admin. */
  unpaidTransfers: number
  buyinCount: number
  buyinTotalCents: number
}

export function planCancelGame(f: CancelFacts): AdminPlan<{ status: string }> {
  if (!f.canCancel) return refuse('Only the game admin or the group owner can cancel a game.')
  if (f.status === 'cancelled') return { kind: 'already', text: `${f.gameLabel} is already cancelled.` }
  if (f.status === 'settled') {
    return refuse('A settled game cannot be cancelled; it holds results other players depend on.')
  }
  if (f.unpaidTransfers > 0) {
    return refuse(`This game has ${f.unpaidTransfers} unpaid ${f.unpaidTransfers === 1 ? 'settlement' : 'settlements'}; resolve them first.`)
  }
  const kept =
    f.buyinCount > 0
      ? `the roster and all ${f.buyinCount} ${f.buyinCount === 1 ? 'buy-in' : 'buy-ins'} totalling ${formatCents(f.buyinTotalCents)}`
      : 'the roster'
  return {
    kind: 'confirm',
    text:
      `Cancel ${f.gameLabel}? ${kept[0].toUpperCase()}${kept.slice(1)} and the audit trail stay on the record, ` +
      `and it only means no settlement will be computed. It cannot be undone in the app.`,
    bind: { status: f.status },
  }
}

// ---------------------------------------------------------------- close out

export type CloseOutFacts = {
  isGameAdmin: boolean
  role: 'payer' | 'payee' | 'bystander'
  status: 'pending' | 'paid' | 'confirmed' | 'deferred'
  kind: 'poker' | 'food'
  amountCents: number
  payerName: string
  payeeName: string
  gameDay: string
}

export function planCloseOut(f: CloseOutFacts): AdminPlan<{ status: string }> {
  if (!f.isGameAdmin) return refuse('Only the game admin can close out a transfer.')
  if (f.role === 'payer') {
    return refuse('You cannot close out your own debt. Pay it, and ask the person you owe to confirm.')
  }
  if (f.role === 'payee') {
    return refuse('You are the person being paid on this one. Use confirm_transfer_received if the money arrived.')
  }
  if (f.status === 'confirmed') {
    return { kind: 'already', text: `That ${f.kind} transfer from ${f.payerName} to ${f.payeeName} is already confirmed.` }
  }
  if (f.status !== 'pending' && f.status !== 'paid') {
    return refuse('That transfer cannot be closed out.')
  }
  return {
    kind: 'confirm',
    text:
      `You're closing out ${f.payerName}'s ${formatCents(f.amountCents)} ${f.kind} payment to ${f.payeeName} ` +
      `from ${f.gameDay} as game admin, without ${f.payeeName} confirming in the app. ` +
      `It will show as closed out by you. This cannot be undone. Only do this if ${f.payeeName} ` +
      `really has been paid, or really will not confirm.`,
    bind: { status: f.status },
  }
}
