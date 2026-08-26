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

/** Integer cents formatted for display, e.g. "$50.00" or "-$12.50". */
export function formatCents(cents: number): string {
  const sign = cents < 0 ? '-' : ''
  return `${sign}$${centsToDollars(Math.abs(cents))}`
}

/** Chips owed for a cash amount, at the game's snapshotted ratio. */
export function centsToChips(cents: number, chipsPerDollar: number): number {
  return Math.round((cents * chipsPerDollar) / 100)
}

/** Cash value of a chip stack, at the game's snapshotted ratio. */
export function chipsToCents(chips: number, chipsPerDollar: number): number {
  return Math.round((chips * 100) / chipsPerDollar)
}
