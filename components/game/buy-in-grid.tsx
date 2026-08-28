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
import { AddPlayer, type AvailableMember } from './add-player'
import { PotHeader } from './pot-header'

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
  available,
  startedAt,
}: {
  gameId: string
  players: Player[]
  adminMemberId: string
  defaultBuyinCents: number
  chipsPerDollar: number
  initialBuyins: Buyin[]
  available: AvailableMember[]
  startedAt: string | null
}) {
  const supabase = useMemo(() => createClient(), [])
  const router = useRouter()
  const { buyins, totalsByMember, potCents, potChips, merge } = useGameBuyins(
    gameId,
    initialBuyins
  )
  useSignupRefresh(gameId)

  const [error, setError] = useState<string | null>(null)
  const [undo, setUndo] = useState<{
    id: string
    name: string
    amountCents: number
  } | null>(null)
  const [undoPending, setUndoPending] = useState(false)
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
        'id, member_id, amount_cents, chips, note, created_at, created_by_member_id, voided_at, void_reason'
      )
      .single()

    if (error) {
      // Most likely cause: admin was transferred away while this screen was stale.
      setError(error.message)
      return
    }

    merge([data as Buyin])
    if (undoTimer.current) clearTimeout(undoTimer.current)
    // Carry the real amount: a long-press buy-in isn't the default one.
    setUndo({ id: data.id, name: player.name, amountCents: data.amount_cents })
    setUndoPending(false)
    undoTimer.current = setTimeout(() => setUndo(null), UNDO_MS)
  }

  async function voidBuyin(id: string, reason: string) {
    setError(null)
    // Already voided here or by another device's Realtime update. The trigger
    // would reject a second void, and there is nothing to tell the admin.
    if (buyins.some((b) => b.id === id && b.voided_at)) return
    const { data, error } = await supabase
      .from('buyins')
      .update({ void_reason: reason })
      .eq('id', id)
      .select(
        'id, member_id, amount_cents, chips, note, created_at, created_by_member_id, voided_at, void_reason'
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
      <PotHeader
        potCents={potCents}
        potChips={potChips}
        startedAt={startedAt}
      />

      {error && (
        <p className="rounded-xl bg-down-soft px-3 py-2 text-sm text-down">
          {error}
        </p>
      )}

      <div className="grid grid-cols-2 gap-2.5">
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

      <AddPlayer gameId={gameId} available={available} />

      <section className="flex flex-col gap-2">
        <h2 className="text-[0.7rem] font-medium uppercase tracking-[0.08em] text-muted-foreground">
          Activity
        </h2>
        <ActivityFeed
          buyins={buyins}
          names={names}
          adminMemberId={adminMemberId}
        />
      </section>

      {undo && (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center pb-safe">
          <div className="material pointer-events-auto mx-4 flex w-full max-w-md animate-[toast-in_200ms_ease-out] items-center justify-between gap-3 rounded-2xl border border-white/10 bg-popover/85 py-2 pl-4 pr-2 shadow-2xl backdrop-blur-xl">
            <span className="text-sm text-foreground">
              <span className="money font-semibold">
                {formatCents(undo.amountCents)}
              </span>{' '}
              <span className="text-muted-foreground">for {undo.name}</span>
            </span>
            <button
              disabled={undoPending}
              className="-my-1 rounded-xl px-3 py-2.5 text-sm font-semibold text-up transition-transform duration-100 active:scale-95 disabled:opacity-50"
              onClick={async () => {
                if (undoPending) return
                setUndoPending(true)
                await voidBuyin(undo.id, 'undo')
                setUndoPending(false)
                setUndo(null)
              }}
            >
              Undo
            </button>
          </div>
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
  const count = total?.count ?? 0
  const staked = count > 0

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
      // void exists. Feedback is on pointer-down, never on release.
      onPointerDown={start}
      onPointerUp={() => cancel(true)}
      onPointerLeave={() => cancel(false)}
      onPointerCancel={() => cancel(false)}
      onContextMenu={(e) => e.preventDefault()}
      className={`flex min-h-[7.5rem] touch-manipulation select-none flex-col justify-between rounded-2xl border p-3.5 text-left transition-[transform,background-color,border-color] duration-100 ease-out active:scale-[0.97] ${
        staked
          ? 'border-border bg-card active:bg-muted'
          : 'border-dashed border-border/70 bg-card/40 active:bg-muted/60'
      }`}
    >
      <span className="line-clamp-1 text-[0.9rem] font-medium text-foreground/90">
        {player.name}
      </span>

      <span
        className={`money-display text-[2rem] font-semibold ${
          staked ? 'text-foreground' : 'text-muted-foreground/50'
        }`}
      >
        {formatCents(total?.cents ?? 0)}
      </span>

      <BuyInDots count={count} />
    </button>
  )
}

/** Buy-in count as pips — countable at a glance without reading a number. */
function BuyInDots({ count }: { count: number }) {
  if (count === 0) {
    return (
      <span className="text-xs text-muted-foreground/70">tap to buy in</span>
    )
  }
  if (count > 6) {
    return (
      <span className="money text-xs text-muted-foreground">
        {count} buy-ins
      </span>
    )
  }
  return (
    <span
      className="flex items-center gap-1"
      aria-label={`${count} buy-in${count === 1 ? '' : 's'}`}
    >
      {Array.from({ length: count }).map((_, i) => (
        <span key={i} aria-hidden className="size-1.5 rounded-full bg-up" />
      ))}
    </span>
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
            The first waitlister takes the seat. Everything this player bought
            in for is voided and comes back out of the pot.
          </p>
        </div>
      </div>
    </div>
  )
}
