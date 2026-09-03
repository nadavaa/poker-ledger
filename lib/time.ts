// One place that turns an instant into words, and words back into an instant.
//
// Every game time is rendered in the group's own zone, named by IANA
// identifier so DST is handled — a fixed -5 offset is wrong from March to
// November. Because the zone is explicit, the server and the browser format
// the same string, so an SSR'd time matches what hydration produces.

export const DEFAULT_TIME_ZONE = 'America/New_York'

/** What wall-clock time an instant reads as in a zone, minus UTC, in ms. */
function zoneOffsetMs(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date)

  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value ?? '0')

  const asUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second')
  )
  return asUtc - date.getTime()
}

/**
 * A datetime-local value ("2026-09-06T20:00") read as a wall-clock time in
 * the given zone, returned as an ISO instant. What the admin types is what
 * the group sees, wherever either of them is standing.
 */
export function fromZonedInput(local: string, timeZone: string): string {
  const naive = new Date(`${local.length === 16 ? `${local}:00` : local}Z`)
  if (Number.isNaN(naive.getTime())) throw new Error('not a valid date')

  // Guess with the offset at the naive instant, then correct once: near a DST
  // boundary the first guess can land on the wrong side of the change.
  const first = zoneOffsetMs(naive, timeZone)
  let out = new Date(naive.getTime() - first)
  const second = zoneOffsetMs(out, timeZone)
  if (second !== first) out = new Date(naive.getTime() - second)
  return out.toISOString()
}

/** The reverse: an instant as the value a datetime-local input wants. */
export function toZonedInput(iso: string, timeZone: string): string {
  const d = new Date(iso)
  const shifted = new Date(d.getTime() + zoneOffsetMs(d, timeZone))
  return shifted.toISOString().slice(0, 16)
}

const STYLES = {
  /** "Sat, Sep 6, 8:00 PM" — the game's headline time. */
  when: {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  },
  /** "Sep 6, 2026" — a date with no time attached. */
  day: { month: 'short', day: 'numeric', year: 'numeric' },
  /** "Sep 6" — compact, for a settlement that closed. */
  shortDay: { month: 'short', day: 'numeric' },
  /** "8:12 PM" — a moment inside a game everybody was at. */
  clock: { hour: 'numeric', minute: '2-digit' },
} as const satisfies Record<string, Intl.DateTimeFormatOptions>

export type TimeStyle = keyof typeof STYLES

/**
 * The one formatter. `en-US` rather than the runtime's locale on purpose:
 * the server's locale and the phone's are not the same, and a game time that
 * changes shape between SSR and hydration is a bug people can see.
 */
export function formatTime(
  iso: string,
  timeZone: string,
  style: TimeStyle = 'when'
): string {
  // Postgres hands timestamps back as "2026-09-06 20:00:00+00": a space where
  // the T should be, and a bare-hour offset that Date refuses.
  const d = new Date(
    iso.replace(' ', 'T').replace(/([+-]\d{2})$/, '$1:00')
  )
  if (Number.isNaN(d.getTime())) return ''
  return new Intl.DateTimeFormat('en-US', {
    ...STYLES[style],
    timeZone,
  }).format(d)
}
