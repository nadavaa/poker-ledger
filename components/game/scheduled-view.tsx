'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { formatCents } from '@/lib/money'
import { Button } from '@/components/ui/button'
import { useSignupRefresh } from './use-signup-refresh'
import { AddPlayer, type AvailableMember } from './add-player'
import type { Player } from './buy-in-grid'

/**
 * A game that hasn't started. Signing up is a plan, not chips on the table,
 * so there is no money on this screen at all — no pot, no buy-in counts.
 */
export function ScheduledView({
  gameId,
  players,
  available,
  seatLimit,
  defaultBuyinCents,
  myMemberId,
  isAdmin,
}: {
  gameId: string
  players: Player[]
  available: AvailableMember[]
  seatLimit: number
  defaultBuyinCents: number
  myMemberId: string | null
  isAdmin: boolean
}) {
  const supabase = useMemo(() => createClient(), [])
  const router = useRouter()
  useSignupRefresh(gameId)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  // Most people are usually there; the admin unchecks whoever isn't.
  const [here, setHere] = useState<Set<string>>(
    () => new Set(players.map((p) => p.memberId))
  )

  const seatsLeft = Math.max(seatLimit - players.length, 0)

  /** Send a confirmed player back to the waitlist, or off the game entirely.
   *  Refuses if they already have buy-ins — that's a money problem, not a
   *  roster one. */
  async function demote(memberId: string, to: 'waitlist' | 'withdrawn') {
    setError(null)
    setBusy(memberId)
    const { error } = await supabase.rpc('demote_from_confirmed', {
      p_game_id: gameId,
      p_member_id: memberId,
      p_to: to,
    })
    setBusy(null)
    if (error) {
      setError(error.message)
      return
    }
    setConfirmRemove(null)
    router.refresh()
  }

  async function start() {
    setError(null)
    setPending(true)
    const { error } = await supabase.rpc('start_game', {
      p_game_id: gameId,
      p_member_ids: players
        .map((p) => p.memberId)
        .filter((id) => here.has(id)),
    })
    setPending(false)
    if (error) {
      setError(error.message)
      return
    }
    setDialogOpen(false)
    router.refresh()
  }

  const checkedCount = players.filter((p) => here.has(p.memberId)).length

  return (
    <div className="flex flex-col gap-3">
      {error && (
        <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-muted-foreground">
          Confirmed ({players.length}/{seatLimit}) ·{' '}
          {seatsLeft === 0 ? 'table full' : `${seatsLeft} seats left`}
        </h2>
        {players.length === 0 && (
          <p className="text-sm text-muted-foreground">Nobody yet.</p>
        )}
        {players.map((p, i) => (
          <div
            key={p.memberId}
            className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2"
          >
            <span className="text-sm">
              <span className="text-muted-foreground">{i + 1}. </span>
              {p.name}
              {p.memberId === myMemberId && (
                <span className="text-muted-foreground"> (you)</span>
              )}
            </span>
            {isAdmin &&
              (confirmRemove === p.memberId ? (
                <span className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => setConfirmRemove(null)}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="destructive"
                    size="xs"
                    disabled={busy === p.memberId}
                    onClick={() => demote(p.memberId, 'withdrawn')}
                  >
                    Remove
                  </Button>
                </span>
              ) : (
                <span className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="xs"
                    disabled={busy === p.memberId}
                    onClick={() => demote(p.memberId, 'waitlist')}
                  >
                    To waitlist
                  </Button>
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => setConfirmRemove(p.memberId)}
                  >
                    Remove
                  </Button>
                </span>
              ))}
          </div>
        ))}
      </section>

      {isAdmin && (
        <>
          <AddPlayer gameId={gameId} available={available} />
          <Button onClick={() => setDialogOpen(true)}>Start game</Button>
        </>
      )}

      {dialogOpen && (
        <div
          className="fixed inset-0 z-30 flex items-end justify-center bg-black/40"
          onClick={() => setDialogOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-t-2xl bg-background p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-semibold">Who&apos;s at the table?</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Everyone you check buys in for {formatCents(defaultBuyinCents)}.
              Add the rest as they arrive.
            </p>

            <div className="mt-3 flex flex-col gap-1">
              {players.map((p) => (
                <label
                  key={p.memberId}
                  className="flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm"
                >
                  <input
                    type="checkbox"
                    className="size-4"
                    checked={here.has(p.memberId)}
                    onChange={(e) =>
                      setHere((prev) => {
                        const next = new Set(prev)
                        if (e.target.checked) next.add(p.memberId)
                        else next.delete(p.memberId)
                        return next
                      })
                    }
                  />
                  {p.name}
                </label>
              ))}
            </div>

            <div className="mt-4 flex items-center justify-between gap-2">
              <span className="text-sm text-muted-foreground">
                {checkedCount} in ·{' '}
                {formatCents(checkedCount * defaultBuyinCents)}
              </span>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={() => setDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={start} disabled={pending}>
                  {pending ? 'Starting…' : 'Start game'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
