import { formatCents } from '@/lib/money'
import { NO_PAYMENT_BODY } from '@/lib/payment'
import { CopySummary } from '@/components/settle/copy-summary'
import { type TransferRow } from '@/components/settle/transfer-card'
import { SettlementSection } from '@/components/settle/settlement-section'
import { gameSummary } from '@/lib/summary'

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

export type { TransferRow }

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
  paymentSources,
  myMemberId,
  isAdmin,
  timeZone,
  gameLabel,
  startedAt,
  settledAt,
  beforeSettlements,
  needsPaymentMethod = false,
}: {
  rows: ResultRow[]
  /** RLS already limits this to rows the viewer is party to, unless admin. */
  transfers: TransferRow[]
  adjustments: AdjustmentRow[]
  names: Map<string, string>
  paymentSources: Map<string, import('@/lib/payment').PaymentSources>
  myMemberId: string | null
  isAdmin: boolean
  /** The group's zone; confirmation dates are rendered in it. */
  timeZone: string
  gameLabel: string
  startedAt: string | null
  settledAt: string | null
  /** Sits between the scoreboard and the payments — the food order. */
  beforeSettlements?: React.ReactNode
  /** Owed money with no way to be paid. */
  needsPaymentMethod?: boolean
}) {
  const potCents = rows.reduce((s, r) => s + r.buyinCents, 0)
  const potChips = rows.reduce((s, r) => s + r.buyinChips, 0)
  const played = duration(startedAt, settledAt)
  const sorted = [...rows].sort((a, b) => b.netCents - a.netCents)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-end justify-between gap-3 rounded-2xl border border-border bg-card px-4 py-3.5">
        <div className="flex flex-col gap-1">
          <span className="text-[0.7rem] font-medium uppercase tracking-[0.08em] text-muted-foreground">
            Total pot
          </span>
          {played && (
            <span className="text-xs text-muted-foreground">{played} played</span>
          )}
        </div>
        <div className="flex flex-col items-end">
          <span className="money-display text-[2.25rem] font-semibold">
            {formatCents(potCents)}
          </span>
          <span className="money text-xs text-muted-foreground">
            {potChips.toLocaleString()} chips
          </span>
        </div>
      </div>

      <section className="flex flex-col gap-2">
        <h2 className="text-[0.7rem] font-medium uppercase tracking-[0.08em] text-muted-foreground">
          Results
        </h2>
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
                  <td className="py-2.5 pr-2">
                    {r.name}
                    {r.memberId === myMemberId && (
                      <span className="text-muted-foreground"> (you)</span>
                    )}
                  </td>
                  <td className="money py-2.5 pr-2 text-right text-muted-foreground">
                    {formatCents(r.buyinCents)}
                  </td>
                  <td className="money py-2.5 pr-2 text-right text-muted-foreground">
                    {r.cashoutCents === null
                      ? '—'
                      : formatCents(r.cashoutCents)}
                  </td>
                  <td
                    className={`money-display py-2.5 text-right text-lg font-semibold ${
                      r.netCents > 0
                        ? 'text-up'
                        : r.netCents < 0
                          ? 'text-down'
                          : 'text-muted-foreground'
                    }`}
                  >
                    {r.netCents > 0 ? '+' : ''}
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

      {needsPaymentMethod && (
        <div className="flex flex-col gap-2 rounded-2xl border border-pending/30 bg-pending-soft p-3.5">
          <p className="text-sm font-medium text-pending">
            You&apos;re owed money for this game
          </p>
          <p className="text-xs text-muted-foreground">{NO_PAYMENT_BODY}</p>
          <a
            href="/settings"
            className="text-sm font-semibold text-pending underline-offset-2 hover:underline"
          >
            Add a payment method
          </a>
        </div>
      )}

      {beforeSettlements}

      <section className="flex flex-col gap-2">
        <SettlementSection
          transfers={transfers}
          names={names}
          paymentSources={paymentSources}
          myMemberId={myMemberId}
          isAdmin={isAdmin}
          timeZone={timeZone}
        />

        {isAdmin && transfers.length > 0 && (
          <CopySummary
            text={gameSummary({
              title: gameLabel,
              potCents,
              players: rows.map((r) => ({
                name: r.name,
                netCents: r.netCents,
              })),
              transfers: transfers.map((t) => ({
                fromName: names.get(t.fromMemberId) ?? 'Someone',
                toName: names.get(t.toMemberId) ?? 'someone',
                amountCents: t.amountCents,
                confirmed: t.status === 'confirmed',
              })),
            })}
          />
        )}
      </section>
    </div>
  )
}
