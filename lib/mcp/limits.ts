// How much one user may change through an agent in a short window. Counts
// come from the call log (see mcp_rate_counts); this only decides.

export const RATE_WINDOW_MINUTES = 10
export const MAX_COMMITS = 10
export const MAX_PREVIEWS = 30

export type RateCounts = { commits: number; previews: number }

export const RATE_LIMIT_MESSAGE =
  'Too many changes in a short time. Wait a few minutes and try again.'

/** Is one more call of this kind allowed? */
export function withinRate(
  counts: RateCounts,
  kind: 'preview' | 'commit'
): boolean {
  return kind === 'commit'
    ? counts.commits < MAX_COMMITS
    : counts.previews < MAX_PREVIEWS
}
