// Formatting for the analytics page. Pure, because "0 of 0" is 0% and not
// NaN, and a chart of all-zero weeks has to draw as a flat line rather than
// dividing by a zero range.

/** null when there is nothing to take a percentage of — never NaN, never 0%. */
export function pct(part: number, whole: number): number | null {
  if (!Number.isFinite(part) || !Number.isFinite(whole) || whole <= 0) return null
  return (part / whole) * 100
}

export function formatPct(value: number | null, digits = 0): string {
  return value === null ? '—' : `${value.toFixed(digits)}%`
}

/** Postgres percentile_cont returns null for an empty set. Say so. */
export function formatNumber(
  value: number | null | undefined,
  digits = 1
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—'
  return Number.isInteger(value) ? String(value) : value.toFixed(digits)
}

export function formatDuration(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined || !Number.isFinite(minutes)) {
    return '—'
  }
  const h = Math.floor(minutes / 60)
  const m = Math.round(minutes % 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

export function formatHours(hours: number | null | undefined): string {
  if (hours === null || hours === undefined || !Number.isFinite(hours)) return '—'
  if (hours < 24) return `${hours.toFixed(1)}h`
  return `${(hours / 24).toFixed(1)}d`
}

/**
 * Bar heights as fractions of the tallest bar. All-zero data gives all-zero
 * heights rather than a division by an empty range.
 */
export function barHeights(values: number[]): number[] {
  const max = Math.max(0, ...values)
  if (max <= 0) return values.map(() => 0)
  return values.map((v) => Math.max(0, v) / max)
}
