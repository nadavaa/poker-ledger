'use client'

import { formatCents } from '@/lib/money'
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
}: {
  buyins: Buyin[]
  names: Map<string, string>
  adminMemberId: string
}) {
  if (buyins.length === 0) {
    return <p className="text-sm text-muted-foreground">No buy-ins yet.</p>
  }

  return (
    <ul className="flex flex-col gap-1.5">
      {buyins.map((b) => {
        // The admin logging their own buy-in gets a marker. Nobody will cheat;
        // the reason nobody will is that the log makes it pointless.
        const selfLogged =
          !b.is_auto &&
          b.created_by_member_id === adminMemberId &&
          b.member_id === adminMemberId

        return (
          <li
            key={b.id}
            className={`flex items-baseline justify-between gap-2 rounded-lg border border-border px-2.5 py-1.5 text-sm ${
              b.voided_at ? 'opacity-50' : ''
            }`}
          >
            <span className={b.voided_at ? 'line-through' : ''}>
              <span className="font-medium">
                {names.get(b.member_id) ?? 'Unknown'}
              </span>{' '}
              {formatCents(b.amount_cents)}
              {b.note && (
                <span className="text-muted-foreground"> · {b.note}</span>
              )}
              {selfLogged && (
                <span
                  className="text-muted-foreground"
                  title="Logged by the admin for themselves"
                >
                  {' '}
                  · self
                </span>
              )}
            </span>
            <span className="shrink-0 text-xs text-muted-foreground">
              {b.voided_at
                ? `voided${b.void_reason ? ` · ${b.void_reason}` : ''}`
                : b.is_auto
                  ? `${time(b.created_at)} · on join`
                  : `${time(b.created_at)} · by ${
                      names.get(b.created_by_member_id) ?? 'admin'
                    }`}
            </span>
          </li>
        )
      })}
    </ul>
  )
}
