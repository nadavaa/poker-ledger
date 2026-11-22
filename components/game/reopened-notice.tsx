import { formatCents } from '@/lib/money'
import { formatTime } from '@/lib/time'

export type AlreadyPaid = {
  id: string
  fromName: string
  toName: string
  amountCents: number
}

/**
 * Shown to everyone on a game that was unsettled: who reopened it, why, and
 * which payments already happened and still count. One person can rewrite a
 * settled result, so the control is that everyone can see it.
 */
export function ReopenedNotice({
  byName,
  reason,
  at,
  timeZone,
  stillOpen,
  alreadyPaid,
}: {
  byName: string
  reason: string
  at: string
  timeZone: string
  stillOpen: boolean
  alreadyPaid: AlreadyPaid[]
}) {
  return (
    <div className="flex flex-col gap-1.5 rounded-2xl border border-pending/30 bg-pending-soft px-4 py-3">
      <p className="text-sm font-semibold text-pending">
        {stillOpen ? 'Reopened after settling' : 'Settled again after a correction'}
      </p>
      <p className="text-xs text-muted-foreground">
        {byName} unsettled this game {formatTime(at, timeZone, 'when')}: “{reason}”
      </p>
      {stillOpen && alreadyPaid.length > 0 && (
        <>
          <p className="text-xs text-muted-foreground">
            Already paid. These stay, and the new settlement only covers
            what&apos;s still owed after them:
          </p>
          <ul className="flex flex-col gap-1">
            {alreadyPaid.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between gap-2 rounded-lg bg-background/60 px-2 py-1 text-xs"
              >
                <span>
                  {p.fromName} paid {p.toName}
                </span>
                <span className="tabular-nums">{formatCents(p.amountCents)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
