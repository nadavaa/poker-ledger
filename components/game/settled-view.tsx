import { formatCents } from '@/lib/money'
import { Card, CardContent } from '@/components/ui/card'

export type ResultRow = {
  memberId: string
  name: string
  buyinCents: number
  buyinChips: number
  cashoutCents: number | null
  cashoutChips: number | null
  adjustmentCents: number
  netCents: number
}

export type TransferRow = {
  id: string
  fromMemberId: string
  toMemberId: string
  amountCents: number
  status: string
}

export type AdjustmentRow = {
  id: string
  memberId: string | null
  amountCents: number
  reason: string
}

function duration(startedAt: string | null, settledAt: string | null) {
  if (!startedAt || !settledAt) return null
  const ms = new Date(settledAt).getTime() - new Date(startedAt).getTime()
  if (ms <= 0) return null
  const mins = Math.floor(ms / 60000)
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

/** The finished game: who won, who pays who, and what was fudged to balance. */
export function SettledView({
  rows,
  transfers,
  adjustments,
  names,
  myMemberId,
  startedAt,
  settledAt,
}: {
  rows: ResultRow[]
  transfers: TransferRow[]
  adjustments: AdjustmentRow[]
  names: Map<string, string>
  myMemberId: string | null
  startedAt: string | null
  settledAt: string | null
}) {
  const potCents = rows.reduce((s, r) => s + r.buyinCents, 0)
  const potChips = rows.reduce((s, r) => s + r.buyinChips, 0)
  const played = duration(startedAt, settledAt)
  const sorted = [...rows].sort((a, b) => b.netCents - a.netCents)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between rounded-lg border border-border px-3 py-2">
        <div>
          <p className="text-xs text-muted-foreground">Total pot</p>
          {played && (
            <p className="text-xs text-muted-foreground">{played} played</p>
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

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-muted-foreground">Results</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th className="py-1 pr-2 font-medium">Player</th>
                <th className="py-1 pr-2 text-right font-medium">In</th>
                <th className="py-1 pr-2 text-right font-medium">Out</th>
                <th className="py-1 text-right font-medium">Net</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => (
                <tr key={r.memberId} className="border-t border-border">
                  <td className="py-1.5 pr-2">
                    {r.name}
                    {r.memberId === myMemberId && (
                      <span className="text-muted-foreground"> (you)</span>
                    )}
                  </td>
                  <td className="py-1.5 pr-2 text-right tabular-nums">
                    {formatCents(r.buyinCents)}
                  </td>
                  <td className="py-1.5 pr-2 text-right tabular-nums">
                    {r.cashoutCents === null
                      ? '—'
                      : formatCents(r.cashoutCents)}
                  </td>
                  <td
                    className={`py-1.5 text-right font-medium tabular-nums ${
                      r.netCents >= 0 ? 'text-emerald-600' : 'text-destructive'
                    }`}
                  >
                    {formatCents(r.netCents)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {adjustments.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-medium text-muted-foreground">
            Adjustments
          </h2>
          <p className="text-xs text-muted-foreground">
            The chip count didn&apos;t balance. This is how it was resolved.
          </p>
          {adjustments.map((a) => (
            <div
              key={a.id}
              className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-sm"
            >
              <span>
                {a.memberId ? (names.get(a.memberId) ?? 'Someone') : 'Table'}
                <span className="text-muted-foreground"> · {a.reason}</span>
              </span>
              <span className="tabular-nums">
                {formatCents(a.amountCents)}
              </span>
            </div>
          ))}
        </section>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-muted-foreground">
          Who pays who ({transfers.length})
        </h2>
        {transfers.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Everyone came out even. Nothing to pay.
          </p>
        )}
        {transfers.map((t) => (
          <Card key={t.id}>
            <CardContent className="flex items-center justify-between gap-2 py-3">
              <div>
                <p className="text-sm">
                  <span className="font-medium">
                    {names.get(t.fromMemberId) ?? 'Someone'}
                  </span>{' '}
                  pays{' '}
                  <span className="font-medium">
                    {names.get(t.toMemberId) ?? 'someone'}
                  </span>
                </p>
                <p className="text-xs text-muted-foreground">{t.status}</p>
              </div>
              <span className="text-sm font-semibold tabular-nums">
                {formatCents(t.amountCents)}
              </span>
            </CardContent>
          </Card>
        ))}
      </section>
    </div>
  )
}
