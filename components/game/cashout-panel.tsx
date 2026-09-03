'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { chipsToCents, formatCents } from '@/lib/money'
import { formatTime } from '@/lib/time'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export type NetRow = {
  memberId: string
  name: string
  buyinCents: number
  buyinChips: number
  adjustmentCents: number
  chips: string | null // what's already recorded
  /** When that count was taken, if it was. */
  recordedAt: string | null
  /** They cashed out mid-game and left; this count is hours old. */
  leftTable: boolean
}



/**
 * Counting chips, with the distribution tracked live rather than sprung on
 * the admin at the end. Chips and dollars are shown together throughout:
 * players count chips, settlement happens in dollars.
 */
export function CashoutPanel({
  gameId,
  rows,
  chipsPerDollar,
  timeZone,
  hasAdjustments,
}: {
  gameId: string
  rows: NetRow[]
  chipsPerDollar: number
  /** The group's zone, so "cashed out 9:42" means 9:42 at the table. */
  timeZone: string
  hasAdjustments: boolean
}) {
  const supabase = useMemo(() => createClient(), [])
  const router = useRouter()

  const [chips, setChips] = useState<Record<string, string>>(() =>
    Object.fromEntries(rows.map((r) => [r.memberId, r.chips ?? '']))
  )
  const [saved, setSaved] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(rows.map((r) => [r.memberId, r.chips !== null]))
  )
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [assignTo, setAssignTo] = useState('')
  // hasAdjustments arrives from the server render, so it lags a resolve by a
  // round trip. Track the write locally so Settle doesn't sit dead in the gap.
  const [justResolved, setJustResolved] = useState(false)

  /** Digits only. Strips anything else rather than rejecting the edit, so a
   *  pasted "1,240 chips" becomes 1240 instead of nothing. */
  const digitsOnly = (v: string) => v.replace(/\D/g, '')

  /** Empty means "not counted yet" and is not the same as a busted player,
   *  who is entered with 0. */
  const parsed = (v: string) => (v === '' ? null : Number(v))

  const entered = (r: NetRow) => parsed(chips[r.memberId] ?? '')

  const potChips = rows.reduce((s, r) => s + r.buyinChips, 0)
  const potCents = rows.reduce((s, r) => s + r.buyinCents, 0)

  const distributedChips = rows.reduce((s, r) => s + (entered(r) ?? 0), 0)
  const distributedCents = rows.reduce((s, r) => {
    const n = entered(r)
    return s + (n === null ? 0 : chipsToCents(n, chipsPerDollar))
  }, 0)

  const remainingChips = potChips - distributedChips
  const remainingCents = potCents - distributedCents

  const missing = rows.filter((r) => entered(r) === null)
  const allEntered = missing.length === 0
  const dirty = rows.some((r) => entered(r) !== null && !saved[r.memberId])

  // The tracker must not cry wolf. Chips still to be counted with a
  // non-negative remainder is the normal state, not a problem.
  const trackerState: 'entering' | 'impossible' | 'balanced' | 'short' | 'over' =
    !allEntered
      ? remainingChips < 0
        ? 'impossible'
        : 'entering'
      : remainingChips === 0
        ? 'balanced'
        : remainingChips > 0
          ? 'short'
          : 'over'

  const isProblem =
    trackerState === 'impossible' ||
    trackerState === 'short' ||
    trackerState === 'over'

  const canSettle =
    allEntered &&
    (remainingChips === 0 || hasAdjustments || justResolved) &&
    !dirty

  async function saveChips(r: NetRow, value?: number) {
    const n = value ?? entered(r)
    if (n === null || n === undefined) return
    setError(null)
    const { error } = await supabase.rpc('record_cashout', {
      p_game_id: gameId,
      p_member_id: r.memberId,
      p_chips: n,
    })
    if (error) {
      setError(error.message)
      return
    }
    setSaved((prev) => ({ ...prev, [r.memberId]: true }))
    router.refresh()
  }

  /** Fill the last un-entered player with what's left. Never silent. */
  async function assignRemainder() {
    const r = missing[0]
    if (!r || remainingChips < 0) return
    setChips((p) => ({ ...p, [r.memberId]: String(remainingChips) }))
    setSaved((p) => ({ ...p, [r.memberId]: false }))
    await saveChips(r, remainingChips)
  }

  async function resolve(mode: string, memberId?: string) {
    setError(null)
    setPending(true)
    const { error } = await supabase.rpc('resolve_discrepancy', {
      p_game_id: gameId,
      p_mode: mode,
      p_member_id: memberId ?? null,
      p_reason: null,
    })
    setPending(false)
    if (error) {
      setError(error.message)
      return
    }
    setJustResolved(true)
    router.refresh()
  }

  async function settleGame() {
    setError(null)
    setPending(true)
    const res = await fetch(`/api/games/${gameId}/settle`, { method: 'POST' })
    const body = await res.json()
    setPending(false)
    if (!res.ok) {
      setError(body.error ?? 'Could not settle the game.')
      return
    }
    router.refresh()
  }

  return (
    // Bottom padding leaves room for the pinned tracker.
    <div className="flex flex-col gap-3 pb-56">
      {error && (
        <p className="rounded-xl bg-down-soft px-3 py-2 text-sm text-down">
          {error}
        </p>
      )}

      <section className="flex flex-col gap-2">
        {rows.map((r) => {
          const n = entered(r)
          const cashoutCents =
            n === null ? null : chipsToCents(n, chipsPerDollar)
          const net =
            cashoutCents === null
              ? null
              : cashoutCents - r.buyinCents + r.adjustmentCents
          return (
            <div
              key={r.memberId}
              className={`flex items-center gap-3 rounded-2xl border p-3 transition-colors ${
                n === null
                  ? 'border-dashed border-border/70 bg-card/40'
                  : 'border-border bg-card'
              }`}
            >
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 truncate text-[0.9rem] font-medium">
                  {r.name}
                  {/* Not blank, and not to be re-counted: this stack was
                      counted when they left. Still editable. */}
                  {r.leftTable && (
                    <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-[0.65rem] font-medium uppercase tracking-[0.06em] text-muted-foreground">
                      ✓ cashed out
                      {r.recordedAt ? ` ${formatTime(r.recordedAt, timeZone, 'clock')}` : ''}
                    </span>
                  )}
                </p>
                <p className="money mt-0.5 text-xs text-muted-foreground">
                  in {r.buyinChips.toLocaleString()} ·{' '}
                  {formatCents(r.buyinCents)}
                  {r.adjustmentCents !== 0 &&
                    ` · adj ${formatCents(r.adjustmentCents)}`}
                </p>
                {net !== null && (
                  <p
                    className={`money-display mt-1 text-xl font-semibold ${
                      net > 0
                        ? 'text-up'
                        : net < 0
                          ? 'text-down'
                          : 'text-muted-foreground'
                    }`}
                  >
                    {net > 0 ? '+' : ''}
                    {formatCents(net)}
                  </p>
                )}
              </div>

              <div className="flex shrink-0 flex-col items-end gap-1">
                <Input
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={chips[r.memberId] ?? ''}
                  onChange={(e) => {
                    const clean = digitsOnly(e.target.value)
                    setChips((p) => ({ ...p, [r.memberId]: clean }))
                    setSaved((p) => ({ ...p, [r.memberId]: false }))
                    // Any adjustment was sized to the previous count.
                    setJustResolved(false)
                  }}
                  onBlur={() => {
                    // 007 -> 7, but '' stays '' and '0' stays '0'.
                    const raw = chips[r.memberId] ?? ''
                    const normalised = raw === '' ? '' : String(Number(raw))
                    if (normalised !== raw) {
                      setChips((p) => ({ ...p, [r.memberId]: normalised }))
                    }
                    saveChips(r, parsed(normalised) ?? undefined)
                  }}
                  placeholder="—"
                  aria-label={`${r.name} chip count`}
                  className="money h-12 w-24 text-center !text-lg font-semibold"
                />
                <span className="text-[0.65rem] uppercase tracking-[0.08em] text-muted-foreground">
                  chips out
                </span>
              </div>
            </div>
          )
        })}
      </section>

      {missing.length === 1 && remainingChips >= 0 && (
        <Button
          variant="outline"
          className="h-11 rounded-xl"
          onClick={assignRemainder}
        >
          Assign remaining {remainingChips.toLocaleString()} chips to{' '}
          {missing[0].name}
        </Button>
      )}

      {isProblem && trackerState !== 'impossible' && (
        <div className="flex flex-col gap-2.5 rounded-2xl border border-down/30 bg-down-soft p-3.5">
          <h3 className="text-sm font-semibold text-down">
            {trackerState === 'short'
              ? 'Chips unaccounted for'
              : 'Too many chips counted'}
          </h3>
          <p className="text-xs text-muted-foreground">
            Recount a stack first — that fixes it most of the time. Otherwise
            pick how to absorb it. Each choice is written to the ledger and can
            be redone.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() => resolve('even')}
            >
              Spread evenly
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() => resolve('proportional')}
            >
              Split by buy-in
            </Button>
          </div>
          <div className="flex gap-2">
            <select
              value={assignTo}
              onChange={(e) => setAssignTo(e.target.value)}
              aria-label="Assign the difference to one player"
              className="h-9 flex-1 rounded-lg border border-border bg-background px-2 text-sm"
            >
              <option value="">Assign to one player…</option>
              {rows.map((r) => (
                <option key={r.memberId} value={r.memberId}>
                  {r.name}
                </option>
              ))}
            </select>
            <Button
              variant="outline"
              size="sm"
              disabled={!assignTo || pending}
              onClick={() => resolve('player', assignTo)}
            >
              Assign
            </Button>
          </div>
        </div>
      )}

      <div className="material fixed inset-x-0 bottom-0 z-20 border-t border-border bg-background/85 backdrop-blur-xl backdrop-saturate-150">
        <div className="mx-auto w-full max-w-md px-4 pt-3 pb-safe">
          <div className="flex items-end justify-between gap-3">
            <div className="flex flex-col gap-0.5 text-xs text-muted-foreground">
              <span className="money">
                Pot {potChips.toLocaleString()} · {formatCents(potCents)}
              </span>
              <span className="money">
                Out {distributedChips.toLocaleString()} ·{' '}
                {formatCents(distributedCents)}
              </span>
            </div>

            <div className="flex flex-col items-end">
              <span
                className={`flex items-center gap-1.5 text-[0.7rem] font-medium uppercase tracking-[0.08em] ${
                  isProblem
                    ? 'text-down'
                    : trackerState === 'balanced'
                      ? 'text-up'
                      : 'text-muted-foreground'
                }`}
              >
                {trackerState === 'balanced' && (
                  <svg
                    viewBox="0 0 12 12"
                    aria-hidden
                    className="size-3 fill-none stroke-current stroke-[2]"
                  >
                    <path
                      d="M2 6.5 4.8 9.2 10 3.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
                {trackerState === 'balanced'
                  ? 'Balanced'
                  : trackerState === 'over' || trackerState === 'impossible'
                    ? 'Over by'
                    : 'Remaining'}
              </span>
              <span
                className={`money-display text-[2.25rem] font-semibold ${
                  isProblem
                    ? 'text-down'
                    : trackerState === 'balanced'
                      ? 'text-up'
                      : 'text-foreground'
                }`}
              >
                {Math.abs(remainingChips).toLocaleString()}
              </span>
              <span className="money text-xs text-muted-foreground">
                chips · {formatCents(Math.abs(remainingCents))}
                {!allEntered && ` · ${missing.length} left`}
              </span>
            </div>
          </div>

          {trackerState === 'impossible' && (
            <p className="mt-2 rounded-xl bg-down-soft px-3 py-2 text-xs text-down">
              More chips counted than are in the pot, and there are still
              players to enter. Something is miscounted.
            </p>
          )}

          <Button
            className="mt-3 h-12 w-full rounded-xl text-base"
            disabled={!canSettle || pending}
            onClick={settleGame}
          >
            {pending ? 'Working…' : dirty ? 'Saving…' : 'Settle up'}
          </Button>
        </div>
      </div>
    </div>
  )
}
