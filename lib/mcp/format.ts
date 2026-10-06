// The two shapes every tool answers in. An agent reads the display string
// aloud and does arithmetic on the integer, so both are always present and
// always derived from the same source value.
//
// Pure, like the rest of lib/: no Supabase, no Next, no React. The formatting
// itself lives in lib/money.ts and lib/time.ts; this only pairs a value with
// its words.

import { formatCents } from '../money'
import { formatTime, type TimeStyle } from '../time'

export type Money = { cents: number; display: string }

export function money(cents: number): Money {
  return { cents, display: formatCents(cents) }
}

export type Moment = { iso: string; local: string; timezone: string }

/**
 * Postgres hands timestamps back as "2026-09-06 20:00:00+00" in some paths
 * and as ISO in others. Normalise to a real instant before doing anything
 * with it.
 */
export function toIso(raw: string): string {
  const d = new Date(raw.replace(' ', 'T').replace(/([+-]\d{2})$/, '$1:00'))
  if (Number.isNaN(d.getTime())) throw new Error(`Not a timestamp: ${raw}`)
  return d.toISOString()
}

export function moment(
  raw: string,
  timeZone: string,
  style: TimeStyle = 'when'
): Moment {
  const iso = toIso(raw)
  return { iso, local: formatTime(iso, timeZone, style), timezone: timeZone }
}

export function momentOrNull(
  raw: string | null | undefined,
  timeZone: string,
  style: TimeStyle = 'when'
): Moment | null {
  return raw ? moment(raw, timeZone, style) : null
}
