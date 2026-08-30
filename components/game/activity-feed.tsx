'use client'

'use client'

import { useState } from 'react'
import { formatCents } from '@/lib/money'
import { Button } from '@/components/ui/button'
import type { Buyin } from './use-game-buyins'

function time(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  })
}

/**
 * Every buy-in, who logged it, when. One person having sole write access to
 * everyone's money is a trust concession; the control on it is visibility.
 */
export function ActivityFeed({
  buyins,
  names,
  adminMemberId,
  myMemberId,
  /** Keeps the page a bounded length; the feed runs all night otherwise. */
  limit = 8,
}: {
  buyins: Buyin[]
  names: Map<string, string>
  adminMemberId: string
  myMemberId?: string | null
  limit?: number
}) {
  const [showAll, setShowAll] = useState(false)
  const shown = showAll ? buyins : buyins.slice(0, limit)
  const hidden = buyins.length - shown.length

  if (buyins.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-border/70 px-3 py-4 text-center text-sm text-muted-foreground">
        No buy-ins yet.
      </p>
    )
  }

  return (
    <>
    <ul className="flex flex-col gap-1.5">
      {shown.map((b) => {
        // The admin logging their own buy-in gets a marker. Nobody will cheat;
        // the reason nobody will is that the log makes it pointless.
        const selfLogged =
          b.created_by_member_id === adminMemberId &&
          b.member_id === adminMemberId

        return (
          <li
            key={b.id}
            className={`flex items-baseline justify-between gap-2 rounded-xl border border-border/70 px-3 py-2.5 text-base ${
              b.voided_at ? 'opacity-45' : ''
            }`}
          >
            <span className={b.voided_at ? 'line-through' : ''}>
              <span className="font-medium">
                {names.get(b.member_id) ?? 'Unknown'}
              </span>{' '}
              <span className="money font-semibold">
                {formatCents(b.amount_cents)}
              </span>
              {b.note && (
                <span className="text-muted-foreground"> · {b.note}</span>
              )}
              {/* Spelled out: a hover tooltip is unreachable on a phone. */}
              {selfLogged && (
                <span className="text-muted-foreground"> · logged own</span>
              )}
            </span>
            <span className="shrink-0 text-[0.8125rem] text-muted-foreground">
              {b.voided_at
                ? `voided${b.void_reason ? ` · ${b.void_reason}` : ''}`
                : b.created_by_member_id === myMemberId
                  ? // You logged it. Who logged it only matters when it wasn't you.
                    time(b.created_at)
                  : `${time(b.created_at)} · by ${
                      names.get(b.created_by_member_id) ?? 'admin'
                    }`}
            </span>
          </li>
        )
      })}
    </ul>
    {hidden > 0 && (
      <Button
        variant="ghost"
        size="sm"
        className="self-start"
        onClick={() => setShowAll(true)}
      >
        Show {hidden} earlier
      </Button>
    )}
    </>
  )
}
