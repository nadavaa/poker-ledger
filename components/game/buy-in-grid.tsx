'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  centsToChips,
  centsToDollars,
  chipsToCents,
  dollarsToCents,
  formatCents,
} from '@/lib/money'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ActivityFeed } from './activity-feed'
import { useGameBuyins, type Buyin } from './use-game-buyins'
import { useSignupRefresh } from './use-signup-refresh'
import {
  enqueue,
  flushQueue,
  queuedFor,
  type QueuedBuyin,
} from '@/lib/offline-queue'
import { AddPlayer, type AvailableMember } from './add-player'
import { PotHeader } from './pot-header'
import { CollapsibleSection } from '@/components/collapsible-section'
import {
  cashoutFor,
  hasLeftTable,
  tableState,
  type CashoutRecord,
} from '@/lib/table'

export type Player = {
  memberId: string
  name: string
  /** For the avatar: the profile drives the photo, the id drives the colour. */
  profileId?: string | null
  avatarUrl?: string | null
}

function timeOf(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  })
}

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
  initialCashouts,
  beforeActivity,
}: {
  gameId: string
  players: Player[]
  adminMemberId: string
  defaultBuyinCents: number
  chipsPerDollar: number
  initialBuyins: Buyin[]
  available: AvailableMember[]
  startedAt: string | null
  /** Who has already left with their chips. */
  initialCashouts: CashoutRecord[]
  /** Rendered between the grid and the feed — the food order lives here. */
  beforeActivity?: React.ReactNode
}) {
  const supabase = useMemo(() => createClient(), [])
  const router = useRouter()
  const { buyins, totalsByMember, potCents, potChips, merge } = useGameBuyins(
    gameId,
    initialBuyins
  )
  useSignupRefresh(gameId)

  const [error, setError] = useState<string | null>(null)
  const [queued, setQueued] = useState(0)
  const [undo, setUndo] = useState<{
    id: string
    name: string
    amountCents: number
  } | null>(null)
  const [undoPending, setUndoPending] = useState(false)
  const [sheet, setSheet] = useState<Player | null>(null)

  // Seeded from the server and moved optimistically, so cashing someone out
  // dims their card and updates the header on the tap rather than a round
  // trip later. The server's answer wins as soon as it arrives.
  const [cashouts, setCashouts] = useState(initialCashouts)
  const serverSig = initialCashouts
    .map((c) => `${c.memberId}:${c.chips}:${c.leftTable}`)
    .join(',')
  const [seenSig, setSeenSig] = useState(serverSig)
  if (seenSig !== serverSig) {
    setSeenSig(serverSig)
    setCashouts(initialCashouts)
  }

  const anyoneLeft = cashouts.some((c) => c.leftTable)
  const onTable = tableState({
    potChips,
    potCents,
    cashouts,
    chipsPerDollar,
  })

  const names = new Map(players.map((p) => [p.memberId, p.name]))
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(
    () => () => {
      if (undoTimer.current) clearTimeout(undoTimer.current)
    },
    []
  )

  useEffect(() => {
    async function send(item: QueuedBuyin) {
      return supabase.from('buyins').insert({
        game_id: item.gameId,
        member_id: item.memberId,
        amount_cents: item.amountCents,
        chips: item.chips,
        note: item.note,
      })
    }

    async function drain() {
      const sent = await flushQueue(gameId, send)
      setQueued(queuedFor(gameId).length)
      if (sent > 0) router.refresh()
    }

    window.addEventListener('online', drain)
    drain()
    return () => window.removeEventListener('online', drain)
  }, [supabase, gameId, router])

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
      // A failed fetch means the network went, not that the write was
      // refused. Keep the tap and send it when we're back.
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        enqueue({
          gameId,
          memberId: player.memberId,
          amountCents: cents,
          chips: centsToChips(cents, chipsPerDollar),
          note: note?.trim() ? note.trim() : null,
        })
        setQueued(queuedFor(gameId).length)
        setError(null)
        return
      }
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

  async function cashOut(player: Player, chips: number) {
    setError(null)
    const { error } = await supabase.rpc('record_cashout', {
      p_game_id: gameId,
      p_member_id: player.memberId,
      p_chips: chips,
    })
    if (error) {
      setError(error.message)
      return
    }
    setCashouts((prev) => [
      ...prev.filter((c) => c.memberId !== player.memberId),
      {
        memberId: player.memberId,
        chips,
        recordedAt: new Date().toISOString(),
        leftTable: true,
      },
    ])
    setSheet(null)
    router.refresh()
  }

  async function undoCashOut(player: Player) {
    setError(null)
    const { error } = await supabase.rpc('undo_cashout', {
      p_game_id: gameId,
      p_member_id: player.memberId,
    })
    if (error) {
      setError(error.message)
      return
    }
    setCashouts((prev) =>
      prev.filter((c) => c.memberId !== player.memberId)
    )
    setSheet(null)
    router.refresh()
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
        onTable={
          anyoneLeft
            ? {
                chips: onTable.chipsOnTable,
                cents: onTable.centsOnTable,
                overdrawn: onTable.overdrawn,
              }
            : undefined
        }
      />

      {error && (
        <p className="rounded-xl bg-down-soft px-3 py-2 text-sm text-down">
          {error}
        </p>
      )}

      {queued > 0 && (
        <p className="rounded-xl bg-pending-soft px-3 py-2 text-sm text-pending">
          {queued} buy-in{queued === 1 ? '' : 's'} saved on this phone. They
          send themselves when you&apos;re back online.
        </p>
      )}

      <div className="grid grid-cols-2 gap-2.5">
        {players.map((p) => (
          <PlayerCard
            key={p.memberId}
            player={p}
            total={totalsByMember.get(p.memberId)}
            cashedOut={
              hasLeftTable(p.memberId, cashouts)
                ? {
                    chips: cashoutFor(p.memberId, cashouts)?.chips ?? 0,
                    cents: chipsToCents(
                      cashoutFor(p.memberId, cashouts)?.chips ?? 0,
                      chipsPerDollar
                    ),
                  }
                : null
            }
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

      {beforeActivity}

      <CollapsibleSection title="Activity">
        <ActivityFeed
          buyins={buyins}
          cashouts={cashouts}
          names={names}
          adminMemberId={adminMemberId}
          myMemberId={adminMemberId}
        />
      </CollapsibleSection>

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
              // The recovery path on the most-tapped screen, so it gets a
              // full-size target rather than the height its text implies.
              className="-my-1 flex min-h-11 items-center rounded-xl px-4 text-sm font-semibold text-up transition-transform duration-100 active:scale-95 disabled:opacity-50"
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
          cashout={cashoutFor(sheet.memberId, cashouts)}
          onClose={() => setSheet(null)}
          onAdd={(cents, note) => addBuyin(sheet, cents, note)}
          onVoid={(id) => voidBuyin(id, 'admin correction')}
          onRemove={() => removePlayer(sheet)}
          onCashOut={(chips) => cashOut(sheet, chips)}
          onUndoCashOut={() => undoCashOut(sheet)}
        />
      )}
    </div>
  )
}

