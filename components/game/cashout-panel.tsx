'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { chipsToCents, formatCents } from '@/lib/money'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export type NetRow = {
  memberId: string
  name: string
  buyinCents: number
  buyinChips: number
  adjustmentCents: number
  chips: string | null // what's already recorded
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
  hasAdjustments,
}: {
  gameId: string
  rows: NetRow[]
  chipsPerDollar: number
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

  const parsed = (v: string) => {
    const t = v.trim()
    if (!/^\d+$/.test(t)) return null
    return Number(t)
  }

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
    allEntered && (remainingChips === 0 || hasAdjustments) && !dirty

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
    <div className="flex flex-col gap-3 pb-44">
      {error && (
        <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
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
              className="flex items-center gap-2 rounded-lg border border-border p-2"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{r.name}</p>
                <p className="text-xs text-muted-foreground">
                  in {r.buyinChips.toLocaleString()} chips (
                  {formatCents(r.buyinCents)})
                  {r.adjustmentCents !== 0 &&
                    ` · adj ${formatCents(r.adjustmentCents)}`}
                </p>
                {n !== null && (
                  <p className="text-xs text-muted-foreground">
                    out {n.toLocaleString()} chips ({formatCents(cashoutCents!)}
                    )
                    <span
                      className={
                        net! >= 0 ? ' text-emerald-600' : ' text-destructive'
                      }
                    >
                      {' '}
                      · net {formatCents(net!)}
                    </span>
                  </p>
                )}
              </div>
              <Input
                inputMode="numeric"
                value={chips[r.memberId] ?? ''}
                onChange={(e) => {
                  setChips((p) => ({ ...p, [r.memberId]: e.target.value }))
                  setSaved((p) => ({ ...p, [r.memberId]: false }))
                }}
                onBlur={() => saveChips(r)}
                placeholder="chips"
                aria-label={`${r.name} chip count`}
                className="w-24"
              />
            </div>
          )
        })}
      </section>

      {missing.length === 1 && remainingChips >= 0 && (
        <Button variant="outline" size="sm" onClick={assignRemainder}>
          Assign remaining {remainingChips.toLocaleString()} chips to{' '}
          {missing[0].name}
        </Button>
      )}

      {isProblem && trackerState !== 'impossible' && (
        <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
          <h3 className="text-sm font-medium">
            {trackerState === 'short' ? 'Chips unaccounted for' : 'Too many chips counted'}
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

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-background">
        <div className="mx-auto w-full max-w-md p-3">
          <dl className="flex flex-col gap-0.5 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Total pot</dt>
              <dd className="tabular-nums">
                {potChips.toLocaleString()} chips ({formatCents(potCents)})
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Distributed</dt>
              <dd className="tabular-nums">
                {distributedChips.toLocaleString()} chips (
                {formatCents(distributedCents)})
              </dd>
            </div>
            <div
              className={`flex justify-between font-medium ${
                isProblem
                  ? 'text-destructive'
                  : trackerState === 'balanced'
                    ? 'text-emerald-600'
                    : ''
              }`}
            >
              <dt>
                {trackerState === 'over' || trackerState === 'impossible'
                  ? 'Over by'
                  : 'Remaining'}
              </dt>
              <dd className="tabular-nums">
                {Math.abs(remainingChips).toLocaleString()} chips (
                {formatCents(Math.abs(remainingCents))})
                {!allEntered && (
                  <span className="text-muted-foreground">
                    {' '}
                    — {missing.length} left
                  </span>
                )}
              </dd>
            </div>
          </dl>

          {trackerState === 'impossible' && (
            <p className="mt-1 text-xs text-destructive">
              More chips counted than are in the pot, and there are still
              players to enter. Something is miscounted.
            </p>
          )}

          <Button
            className="mt-2 w-full"
            disabled={!canSettle || pending}
            onClick={settleGame}
          >
            {pending
              ? 'Working…'
              : canSettle
                ? 'Settle up'
                : dirty
                  ? 'Saving…'
                  : 'Settle up'}
          </Button>
        </div>
      </div>
    </div>
  )
}
