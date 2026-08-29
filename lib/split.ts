// Splitting a food order across the people who ate.
//
// Pure, like settle.ts: no Supabase, no React, integer cents throughout. The
// one rule that matters is that shares sum to the total *exactly*. Rounding
// each share independently loses or invents cents, and someone always
// notices when the receipt doesn't match.

export type Participant = {
  memberId: string
  /** Ties are broken by who signed up first, so leftovers land predictably. */
  signupOrder: number
  /** A set amount for this person. Null or undefined means an even cut. */
  fixedCents?: number | null
}

export type Share = {
  memberId: string
  shareCents: number
  isFixed: boolean
}

export type SplitPreview = {
  totalCents: number
  /** Sum of the fixed amounts. */
  assignedCents: number
  /** What's left for the even split. */
  remainderCents: number
  evenCount: number
  /** Floor of the even cut; the first few may get a cent more. */
  perHeadCents: number
  /** Set when the split cannot be saved. */
  error: string | null
  /** Set when it can be saved but is probably not what was meant. */
  warning: string | null
}

function validate(
  totalCents: number,
  participants: Participant[]
): string | null {
  if (!Number.isInteger(totalCents) || totalCents <= 0) {
    return 'Enter a total greater than zero.'
  }
  if (participants.length === 0) {
    return 'Pick at least one person to split this with.'
  }
  const fixed = participants.filter((p) => p.fixedCents != null)
  if (fixed.some((p) => !Number.isInteger(p.fixedCents!) || p.fixedCents! < 0)) {
    return 'A set amount cannot be negative.'
  }
  const assigned = fixed.reduce((s, p) => s + p.fixedCents!, 0)
  if (assigned > totalCents) {
    return 'The set amounts add up to more than the total.'
  }
  if (fixed.length === participants.length && assigned !== totalCents) {
    return 'Everyone has a set amount, but they do not add up to the total.'
  }
  return null
}

/**
 * The numbers behind the live footer. Never throws — the form has to render
 * while the input is still half-typed and wrong.
 */
export function previewSplit(
  totalCents: number,
  participants: Participant[]
): SplitPreview {
  const fixed = participants.filter((p) => p.fixedCents != null)
  const evenCount = participants.length - fixed.length
  const assignedCents = fixed.reduce((s, p) => s + (p.fixedCents ?? 0), 0)
  const remainderCents = totalCents - assignedCents
  const error = validate(totalCents, participants)

  return {
    totalCents,
    assignedCents,
    remainderCents,
    evenCount,
    perHeadCents:
      evenCount > 0 && remainderCents > 0
        ? Math.floor(remainderCents / evenCount)
        : 0,
    error,
    // Allowed, but they're being charged nothing — worth saying out loud.
    warning:
      !error && evenCount > 0 && remainderCents === 0
        ? 'The set amounts use up the whole total, so everyone else is down for nothing.'
        : null,
  }
}

/**
 * Final shares. Throws on anything previewSplit() reports as an error, so a
 * caller that skipped the preview still cannot save a broken split.
 */
export function splitOrder(
  totalCents: number,
  participants: Participant[]
): Share[] {
  const error = validate(totalCents, participants)
  if (error) throw new Error(error)

  const shares = new Map<string, number>()
  const fixed = participants.filter((p) => p.fixedCents != null)
  const even = participants.filter((p) => p.fixedCents == null)

  for (const p of fixed) shares.set(p.memberId, p.fixedCents!)

  if (even.length > 0) {
    const remainder = totalCents - fixed.reduce((s, p) => s + p.fixedCents!, 0)
    const base = Math.floor(remainder / even.length)
    let leftover = remainder - base * even.length

    // The odd cents go one each to the earliest signups rather than being
    // rounded away or dumped on one person.
    const ordered = [...even].sort(
      (a, b) =>
        a.signupOrder - b.signupOrder || a.memberId.localeCompare(b.memberId)
    )
    for (const p of ordered) {
      shares.set(p.memberId, base + (leftover > 0 ? 1 : 0))
      if (leftover > 0) leftover -= 1
    }
  }

  return participants.map((p) => ({
    memberId: p.memberId,
    shareCents: shares.get(p.memberId)!,
    isFixed: p.fixedCents != null,
  }))
}
