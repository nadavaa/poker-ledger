'use client'

import { useSyncExternalStore } from 'react'
import { formatCents } from '@/lib/money'

function elapsedLabel(fromIso: string, now: number) {
  const ms = Math.max(now - new Date(fromIso).getTime(), 0)
  const mins = Math.floor(ms / 60000)
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

const MINUTE = 60000

/**
 * A clock that ticks once a minute. The snapshot is bucketed so it stays
 * stable between ticks, and the server renders nothing rather than a time
 * that would disagree with the client on hydration.
 */
function useNow() {
  return useSyncExternalStore(
    (onChange) => {
      const id = setInterval(onChange, MINUTE)
      return () => clearInterval(id)
    },
    () => Math.floor(Date.now() / MINUTE) * MINUTE,
    () => null
  )
}

/**
 * The running pot, pinned so it never scrolls away. Chips and dollars
 * together: players think in chips, settlement happens in dollars.
 */
export function PotHeader({
  potCents,
  potChips,
  startedAt,
}: {
  potCents: number
  potChips: number
  startedAt: string | null
}) {
  const now = useNow()

  return (
    <div className="sticky top-0 z-10 -mx-4 flex items-baseline justify-between border-b border-border bg-background px-4 py-2">
      <div>
        <p className="text-xs text-muted-foreground">Pot</p>
        {startedAt && now !== null && (
          <p className="text-xs text-muted-foreground">
            {elapsedLabel(startedAt, now)} elapsed
          </p>
        )}
      </div>
      <div className="text-right">
        <p className="text-xl font-semibold tabular-nums">
          {formatCents(potCents)}
        </p>
        <p className="text-xs text-muted-foreground tabular-nums">
          {potChips.toLocaleString()} chips
        </p>
      </div>
    </div>
  )
}
