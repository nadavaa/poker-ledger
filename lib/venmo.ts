// Venmo deep links. No money moves through this app — we prefill a payment
// and let the two people confirm it themselves, which keeps this well clear
// of money transmitter territory.
//
// These URL schemes are undocumented and Venmo has changed them before, so
// the handle is always shown as plain text next to the amount.

import { centsToDollars } from './money'

export type VenmoLinks = { app: string; web: string }

/**
 * One place where a handle is cleaned up: trim it, drop a leading @, and turn
 * an empty string into null so "no handle" is a single representable state.
 */
export function normalizeHandle(raw: string | null | undefined): string | null {
  if (!raw) return null
  const cleaned = raw.trim().replace(/^@+/, '').trim()
  return cleaned === '' ? null : cleaned
}

/**
 * A handle set on the group member row is an override for that group; the
 * profile handle is the person's default. Either may be null.
 */
export function resolveVenmoHandle(
  memberHandle: string | null | undefined,
  profileHandle: string | null | undefined
): string | null {
  return normalizeHandle(memberHandle) ?? normalizeHandle(profileHandle)
}

/**
 * `pay` sends money, `charge` requests it. Amount formatting goes through
 * money.ts like every other cents-to-dollars conversion.
 *
 * Prefer `web` as the href: https is handled by the OS, which hands off to
 * the Venmo app when it's installed and opens the site when it isn't. A bare
 * `venmo://` href silently does nothing in a desktop browser.
 */
export function venmoLink(
  handle: string,
  cents: number,
  note: string,
  txn: 'pay' | 'charge' = 'pay'
): VenmoLinks {
  const amount = centsToDollars(cents)
  const n = encodeURIComponent(note)
  const h = encodeURIComponent(normalizeHandle(handle) ?? '')
  return {
    app: `venmo://paycharge?txn=${txn}&recipients=${h}&amount=${amount}&note=${n}`,
    web: `https://venmo.com/${h}?txn=${txn}&amount=${amount}&note=${n}`,
  }
}
