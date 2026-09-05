// Which payment method a payer is offered, and in what order.
//
// Pure, like settle.ts and stats.ts. The database hands over the raw member
// and profile values; the override-beats-profile rule and the preference
// ordering live here so they can be tested without I/O.

import { normalizeHandle } from './venmo'

/**
 * The same sentence wherever this comes up: onboarding, the home banner, and
 * the settled game where it finally bites. It is about them losing money, not
 * about the app wanting a field filled in — "complete your profile" is a
 * request, and this is a consequence.
 */
export const NO_PAYMENT_TITLE = "You won't be able to get paid"
export const NO_PAYMENT_BODY =
  'Without a Venmo handle or Zelle number, players who owe you money ' +
  "won't have a way to pay you. You can add it later in Settings."

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

export type PhoneParse = {
  /** E.164, or null when the field is empty. */
  value: string | null
  /** False only for input that is present but not a US number. */
  valid: boolean
}

/**
 * The client-side twin of normalize_us_phone() in Postgres. Kept in step with
 * it deliberately: the database is what actually stores the number, but the
 * form has to compare a typed "(555) 123-4567" against a stored
 * "+15551234567" without calling out to decide whether anything changed.
 */
export function parseUsPhone(raw: string | null | undefined): PhoneParse {
  const digits = (raw ?? '').replace(/\D/g, '')
  if (digits === '') return { value: null, valid: true }

  const local = digits.length === 11 && digits.startsWith('1')
    ? digits.slice(1)
    : digits
  if (local.length !== 10) return { value: null, valid: false }
  // Neither the area code nor the exchange may start with 0 or 1.
  if ('01'.includes(local[0]) || '01'.includes(local[3])) {
    return { value: null, valid: false }
  }
  return { value: `+1${local}`, valid: true }
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