function PlayerCard({
  player,
  total,
  cashedOut,
  onTap,
  onLongPress,
}: {
  player: Player
  total?: { cents: number; count: number }
  /** Left the game with this much; no more buy-ins for them. */
  cashedOut: { chips: number; cents: number } | null
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
    // The database refuses a buy-in for someone who cashed out. The card
    // says so rather than firing a tap that comes back as an error.
    if (commitTap && !fired.current && !cashedOut) onTap()
  }

  return (
    // The card is the tap target; the dots are a second, smaller one. Siblings
    // rather than nested, since a button inside a button is invalid and the
    // inner one would swallow the card's press handlers.
    <div className="relative">
      <button
        type="button"
        // No confirmation dialog: speed matters more than accuracy, because
        // void exists. Feedback is on pointer-down, never on release.
        onPointerDown={start}
        onPointerUp={() => cancel(true)}
        onPointerLeave={() => cancel(false)}
        onPointerCancel={() => cancel(false)}
        onContextMenu={(e) => e.preventDefault()}
        aria-disabled={!!cashedOut}
        className={`flex min-h-[7.5rem] w-full touch-manipulation select-none flex-col justify-between rounded-2xl border p-3.5 text-left transition-[transform,background-color,border-color] duration-100 ease-out ${
          cashedOut
            ? 'border-border/60 bg-card/30 opacity-60'
            : staked
              ? 'border-border bg-card active:scale-[0.97] active:bg-muted'
              : 'border-dashed border-border/70 bg-card/40 active:scale-[0.97] active:bg-muted/60'
        }`}
      >
        <span className="line-clamp-1 pr-8 text-[0.9rem] font-medium text-foreground/90">
          {player.name}
        </span>

        {cashedOut ? (
          <>
            {/* What they left with, in both units — the dollar figure is
                what the settlement will use. */}
            <span className="money-display text-[2rem] font-semibold text-muted-foreground">
              {formatCents(cashedOut.cents)}
            </span>
            {/* Never colour alone: dimming is reinforced by the word. */}
            <span className="money flex items-center gap-1 text-xs text-muted-foreground">
              <span aria-hidden>✓</span>
              Cashed out · {cashedOut.chips.toLocaleString()} chips
            </span>
          </>
        ) : (
          <>
            <span
              className={`money-display text-[2rem] font-semibold ${
                staked ? 'text-foreground' : 'text-muted-foreground'
              }`}
            >
              {formatCents(total?.cents ?? 0)}
            </span>

            <BuyInDots count={count} />
          </>
        )}
      </button>


      {/* Without this, a custom amount, a note and voiding are reachable only
          by holding the card, with nothing on screen saying so. */}
      <button
        type="button"
        onClick={onLongPress}
        aria-label={`More options for ${player.name}`}
        className="absolute right-1 top-1 flex size-11 touch-manipulation items-center justify-center rounded-xl text-muted-foreground transition-transform duration-100 active:scale-90 active:bg-muted"
      >
        <svg viewBox="0 0 20 20" aria-hidden className="size-5 fill-current">
          <circle cx="4" cy="10" r="1.6" />
          <circle cx="10" cy="10" r="1.6" />
          <circle cx="16" cy="10" r="1.6" />
        </svg>
      </button>
    </div>
  )
}

