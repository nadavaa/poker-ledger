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
  adjustmentCents: number
  chips: string | null // what's already recorded, as typed
}

/**
 * Counting chips. The discrepancy counter updates as the admin types and
 * stays red until it hits zero — in a real game the chips almost never
 * balance, and today that argument gets settled by arguing.
 */
export function CashoutPanel({
  gameId,
  rows,
  chipsPerDollar,
}: {
  gameId: string
  rows: NetRow[]
  chipsPerDollar: number
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
    if (!/^\d+$/.test(v.trim())) return null
    return Number(v.trim())
  }

  const cashoutCents = (r: NetRow) => {
    const n = parsed(chips[r.memberId] ?? '')
    return n === null ? null : chipsToCents(n, chipsPerDollar)
  }

  const allEntered = rows.every((r) => cashoutCents(r) !== null)
  const difference = rows.reduce((sum, r) => {
    const c = cashoutCents(r) ?? 0
    return sum + c - r.buyinCents + r.adjustmentCents
  }, 0)
  const balanced = allEntered && difference === 0
  const dirty = rows.some(
    (r) => cashoutCents(r) !== null && !saved[r.memberId]
  )

  async function saveChips(r: NetRow) {
    const n = parsed(chips[r.memberId] ?? '')
    if (n === null) return
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
    <div className="flex flex-col gap-3">
      <div
        className={`flex items-baseline justify-between rounded-lg px-3 py-2 ${
          balanced
            ? 'bg-muted'
            : 'bg-destructive/10 text-destructive'
        }`}
      >
        <span className="text-sm">
          {!allEntered
            ? 'Counting chips'
            : difference === 0
              ? 'Balanced'
              : difference > 0
                ? 'Over by'
                : 'Short by'}
        </span>
        <span className="text-xl font-semibold tabular-nums">
          {allEntered ? formatCents(Math.abs(difference)) : '—'}
        </span>
      </div>

      {error && (
        <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <section className="flex flex-col gap-2">
        {rows.map((r) => {
          const c = cashoutCents(r)
          const net = c === null ? null : c - r.buyinCents + r.adjustmentCents
          return (
            <div
              key={r.memberId}
              className="flex items-center gap-2 rounded-lg border border-border p-2"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{r.name}</p>
                <p className="text-xs text-muted-foreground">
                  in {formatCents(r.buyinCents)}
                  {r.adjustmentCents !== 0 &&
                    ` · adj ${formatCents(r.adjustmentCents)}`}
                  {net !== null && (
                    <span
                      className={
                        net >= 0 ? ' text-emerald-600' : ' text-destructive'
                      }
                    >
                      {' '}
                      · net {formatCents(net)}
                    </span>
                  )}
                </p>
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

      {allEntered && difference !== 0 && (
        <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
          <h3 className="text-sm font-medium">
            The count is off by {formatCents(Math.abs(difference))}
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
              Missing chips (by buy-in)
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

      <Button disabled={!balanced || dirty || pending} onClick={settleGame}>
        {pending
          ? 'Working…'
          : balanced
            ? 'Settle up'
            : 'Settle up (count must balance)'}
      </Button>
    </div>
  )
}
