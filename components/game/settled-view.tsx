import { formatCents } from '@/lib/money'
import { Card, CardContent } from '@/components/ui/card'
import { VenmoButton } from '@/components/settle/venmo-button'
import { SettlementActions } from '@/components/settle/settlement-actions'
import { CopySummary } from '@/components/settle/copy-summary'
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

export type TransferRow = {
  id: string
  fromMemberId: string
  toMemberId: string
  amountCents: number
  status: string
}

export type SettlementProgress = { total: number; confirmed: number }

export type AdjustmentRow = {
  id: string
  memberId: string | null
  amountCents: number
  reason: string
}

/**
 * A player sees only what they are personally party to, framed as something
 * to do rather than a ledger entry.
 */
function PlayerSettlements({
  transfers,
  names,
  venmoHandles,
  myMemberId,
  gameLabel,
}: {
  transfers: TransferRow[]
  names: Map<string, string>
  venmoHandles: Map<string, string | null>
  myMemberId: string | null
  gameLabel: string
}) {
  const outstanding = transfers.filter((t) => t.status !== 'confirmed')

  if (outstanding.length === 0) {
    return (
      <div className="rounded-2xl border border-up/30 bg-up-soft px-4 py-6 text-center">
        <p className="flex items-center justify-center gap-2 text-sm font-semibold text-up">
          <span aria-hidden>✓</span>
          You&apos;re square for this game
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Nothing to pay and nothing to collect.
        </p>
      </div>
    )
  }

  return (
    <>
      {outstanding.map((t) => {
        const paying = t.fromMemberId === myMemberId
        const counterpartyId = paying ? t.toMemberId : t.fromMemberId
        const counterparty = names.get(counterpartyId) ?? 'someone'
        return (
          <Card key={t.id}>
            <CardContent className="flex items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm">
                  <span className="font-medium">
                    {paying
                      ? `Pay ${counterparty}`
                      : `Collect from ${counterparty}`}
                  </span>{' '}
                  <span className="money-display font-semibold">
                    {formatCents(t.amountCents)}
                  </span>
                </p>
                <SettlementStatus status={t.status} />
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1.5">
                <VenmoButton
                  handle={venmoHandles.get(counterpartyId) ?? null}
                  amountCents={t.amountCents}
                  note={gameLabel}
                  direction={paying ? 'pay' : 'collect'}
                  counterpartyName={counterparty}
                />
                {/* The link is a convenience; marking paid works whether or
                    not Venmo opened. */}
                <SettlementActions
                  settlementId={t.id}
                  status={t.status}
                  role={paying ? 'payer' : 'payee'}
                />
              </div>
            </CardContent>
          </Card>
        )
      })}
    </>
  )
}

/**
 * Status never rides on colour alone — every state carries a glyph and a
 * word, because a colourblind player is being told what they owe.
 */
function SettlementStatus({ status }: { status: string }) {
  const map: Record<string, { label: string; tone: string; glyph: string }> = {
    pending: { label: 'Pending', tone: 'text-pending', glyph: '○' },
    paid: { label: 'Paid, awaiting confirm', tone: 'text-amber-500', glyph: '◐' },
    confirmed: { label: 'Confirmed', tone: 'text-up', glyph: '✓' },
    deferred: { label: 'Deferred', tone: 'text-muted-foreground', glyph: '»' },
  }
  const s = map[status] ?? map.pending
  return (
    <p className={`mt-0.5 flex items-center gap-1 text-xs ${s.tone}`}>
      <span aria-hidden className="font-semibold">
        {s.glyph}
      </span>
      {s.label}
    </p>
  )
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
  venmoHandles,
  myMemberId,
  isAdmin,
  progress,
  gameLabel,
  startedAt,
  settledAt,
}: {
  rows: ResultRow[]
  /** RLS already limits this to rows the viewer is party to, unless admin. */
  transfers: TransferRow[]
  adjustments: AdjustmentRow[]
  names: Map<string, string>
  venmoHandles: Map<string, string | null>
  myMemberId: string | null
  isAdmin: boolean
  progress: SettlementProgress
  gameLabel: string
  startedAt: string | null
  settledAt: string | null
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

      <section className="flex flex-col gap-2">
        <h2 className="flex items-baseline justify-between gap-2 text-[0.7rem] font-medium uppercase tracking-[0.08em] text-muted-foreground">
          <span>{isAdmin ? 'Who pays who' : 'Your settlements'}</span>
          {/* Counts only — enough to know the game is closed out, without
              revealing who is still carrying a debt. */}
          <span className="money normal-case tracking-normal">
            {progress.confirmed} of {progress.total} confirmed
          </span>
        </h2>

        {isAdmin ? (
          transfers.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border/70 px-3 py-4 text-center text-sm text-muted-foreground">
              Everyone came out even. Nothing to pay.
            </p>
          ) : (
            transfers.map((t) => (
              <Card key={t.id}>
                <CardContent className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm">
                      <span className="font-medium">
                        {names.get(t.fromMemberId) ?? 'Someone'}
                      </span>{' '}
                      <span className="text-muted-foreground">pays</span>{' '}
                      <span className="font-medium">
                        {names.get(t.toMemberId) ?? 'someone'}
                      </span>
                    </p>
                    <SettlementStatus status={t.status} />
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="money-display text-xl font-semibold">
                      {formatCents(t.amountCents)}
                    </span>
                    <SettlementActions
                      settlementId={t.id}
                      status={t.status}
                      role={
                        t.fromMemberId === myMemberId
                          ? 'payer'
                          : t.toMemberId === myMemberId
                            ? 'payee'
                            : 'bystander'
                      }
                    />
                  </div>
                </CardContent>
              </Card>
            ))
          )
        ) : (
          <PlayerSettlements
            transfers={transfers}
            names={names}
            venmoHandles={venmoHandles}
            myMemberId={myMemberId}
            gameLabel={gameLabel}
          />
        )}

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
