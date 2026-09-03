'use client'

import { useSyncExternalStore } from 'react'
import { formatCents } from '@/lib/money'

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

function elapsedLabel(fromIso: string, now: number) {
  const ms = Math.max(now - new Date(fromIso).getTime(), 0)
  const mins = Math.floor(ms / 60000)
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

/**
 * The running pot, pinned so it never scrolls away. It is the largest number
 * on the screen because it is the thing people look up to check. Chips sit
 * underneath in dollars' shadow: players count chips, settlement is dollars.
 */
export function PotHeader({
  potCents,
  potChips,
  startedAt,
  onTable,
}: {
  potCents: number
  potChips: number
  startedAt: string | null
  /** Shown once somebody has cashed out and left with part of the pot. */
  onTable?: {
    chips: number
    cents: number
    /** More chips paid out than were ever bought in. */
    overdrawn: boolean
  }
}) {
  const now = useNow()

  return (
    <div className="material sticky top-0 z-20 -mx-4 -mt-4 mb-1 bg-background/80 px-4 pb-3 pt-4 backdrop-blur-xl backdrop-saturate-150">
      <div className="flex items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-[0.7rem] font-medium uppercase tracking-[0.08em] text-muted-foreground">
            Pot
          </span>
          {startedAt && (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span
                aria-hidden
                className="size-1.5 animate-pulse rounded-full bg-live"
              />
              {now !== null ? `${elapsedLabel(startedAt, now)} in` : 'Live'}
            </span>
          )}
        </div>

        <div className="flex flex-col items-end">
          <span className="money-display text-[2.75rem] font-semibold text-foreground">
            {formatCents(potCents)}
          </span>
          <span className="money text-sm text-muted-foreground">
            {potChips.toLocaleString()} chips
          </span>
        </div>
      </div>

      {/* The pot is still every buy-in ever made. This is the part of it
          that hasn't walked out the door. */}
      {onTable && (
        <div
          className={`mt-2 flex items-baseline justify-between gap-3 rounded-xl px-3 py-1.5 ${
            onTable.overdrawn
              ? 'bg-down-soft text-down'
              : 'bg-muted/60 text-muted-foreground'
          }`}
        >
          <span className="text-[0.7rem] font-medium uppercase tracking-[0.08em]">
            {onTable.overdrawn ? '! Cashed out over pot' : 'On the table'}
          </span>
          <span className="money text-sm font-semibold">
            {onTable.chips.toLocaleString()} chips ·{' '}
            {formatCents(onTable.cents)}
          </span>
        </div>
      )}

      {onTable?.overdrawn && (
        <p className="mt-1.5 rounded-xl bg-down-soft px-3 py-2 text-xs text-down">
          More chips have been cashed out than were bought in. One of the
          counts is wrong — fix it now, not at 1am.
        </p>
      )}

      {/* Scroll edge, not a hard rule: content fades under the chrome. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -bottom-4 h-4 bg-gradient-to-b from-background/80 to-transparent"
      />
    </div>
  )
}
