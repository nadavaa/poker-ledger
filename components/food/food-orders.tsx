'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { centsToDollars, dollarsToCents, formatCents } from '@/lib/money'
import { previewSplit, splitOrder, type Participant } from '@/lib/split'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'

export type FoodPlayer = {
  memberId: string
  name: string
  signupOrder: number
}

export type FoodShare = {
  memberId: string
  shareCents: number
  isFixed: boolean
}

export type FoodOrder = {
  id: string
  paidByMemberId: string
  description: string | null
  totalCents: number
  createdByMemberId: string
  shares: FoodShare[]
}

/**
 * Delivery, split across whoever ate. Its own line item: these never get
 * netted into the poker transfers, because "you won $80 at cards and owe me
 * $25 for the pizza" are two different conversations.
 */
export function FoodOrders({
  gameId,
  players,
  orders,
  myMemberId,
  isGameAdmin,
}: {
  gameId: string
  players: FoodPlayer[]
  orders: FoodOrder[]
  myMemberId: string | null
  isGameAdmin: boolean
}) {
  const [editing, setEditing] = useState<FoodOrder | null>(null)
  const [adding, setAdding] = useState(false)

  const nameOf = new Map(players.map((p) => [p.memberId, p.name]))
  const canAdd = myMemberId !== null

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-[0.7rem] font-medium uppercase tracking-[0.08em] text-muted-foreground">
        Food
      </h2>

      {orders.length === 0 && !adding && (
        <p className="rounded-xl border border-dashed border-border/70 px-3 py-4 text-center text-sm text-muted-foreground">
          No food orders yet.
        </p>
      )}

      {orders.map((o) =>
        editing?.id === o.id ? (
          <OrderForm
            key={o.id}
            gameId={gameId}
            players={players}
            order={o}
            myMemberId={myMemberId}
            isGameAdmin={isGameAdmin}
            onClose={() => setEditing(null)}
          />
        ) : (
          <OrderCard
            key={o.id}
            order={o}
            nameOf={nameOf}
            myMemberId={myMemberId}
            isGameAdmin={isGameAdmin}
            onEdit={() => setEditing(o)}
          />
        )
      )}

      {adding ? (
        <OrderForm
          gameId={gameId}
          players={players}
          order={null}
          myMemberId={myMemberId}
          isGameAdmin={isGameAdmin}
          onClose={() => setAdding(false)}
        />
      ) : (
        canAdd && (
          <Button
            variant="outline"
            size="sm"
            className="self-start rounded-xl"
            onClick={() => setAdding(true)}
          >
            Add food order
          </Button>
        )
      )}
    </section>
  )
}

