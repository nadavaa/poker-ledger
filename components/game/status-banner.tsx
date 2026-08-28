import { formatCents } from '@/lib/money'

export type GameState =
  | 'scheduled'
  | 'active'
  | 'reconciling'
  | 'settled'
  | 'cancelled'

/**
 * The state of a game has to be unmistakable the moment the page loads, so it
 * gets a banner rather than a word buried in the header.
 */
export function StatusBanner({
  status,
  overdue,
  buyinCents,
  chips,
  detail,
}: {
  status: GameState
  /** Scheduled, start time already passed, never started. */
  overdue?: boolean
  buyinCents: number
  chips: number
  detail?: string
}) {
  const label: Record<GameState, string> = {
    scheduled: overdue ? 'Never started' : 'Scheduled',
    active: 'Game in progress',
    reconciling: 'Counting chips',
    settled: 'Settled',
    cancelled: 'Cancelled',
  }

  const tone: Record<GameState, string> = {
    scheduled: 'bg-muted',
    active: 'bg-emerald-600 text-white',
    reconciling: 'bg-amber-500 text-white',
    settled: 'bg-foreground text-background',
    cancelled: 'bg-muted text-muted-foreground',
  }

  return (
    <div
      className={`flex items-baseline justify-between gap-2 rounded-lg px-3 py-2 ${
        overdue && status === 'scheduled' ? 'bg-amber-500 text-white' : tone[status]
      }`}
    >
      <span className="text-sm font-semibold uppercase tracking-wide">
        {label[status]}
      </span>
      <span className="text-xs">
        {detail ??
          (status === 'scheduled'
            ? `${formatCents(buyinCents)} = ${chips} chips`
            : '')}
      </span>
    </div>
  )
}
