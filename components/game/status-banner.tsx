import { formatCents } from '@/lib/money'

export type GameState =
  | 'scheduled'
  | 'active'
  | 'reconciling'
  | 'settled'
  | 'cancelled'

/**
 * The state of a game has to land before anyone reads a word, so each one
 * gets its own colour *and* its own shape: a hollow ring for something not
 * yet started, a live pulsing dot, a filled square mid-count, a check when
 * it's done, a slash when it's off. Colour alone would fail a colourblind
 * player, and this is an app about money.
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
    active: 'In progress',
    reconciling: 'Counting chips',
    settled: 'Settled',
    cancelled: 'Cancelled',
  }

  const surface: Record<GameState, string> = {
    scheduled: 'bg-pending-soft text-pending ring-1 ring-inset ring-pending/25',
    active: 'bg-live-soft text-up ring-1 ring-inset ring-up/30',
    reconciling:
      'bg-amber-400/12 text-amber-300 ring-1 ring-inset ring-amber-400/30',
    settled: 'bg-muted text-foreground ring-1 ring-inset ring-border',
    cancelled: 'bg-muted/60 text-muted-foreground ring-1 ring-inset ring-border',
  }

  const overdueSurface =
    'bg-amber-400/12 text-amber-300 ring-1 ring-inset ring-amber-400/30'

  return (
    <div
      className={`flex items-center justify-between gap-3 rounded-xl px-3.5 py-2.5 ${
        overdue && status === 'scheduled' ? overdueSurface : surface[status]
      }`}
    >
      <span className="flex items-center gap-2">
        <Glyph status={status} overdue={overdue} />
        <span className="text-sm font-semibold tracking-tight">
          {label[status]}
        </span>
      </span>
      <span className="money text-xs opacity-80">
        {detail ??
          (status === 'scheduled'
            ? `${formatCents(buyinCents)} = ${chips} chips`
            : '')}
      </span>
    </div>
  )
}

/** Shape carries the state as much as colour does. */
function Glyph({ status, overdue }: { status: GameState; overdue?: boolean }) {
  if (status === 'active') {
    return (
      <span aria-hidden className="relative flex size-2.5">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-up opacity-60" />
        <span className="relative inline-flex size-2.5 rounded-full bg-up" />
      </span>
    )
  }
  if (status === 'reconciling') {
    return <span aria-hidden className="size-2.5 rounded-[3px] bg-amber-300" />
  }
  if (status === 'settled') {
    return (
      <svg aria-hidden viewBox="0 0 12 12" className="size-3 fill-none stroke-current stroke-[2]">
        <path d="M2 6.5 4.8 9.2 10 3.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }
  if (status === 'cancelled') {
    return (
      <svg aria-hidden viewBox="0 0 12 12" className="size-3 fill-none stroke-current stroke-[2]">
        <path d="M3 3l6 6M9 3l-6 6" strokeLinecap="round" />
      </svg>
    )
  }
  // Scheduled: a hollow ring — nothing in it yet. Overdue fills the centre.
  return (
    <span
      aria-hidden
      className={`size-2.5 rounded-full border-2 border-current ${
        overdue ? 'bg-current' : ''
      }`}
    />
  )
}
