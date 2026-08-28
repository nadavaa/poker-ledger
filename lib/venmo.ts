// Venmo deep links. No money moves through this app — we prefill a payment
// and let the two people confirm it themselves, which keeps this well clear
// of money transmitter territory.
//
// These URL schemes are undocumented and Venmo has changed them before, so
// treat the link as a convenience and always offer the plain-text fallback.

import { centsToDollars } from './money'

export type VenmoLinks = { app: string; web: string }

/**
 * `pay` sends money, `charge` requests it. Amount formatting goes through
 * money.ts like every other cents-to-dollars conversion.
 */
export function venmoLink(
  handle: string,
  cents: number,
  note: string,
  txn: 'pay' | 'charge' = 'pay'
): VenmoLinks {
  const amount = centsToDollars(cents)
  const n = encodeURIComponent(note)
  const h = encodeURIComponent(handle.replace(/^@/, ''))
  return {
    app: `venmo://paycharge?txn=${txn}&recipients=${h}&amount=${amount}&note=${n}`,
    web: `https://venmo.com/${h}?txn=${txn}&amount=${amount}&note=${n}`,
  }
}
