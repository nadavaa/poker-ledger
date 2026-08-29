// Which payment method a payer is offered, and in what order.
//
// Pure, like settle.ts and stats.ts. The database hands over the raw member
// and profile values; the override-beats-profile rule and the preference
// ordering live here so they can be tested without I/O.

import { normalizeHandle } from './venmo'

export type PaymentMethod = 'venmo' | 'zelle'

export type PaymentOption = {
  method: PaymentMethod
  /** A venmo handle without its @, or a phone number in E.164. */
  value: string
}

export type ResolvedPayment = {
  primary: PaymentOption | null
  secondary: PaymentOption | null
}

export type PaymentSources = {
  memberVenmo?: string | null
  profileVenmo?: string | null
  memberPhone?: string | null
  profilePhone?: string | null
  preferred?: string | null
}

/**
 * A value on the group member row overrides the profile, the same rule the
 * Venmo handle has always followed: an admin can put a number on a guest's
 * member row, and it wins for that group.
 *
 * The stated preference only chooses the order. If someone prefers Zelle but
 * has only a Venmo handle on file, they get Venmo — a preference is not a
 * reason to show the payer nothing.
 */
export function resolvePaymentOptions({
  memberVenmo,
  profileVenmo,
  memberPhone,
  profilePhone,
  preferred,
}: PaymentSources): ResolvedPayment {
  const venmo = normalizeHandle(memberVenmo) ?? normalizeHandle(profileVenmo)
  const phone = normalizePhone(memberPhone) ?? normalizePhone(profilePhone)

  const options: PaymentOption[] = []
  if (venmo) options.push({ method: 'venmo', value: venmo })
  if (phone) options.push({ method: 'zelle', value: phone })

  if (options.length === 0) return { primary: null, secondary: null }

  const wanted = preferred === 'venmo' || preferred === 'zelle' ? preferred : null
  const ordered =
    wanted && options.some((o) => o.method === wanted)
      ? [
          options.find((o) => o.method === wanted)!,
          ...options.filter((o) => o.method !== wanted),
        ]
      : options

  return { primary: ordered[0], secondary: ordered[1] ?? null }
}

/** Phone numbers are stored in E.164; this only guards against blanks. */
function normalizePhone(raw: string | null | undefined): string | null {
  const trimmed = raw?.trim()
  return trimmed ? trimmed : null
}

/** +15551234567 → (555) 123-4567. Display only; storage stays E.164. */
export function formatPhone(e164: string): string {
  const m = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(e164.trim())
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : e164
}
