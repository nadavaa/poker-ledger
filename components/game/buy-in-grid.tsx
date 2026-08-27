'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { centsToChips, centsToDollars, dollarsToCents, formatCents } from '@/lib/money'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ActivityFeed } from './activity-feed'
import { useGameBuyins, type Buyin } from './use-game-buyins'
import { useSignupRefresh } from './use-signup-refresh'

export type Player = { memberId: string; name: string }

const LONG_PRESS_MS = 450
const UNDO_MS = 5000

export function BuyInGrid({
  gameId,
  players,
  adminMemberId,
  defaultBuyinCents,
  chipsPerDollar,
  initialBuyins,
}: {
  gameId: string
  players: Player[]
  adminMemberId: string
  defaultBuyinCents: number
  chipsPerDollar: number
  initialBuyins: Buyin[]
}) {
  const supabase = useMemo(() => createClient(), [])
  const router = useRouter()
  const { buyins, totalsByMember, potCents, merge } = useGameBuyins(
    gameId,
    initialBuyins
  )
  useSignupRefresh(gameId)

  const [error, setError] = useState<string | null>(null)
  const [undo, setUndo] = useState<{ id: string; name: string } | null>(null)
  const [sheet, setSheet] = useState<Player | null>(null)

  const names = new Map(players.map((p) => [p.memberId, p.name]))
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(
    () => () => {
      if (undoTimer.current) clearTimeout(undoTimer.current)
    },
    []
  )

  async function addBuyin(player: Player, cents: number, note?: string) {
    setError(null)
    const { data, error } = await supabase
      .from('buyins')
      .insert({
        game_id: gameId,
        member_id: player.memberId,
        amount_cents: cents,
        chips: centsToChips(cents, chipsPerDollar),
        note: note?.trim() ? note.trim() : null,
      })
      .select(
        'id, member_id, amount_cents, chips, note, created_at, created_by_member_id, voided_at, void_reason, is_auto'
      )
      .single()

    if (error) {
      // Most likely cause: admin was transferred away while this screen was stale.
      setError(error.message)
      return
    }

    merge([data as Buyin])
    if (undoTimer.current) clearTimeout(undoTimer.current)
    setUndo({ id: data.id, name: player.name })
    undoTimer.current = setTimeout(() => setUndo(null), UNDO_MS)
  }

  async function voidBuyin(id: string, reason: string) {
    setError(null)
    const { data, error } = await supabase
      .from('buyins')
      .update({ void_reason: reason })
      .eq('id', id)
      .select(
        'id, member_id, amount_cents, chips, note, created_at, created_by_member_id, voided_at, void_reason, is_auto'
      )
      .single()

    if (error) {
      setError(error.message)
      return
    }
    merge([data as Buyin])
  }

  async function removePlayer(player: Player) {
    setError(null)
    // Freeing the seat is all this does; the promotion trigger pulls up the
    // first waitlister, and their stake is created with them.
    const { error } = await supabase
      .from('game_signups')
      .update({ status: 'withdrawn' })
      .eq('game_id', gameId)
      .eq('member_id', player.memberId)

    if (error) {
      setError(error.message)
      return
    }
    setSheet(null)
    router.refresh()
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="sticky top-0 z-10 -mx-4 flex items-baseline justify-between border-b border-border bg-background px-4 py-2">
        <span className="text-sm text-muted-foreground">Pot</span>
        <span className="text-xl font-semibold tabular-nums">
          {formatCents(potCents)}
        </span>
      </div>

      {error && (
        <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="grid grid-cols-2 gap-2">
        {players.map((p) => (
          <PlayerCard
            key={p.memberId}
            player={p}
            total={totalsByMember.get(p.memberId)}
            onTap={() => addBuyin(p, defaultBuyinCents)}
            onLongPress={() => setSheet(p)}
          />
        ))}
      </div>
      {players.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Nobody is confirmed for this game yet.
        </p>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-muted-foreground">Activity</h2>
        <ActivityFeed
          buyins={buyins}
          names={names}
          adminMemberId={adminMemberId}
        />
      </section>

      {undo && (
        <div className="fixed inset-x-0 bottom-4 z-20 mx-auto flex w-[min(28rem,calc(100%-2rem))] items-center justify-between gap-2 rounded-lg bg-foreground px-3 py-2 text-background shadow-lg">
          <span className="text-sm">
            {formatCents(defaultBuyinCents)} for {undo.name}
          </span>
          <button
            className="text-sm font-medium underline"
            onClick={() => {
              voidBuyin(undo.id, 'undo')
              setUndo(null)
            }}
          >
            Undo
          </button>
        </div>
      )}

      {sheet && (
        <PlayerSheet
          key={sheet.memberId}
          player={sheet}
          chipsPerDollar={chipsPerDollar}
          defaultBuyinCents={defaultBuyinCents}
          buyins={buyins.filter((b) => b.member_id === sheet.memberId)}
          onClose={() => setSheet(null)}
          onAdd={(cents, note) => addBuyin(sheet, cents, note)}
          onVoid={(id) => voidBuyin(id, 'admin correction')}
          onRemove={() => removePlayer(sheet)}
        />
      )}
    </div>
  )
}

function PlayerCard({
  player,
  total,
  onTap,
  onLongPress,
}: {
  player: Player
  total?: { cents: number; count: number }
  onTap: () => void
  onLongPress: () => void
}) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fired = useRef(false)

  function start() {
    fired.current = false
    timer.current = setTimeout(() => {
      fired.current = true
      onLongPress()
    }, LONG_PRESS_MS)
  }

  function cancel(commitTap: boolean) {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    if (commitTap && !fired.current) onTap()
  }

  return (
    <button
      type="button"
      // No confirmation dialog: speed matters more than accuracy, because
      // void exists.
      onPointerDown={start}
      onPointerUp={() => cancel(true)}
      onPointerLeave={() => cancel(false)}
      onPointerCancel={() => cancel(false)}
      onContextMenu={(e) => e.preventDefault()}
      className="flex touch-manipulation select-none flex-col items-start gap-1 rounded-lg border border-border p-3 text-left transition-colors active:bg-muted"
    >
      <span className="text-sm font-medium">{player.name}</span>
      <span className="text-lg font-semibold tabular-nums">
        {formatCents(total?.cents ?? 0)}
      </span>
      <span className="text-xs text-muted-foreground">
        {total?.count ?? 0} buy-in{(total?.count ?? 0) === 1 ? '' : 's'}
      </span>
    </button>
  )
}

function PlayerSheet({
  player,
  chipsPerDollar,
  defaultBuyinCents,
  buyins,
  onClose,
  onAdd,
  onVoid,
  onRemove,
}: {
  player: Player
  chipsPerDollar: number
  defaultBuyinCents: number
  buyins: Buyin[]
  onClose: () => void
  onAdd: (cents: number, note?: string) => void
  onVoid: (id: string) => void
  onRemove: () => void
}) {
  const [amount, setAmount] = useState(centsToDollars(defaultBuyinCents))
  const [note, setNote] = useState('')
  const [invalid, setInvalid] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(false)

  function submit(e: React.FormEvent) {
    e.preventDefault()
    let cents: number
    try {
      cents = dollarsToCents(amount)
    } catch {
      setInvalid(true)
      return
    }
    if (cents <= 0) {
      setInvalid(true)
      return
    }
    onAdd(cents, note)
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-30 flex items-end justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-t-2xl bg-background p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">{player.name}</h3>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>

        <form onSubmit={submit} className="mt-3 flex flex-col gap-2">
          <div className="flex gap-2">
            <Input
              autoFocus
              inputMode="decimal"
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value)
                setInvalid(false)
              }}
              aria-invalid={invalid}
              aria-label="Custom amount in dollars"
            />
            <Button type="submit">Add</Button>
          </div>
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Note (optional)"
            maxLength={120}
          />
          {invalid && (
            <p className="text-sm text-destructive">Enter a valid amount.</p>
          )}
          <p className="text-xs text-muted-foreground">
            {(() => {
              try {
                return `${centsToChips(dollarsToCents(amount), chipsPerDollar)} chips`
              } catch {
                return ' '
              }
            })()}
          </p>
        </form>

        <div className="mt-4 flex flex-col gap-1.5">
          <h4 className="text-sm font-medium text-muted-foreground">
            Their buy-ins
          </h4>
          {buyins.length === 0 && (
            <p className="text-sm text-muted-foreground">None yet.</p>
          )}
          {buyins.map((b) => (
            <div
              key={b.id}
              className="flex items-center justify-between gap-2 rounded-lg border border-border px-2.5 py-1.5 text-sm"
            >
              <span className={b.voided_at ? 'line-through opacity-50' : ''}>
                {formatCents(b.amount_cents)}
                {b.is_auto && (
                  <span className="text-muted-foreground"> · on join</span>
                )}
                {b.note && (
                  <span className="text-muted-foreground"> · {b.note}</span>
                )}
              </span>
              {b.voided_at ? (
                <span className="text-xs text-muted-foreground">voided</span>
              ) : (
                <Button
                  variant="destructive"
                  size="xs"
                  onClick={() => onVoid(b.id)}
                >
                  Void
                </Button>
              )}
            </div>
          ))}
        </div>

        <div className="mt-4 border-t border-border pt-3">
          {confirmRemove ? (
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm text-muted-foreground">
                Free their seat?
              </span>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfirmRemove(false)}
                >
                  Cancel
                </Button>
                <Button variant="destructive" size="sm" onClick={onRemove}>
                  Remove
                </Button>
              </div>
            </div>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setConfirmRemove(true)}
            >
              Remove from game
            </Button>
          )}
          <p className="mt-1 text-xs text-muted-foreground">
            The first waitlister takes the seat. Before the game starts their
            buy-in on join is voided; once it has started their money stays in
            the pot.
          </p>
        </div>
      </div>
    </div>
  )
}
