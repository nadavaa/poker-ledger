'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  TransferCard,
  type TransferRow,
} from '@/components/settle/transfer-card'
import { settlementProgress, settlementRole } from '@/lib/settlements'
import type { PaymentSources } from '@/lib/payment'

/**
 * The settlement list and its counter, together in one client component so
 * confirming a transfer redraws both without waiting for the server. Holding
 * the statuses here rather than inside each card is what lets the count move
 * the instant the row does.
 */
export function SettlementSection({
  transfers,
  names,
  paymentSources,
  venmoNote,
  myMemberId,
  isAdmin,
}: {
  /** RLS already limits this to rows the viewer is party to, unless admin. */
  transfers: TransferRow[]
  names: Map<string, string>
  paymentSources: Map<string, PaymentSources>
  venmoNote: string
  myMemberId: string | null
  isAdmin: boolean
}) {
  const supabase = useMemo(() => createClient(), [])
  const router = useRouter()

  const [overrides, setOverrides] = useState<Record<string, string>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<Record<string, boolean>>({})

  // When the server catches up, its answer wins: drop the optimistic layer
  // rather than letting a stale override shadow the real status.
  const serverSig = transfers.map((t) => `${t.id}:${t.status}`).join(',')
  const [seenSig, setSeenSig] = useState(serverSig)
  if (seenSig !== serverSig) {
    setSeenSig(serverSig)
    setOverrides({})
  }

  const rows = transfers.map((t) =>
    overrides[t.id] ? { ...t, status: overrides[t.id] } : t
  )

  async function move(id: string, next: 'paid' | 'pending' | 'confirmed') {
    setErrors((e) => ({ ...e, [id]: '' }))
    setBusy((b) => ({ ...b, [id]: true }))
    setOverrides((o) => ({ ...o, [id]: next })) // optimistic: row and count move on tap
    const { error } = await supabase
      .from('settlements')
      .update({ status: next })
      .eq('id', id)
    setBusy((b) => ({ ...b, [id]: false }))
    if (error) {
      setOverrides((o) => {
        const rest = { ...o }
        delete rest[id]
        return rest
      })
      setErrors((e) => ({ ...e, [id]: error.message }))
      return
    }
    router.refresh()
  }

  const progress = settlementProgress(rows, myMemberId, isAdmin)
  const outstanding = rows.filter((t) => t.status !== 'confirmed')
  const square = !isAdmin && outstanding.length === 0

  return (
    <>
      <h2 className="flex items-baseline justify-between gap-2 text-[0.7rem] font-medium uppercase tracking-[0.08em] text-muted-foreground">
        <span>{isAdmin ? 'Who pays who' : 'Your settlements'}</span>
        {/* The viewer's own tally. A player is never shown the game-wide
            number: it isn't theirs and it can't be acted on. */}
        {progress.total > 0 && (
          <span className="money normal-case tracking-normal">
            {progress.confirmed} of {progress.total} confirmed
          </span>
        )}
      </h2>

      {isAdmin && rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border/70 px-3 py-4 text-center text-sm text-muted-foreground">
          Everyone came out even. Nothing to pay.
        </p>
      ) : square ? (
        <div className="rounded-2xl border border-up/30 bg-up-soft px-4 py-6 text-center">
          <p className="flex items-center justify-center gap-2 text-sm font-semibold text-up">
            <span aria-hidden>✓</span>
            You&apos;re square for this game
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Nothing to pay and nothing to collect.
          </p>
        </div>
      ) : (
        // Poker and food stay separate line items, even between the same two
        // people: they are two different debts.
        [
          {
            label: 'Poker',
            rows: (isAdmin ? rows : outstanding).filter(
              (t) => t.kind !== 'food'
            ),
          },
          {
            label: 'Food',
            rows: (isAdmin ? rows : outstanding).filter(
              (t) => t.kind === 'food'
            ),
          },
        ]
          .filter((g) => g.rows.length > 0)
          .map((g) => (
            <div key={g.label} className="flex flex-col gap-2">
              <p className="text-xs font-medium text-muted-foreground">
                {g.label}
              </p>
              {g.rows.map((t) => (
                <TransferCard
                  key={t.id}
                  transfer={t}
                  role={settlementRole(t, myMemberId)}
                  names={names}
                  paymentSources={paymentSources}
                  venmoNote={venmoNote}
                  isGameAdmin={isAdmin}
                  pending={!!busy[t.id]}
                  error={errors[t.id] || null}
                  onMove={(next) => move(t.id, next)}
                />
              ))}
            </div>
          ))
      )}
    </>
  )
}
