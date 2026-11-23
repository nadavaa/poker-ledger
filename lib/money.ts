// Every conversion between cents, dollars, and chips lives here and nowhere
// else. Money is integer cents throughout the rest of the app.

/** Parse user-typed dollars ("50", "$50.25", "1,200") into integer cents. */
export function dollarsToCents(input: string | number): number {
  const raw = typeof input === 'number' ? String(input) : input
  const cleaned = raw.replace(/[$,\s]/g, '')
  if (!/^-?\d*\.?\d*$/.test(cleaned) || cleaned === '' || cleaned === '.') {
    throw new Error(`Not a valid dollar amount: ${raw}`)
  }
  const negative = cleaned.startsWith('-')
  const [whole, frac = ''] = cleaned.replace('-', '').split('.')
  // Round the third decimal onward rather than truncating it away.
  const centsFromFrac = Math.round(Number(`0.${frac || '0'}`) * 100)
  const cents = Number(whole || '0') * 100 + centsFromFrac
  return negative ? -cents : cents
}

/** Integer cents to a plain decimal string, no currency symbol. */
export function centsToDollars(cents: number): string {
  const sign = cents < 0 ? '-' : ''
  const abs = Math.abs(cents)
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`
}

/**
 * Integer cents as whole dollars for a typed-amount box: 5000 -> "50".
 * Nobody buys in for cents, so a stray remainder rounds to the nearest dollar.
 */
export function centsToWholeDollars(cents: number): string {
  return String(Math.round(cents / 100))
}

/**
 * What a whole-dollar amount box keeps of what was typed: digits only, and
 * nothing from a "." on. Dropping just the dot would turn "600.50" into 60050.
 */
export function wholeDollarsInput(raw: string): string {
  return raw.split('.')[0].replace(/\D/g, '')
}

/**
 * Integer cents formatted for display, e.g. "$50", "$1,150" or "-$12.50".
 *
 * Nobody plays for cents, so whole dollars render without a decimal. A real
 * remainder — a discrepancy split three ways, say — still shows its cents
 * rather than being rounded into a lie.
 */
export function formatCents(cents: number): string {
  const sign = cents < 0 ? '-' : ''
  const abs = Math.abs(cents)
  const whole = Math.floor(abs / 100).toLocaleString('en-US')
  const remainder = abs % 100
  return remainder === 0
    ? `${sign}$${whole}`
    : `${sign}$${whole}.${String(remainder).padStart(2, '0')}`
}

/**
 * Integer cents rounded to whole dollars for display, e.g. "$1,150" or "-$13".
 *
 * For running totals and averages only — a lifetime net, a season's buy-ins —
 * where the cents are noise. A single game's amounts use formatCents, which
 * keeps a real remainder. Halves round away from zero, so -$12.50 is -$13.
 */
export function formatWholeDollars(cents: number): string {
  const rounded = roundToWholeDollar(cents)
  const sign = rounded < 0 ? '-' : ''
  return `${sign}$${(Math.abs(rounded) / 100).toLocaleString('en-US')}`
}

/**
 * Integer cents rounded to the nearest whole dollar, still in cents:
 * 23450 -> 23500, -1250 -> -1300, 30 -> 0. Anything that colours or signs a
 * formatWholeDollars amount should test this, so +30¢ reads as a grey "$0"
 * rather than a green "+$0".
 */
export function roundToWholeDollar(cents: number): number {
  const rounded = Math.round(Math.abs(cents) / 100) * 100
  return cents < 0 && rounded !== 0 ? -rounded : rounded
}

/** Chips owed for a cash amount, at the game's snapshotted ratio. */
export function centsToChips(cents: number, chipsPerDollar: number): number {
  return Math.round((cents * chipsPerDollar) / 100)
}

/** Cash value of a chip stack, at the game's snapshotted ratio. */
export function chipsToCents(chips: number, chipsPerDollar: number): number {
  return Math.round((chips * 100) / chipsPerDollar)
}