function OrderCard({
  order,
  nameOf,
  myMemberId,
  isGameAdmin,
  onEdit,
}: {
  order: FoodOrder
  nameOf: Map<string, string>
  myMemberId: string | null
  isGameAdmin: boolean
  onEdit: () => void
}) {
  const supabase = useMemo(() => createClient(), [])
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [blocked, setBlocked] = useState<
    { display_name: string; amount_cents: number }[] | null
  >(null)
  const [confirming, setConfirming] = useState(false)
  const [pending, setPending] = useState(false)

  const canEdit = isGameAdmin || order.createdByMemberId === myMemberId
  const payer = nameOf.get(order.paidByMemberId) ?? 'Someone'

  async function remove() {
    setError(null)
    setPending(true)
    const { error } = await supabase.rpc('delete_food_order', {
      p_order_id: order.id,
    })
    setPending(false)
    if (error) {
      setError(error.message)
      // Say who has already paid, not just how many.
      const { data } = await supabase.rpc('food_order_confirmed_payers', {
        p_order_id: order.id,
      })
      if (data?.length) setBlocked(data)
      return
    }
    router.refresh()
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-2 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">
              {order.description || 'Food'}
            </p>
            <p className="text-xs text-muted-foreground">
              {payer} paid · split {order.shares.length} ways
            </p>
          </div>
          <span className="money-display shrink-0 text-xl font-semibold">
            {formatCents(order.totalCents)}
          </span>
        </div>

        {/* Participants see the full breakdown so they can check it against
            the receipt. */}
        <ul className="flex flex-col gap-0.5">
          {order.shares.map((s) => (
            <li
              key={s.memberId}
              className="flex justify-between text-xs text-muted-foreground"
            >
              <span>
                {nameOf.get(s.memberId) ?? 'Unknown'}
                {s.memberId === order.paidByMemberId && ' (paid)'}
                {s.isFixed && ' · set'}
              </span>
              <span className="money">{formatCents(s.shareCents)}</span>
            </li>
          ))}
        </ul>

        {canEdit && (
          <div className="flex gap-2">
            <Button variant="ghost" size="xs" onClick={onEdit}>
              Edit
            </Button>
            {confirming ? (
              <>
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => setConfirming(false)}
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  size="xs"
                  disabled={pending}
                  onClick={remove}
                >
                  Delete
                </Button>
              </>
            ) : (
              <Button
                variant="ghost"
                size="xs"
                onClick={() => setConfirming(true)}
              >
                Delete
              </Button>
            )}
          </div>
        )}

        {error && <p className="text-xs text-down">{error}</p>}
        {blocked && (
          <ul className="text-xs text-down">
            {blocked.map((b, i) => (
              <li key={i}>
                {b.display_name} already confirmed{' '}
                {formatCents(b.amount_cents)}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

function OrderForm({
  gameId,
  players,
  order,
  myMemberId,
  isGameAdmin,
  onClose,
}: {
  gameId: string
  players: FoodPlayer[]
  order: FoodOrder | null
  myMemberId: string | null
  isGameAdmin: boolean
  onClose: () => void
}) {
  const supabase = useMemo(() => createClient(), [])
  const router = useRouter()

  const [description, setDescription] = useState(order?.description ?? '')
  const [total, setTotal] = useState(
    order ? centsToDollars(order.totalCents) : ''
  )
  const [paidBy, setPaidBy] = useState(
    order?.paidByMemberId ?? myMemberId ?? players[0]?.memberId ?? ''
  )
  // The payer ate too, so they start checked.
  const [checked, setChecked] = useState<Set<string>>(
    () =>
      new Set(
        order ? order.shares.map((s) => s.memberId) : players.map((p) => p.memberId)
      )
  )
  const [fixed, setFixed] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      (order?.shares ?? [])
        .filter((s) => s.isFixed)
        .map((s) => [s.memberId, centsToDollars(s.shareCents)])
    )
  )
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  function parseDollars(v: string): number | null {
    if (!v.trim()) return null
    try {
      return dollarsToCents(v)
    } catch {
      return null
    }
  }

  const totalCents = parseDollars(total) ?? 0
  const participants: Participant[] = players
    .filter((p) => checked.has(p.memberId))
    .map((p) => ({
      memberId: p.memberId,
      signupOrder: p.signupOrder,
      fixedCents: parseDollars(fixed[p.memberId] ?? ''),
    }))

  const preview = previewSplit(totalCents, participants)

  async function save() {
    setError(null)
    let shares
    try {
      shares = splitOrder(totalCents, participants)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not split that.')
      return
    }
    setPending(true)
    const { error } = await supabase.rpc('save_food_order', {
      p_game_id: gameId,
      p_order_id: order?.id ?? null,
      p_paid_by: paidBy,
      p_description: description || null,
      p_total_cents: totalCents,
      p_shares: shares.map((s) => ({
        member_id: s.memberId,
        share_cents: s.shareCents,
        is_fixed: s.isFixed,
      })),
    })
    setPending(false)
    if (error) {
      setError(error.message)
      return
    }
    onClose()
    router.refresh()
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 py-3">
        <Input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What was it? (optional)"
          maxLength={120}
        />

        <div className="flex gap-2">
          <Input
            inputMode="decimal"
            value={total}
            onChange={(e) => setTotal(e.target.value)}
            placeholder="Total $"
            aria-label="Total amount"
          />
          <select
            value={paidBy}
            onChange={(e) => setPaidBy(e.target.value)}
            aria-label="Who paid"
            disabled={!isGameAdmin && myMemberId !== null}
            className="h-9 flex-1 rounded-lg border border-border bg-background px-2 text-sm disabled:opacity-60"
          >
            {players.map((p) => (
              <option key={p.memberId} value={p.memberId}>
                {p.name} paid
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          {players.map((p) => {
            const on = checked.has(p.memberId)
            return (
              <div
                key={p.memberId}
                className="flex min-h-14 items-center gap-2 rounded-lg border border-border px-3 py-2"
              >
                <label className="flex flex-1 cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="size-4"
                    checked={on}
                    onChange={(e) =>
                      setChecked((prev) => {
                        const next = new Set(prev)
                        if (e.target.checked) next.add(p.memberId)
                        else next.delete(p.memberId)
                        return next
                      })
                    }
                  />
                  {p.name}
                </label>
                {on && (
                  <Input
                    inputMode="decimal"
                    value={fixed[p.memberId] ?? ''}
                    onChange={(e) =>
                      setFixed((prev) => ({
                        ...prev,
                        [p.memberId]: e.target.value,
                      }))
                    }
                    placeholder="even"
                    aria-label={`Set amount for ${p.name}`}
                    className="w-28 text-center"
                  />
                )}
              </div>
            )
          })}
        </div>

        {/* Always visible while you type, same idea as the chip tracker. */}
        <div
          className={`rounded-xl px-3 py-2 text-xs ${
            preview.error
              ? 'bg-down-soft text-down'
              : preview.warning
                ? 'bg-pending-soft text-pending'
                : 'bg-muted text-muted-foreground'
          }`}
        >
          {preview.error ? (
            preview.error
          ) : (
            <span className="money">
              Total {formatCents(preview.totalCents)} · Assigned{' '}
              {formatCents(preview.assignedCents)} · Remaining{' '}
              {formatCents(preview.remainderCents)}
              {preview.evenCount > 0 &&
                ` split ${preview.evenCount} ways = ${formatCents(
                  preview.perHeadCents
                )} each`}
            </span>
          )}
          {preview.warning && <span className="block">{preview.warning}</span>}
        </div>

        {error && <p className="text-xs text-down">{error}</p>}

        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            className="rounded-xl"
            disabled={!!preview.error || pending}
            onClick={save}
          >
            {pending ? 'Saving…' : order ? 'Save changes' : 'Add order'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