/** Buy-in count as pips — countable at a glance without reading a number. */
function BuyInDots({ count }: { count: number }) {
  if (count === 0) {
    return (
      <span className="text-xs text-muted-foreground">tap to buy in</span>
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
  cashout,
  onClose,
  onAdd,
  onVoid,
  onRemove,
  onCashOut,
  onUndoCashOut,
}: {
  player: Player
  chipsPerDollar: number
  defaultBuyinCents: number
  buyins: Buyin[]
  cashout: CashoutRecord | null
  onClose: () => void
  onAdd: (cents: number, note?: string) => void
  onVoid: (id: string) => void
  onRemove: () => void
  onCashOut: (chips: number) => void
  onUndoCashOut: () => void
}) {
  const [amount, setAmount] = useState(centsToDollars(defaultBuyinCents))
  const [note, setNote] = useState('')
  const [invalid, setInvalid] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [cashingOut, setCashingOut] = useState(false)
  const [chipsOut, setChipsOut] = useState('')
  const gone = !!cashout?.leftTable
  // Voiding cannot be taken back, so it takes two taps like every other
  // destructive action in the app.
  const [confirmVoid, setConfirmVoid] = useState<string | null>(null)

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

        {gone ? (
          <div className="mt-3 flex flex-col gap-2 rounded-xl border border-border bg-muted/40 p-3">
            <p className="text-sm font-medium">
              <span aria-hidden>✓</span> Cashed out{' '}
              <span className="money">
                {cashout!.chips.toLocaleString()} chips
              </span>{' '}
              <span className="text-muted-foreground">
                · {formatCents(chipsToCents(cashout!.chips, chipsPerDollar))}
              </span>
            </p>
            <p className="text-xs text-muted-foreground">
              Recorded {timeOf(cashout!.recordedAt)}. They can&apos;t buy in
              again until this is undone, and the count carries into the
              final settlement.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="self-start rounded-xl"
              onClick={onUndoCashOut}
            >
              Undo cash out
            </Button>
          </div>
        ) : (
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
        )}

        {/* Between buying in and being removed: they played, they're leaving,
            and their chips count. */}
        {!gone && (
          <div className="mt-3 border-t border-border pt-3">
            {cashingOut ? (
              <form
                className="flex flex-col gap-2"
                onSubmit={(e) => {
                  e.preventDefault()
                  if (chipsOut === '') return
                  onCashOut(Number(chipsOut))
                }}
              >
                <label
                  htmlFor={`chips-out-${player.memberId}`}
                  className="text-sm font-medium"
                >
                  Chips they&apos;re leaving with
                </label>
                <div className="flex gap-2">
                  <Input
                    autoFocus
                    id={`chips-out-${player.memberId}`}
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={chipsOut}
                    // Digits only, stripped as you type — the same rule as
                    // the end-game counting screen.
                    onChange={(e) =>
                      setChipsOut(e.target.value.replace(/\D/g, ''))
                    }
                    placeholder="0"
                    className="money h-11 text-center !text-lg font-semibold"
                  />
                  <Button type="submit" disabled={chipsOut === ''}>
                    Cash out
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setCashingOut(false)}
                  >
                    Cancel
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  {chipsOut === ''
                    ? '0 is a real count — it means they busted.'
                    : `${formatCents(
                        chipsToCents(Number(chipsOut), chipsPerDollar)
                      )} · frees their seat for the waitlist`}
                </p>
              </form>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="rounded-xl"
                onClick={() => setCashingOut(true)}
              >
                Cash out
              </Button>
            )}
          </div>
        )}

        <div className="mt-4 flex flex-col gap-2">
          <h4 className="text-sm font-medium text-muted-foreground">
            Their buy-ins
          </h4>
          {buyins.length === 0 && (
            <p className="text-sm text-muted-foreground">None yet.</p>
          )}
          {buyins.map((b) => (
            <div
              key={b.id}
              className="flex min-h-12 items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-sm"
            >
              {/* The time is what tells four identical $50 rows apart. */}
              <span className={b.voided_at ? 'line-through opacity-50' : ''}>
                <span className="money font-medium">
                  {formatCents(b.amount_cents)}
                </span>
                <span className="money text-muted-foreground">
                  {' '}
                  · {timeOf(b.created_at)}
                </span>
                {b.note && (
                  <span className="text-muted-foreground"> · {b.note}</span>
                )}
              </span>

              {b.voided_at ? (
                <span className="text-xs text-muted-foreground">voided</span>
              ) : confirmVoid === b.id ? (
                <span className="flex shrink-0 items-center gap-2">
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => setConfirmVoid(null)}
                  >
                    Keep
                  </Button>
                  <Button
                    variant="destructive"
                    size="xs"
                    onClick={() => {
                      onVoid(b.id)
                      setConfirmVoid(null)
                    }}
                  >
                    Void it
                  </Button>
                </span>
              ) : (
                <Button
                  variant="ghost"
                  size="xs"
                  className="shrink-0"
                  onClick={() => setConfirmVoid(b.id)}
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
