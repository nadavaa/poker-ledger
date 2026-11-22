'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { formatCents } from '@/lib/money'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export type UnsettleTransfer = {
  id: string
  fromName: string
  toName: string
  amountCents: number
}

/** Where the viewing admin stands on a paid-but-unconfirmed payment, which
 *  decides what they can do about it themselves. */
export type PaidTransfer = UnsettleTransfer & {
  viewer: 'payer' | 'payee' | 'other'
  isCash: boolean
}

/** What has to happen to this payment, said to the admin looking at it, in
 *  the words of the buttons on its card. An admin can close out a payment
 *  between two other people, never their own debt; that rule is the
 *  settlement trigger's, this only explains it. */
function howToResolve(s: PaidTransfer): string {
  const amount = formatCents(s.amountCents)
  const confirm = s.isCash ? 'Got the cash' : 'Confirm received'
  switch (s.viewer) {
    case 'payee':
      return `If you got the ${amount}, tap ${confirm} on it. If not, ask ${s.fromName} to tap Undo.`
    case 'payer':
      return `If you haven't paid yet, tap Undo on it. If you have, ask ${s.toName} to confirm they got it.`
    default:
      return `If ${s.toName} got the ${amount}, tap Close out on it above, or ask ${s.toName} to confirm. If ${s.fromName} hasn't actually paid, ask them to tap Undo.`
  }
}

/**
 * Take a settled game back to counting chips so a buy-in or a count can be
 * fixed. unsettle_game() is the rule: admin only, a reason every player sees,
 * refused while a payment is marked paid but unconfirmed. This screen only
 * says what will happen before it does, and what to do when it's blocked.
 */
export function UnsettlePanel({
  gameId,
  pending,
  paid,
  confirmed,
}: {
  gameId: string
  pending: number
  paid: PaidTransfer[]
  confirmed: UnsettleTransfer[]
}) {
  const supabase = useMemo(() => createClient(), [])
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function unsettle() {
    setError(null)
    setBusy(true)
    const { error } = await supabase.rpc('unsettle_game', {
      p_game_id: gameId,
      p_reason: reason,
    })
    setBusy(false)
    if (error) {
      setError(error.message)
      return
    }
    router.refresh()
  }

  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-border p-3.5">
      <h3 className="text-sm font-medium">Unsettle game</h3>
      <p className="text-xs text-muted-foreground">
        Reopens the game for counting so you can fix a buy-in or a chip count,
        then settle again. Every player sees that you did it and why.
      </p>

      {paid.length > 0 ? (
        <>
          <p className="text-xs text-muted-foreground">
            {paid.length === 1
              ? 'One payment is marked paid but not confirmed yet.'
              : `${paid.length} payments are marked paid but not confirmed yet.`}{' '}
            Unsettling would erase {paid.length === 1 ? 'it' : 'them'}, and if
            the money already moved, someone could end up paying twice. Sort{' '}
            {paid.length === 1 ? 'it' : 'each one'} out first:
          </p>
          <ul className="flex flex-col gap-1.5">
            {paid.map((s) => (
              <li
                key={s.id}
                className="flex flex-col gap-1 rounded-lg bg-muted px-2.5 py-2 text-xs"
              >
                <span className="flex items-center justify-between gap-2 font-medium">
                  <span>
                    {s.fromName} pays {s.toName}
                  </span>
                  <span className="tabular-nums">
                    {formatCents(s.amountCents)}
                  </span>
                </span>
                <span className="text-muted-foreground">{howToResolve(s)}</span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">
            Once {paid.length === 1 ? 'it’s' : 'they’re all'} sorted, the
            Unsettle button appears here. A confirmed payment is kept and
            counted when you settle again.
          </p>
        </>
      ) : !open ? (
        <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
          Unsettle…
        </Button>
      ) : (
        <>
          <ul className="flex list-disc flex-col gap-1 pl-4 text-xs text-muted-foreground">
            {pending > 0 && (
              <li>
                {pending} unpaid transfer{pending === 1 ? '' : 's'} will be
                cleared and worked out again.
              </li>
            )}
            {confirmed.length > 0 && (
              <li>
                {confirmed.length} confirmed payment
                {confirmed.length === 1 ? ' stays' : 's stay'}. When you settle
                again, only what&apos;s still owed after{' '}
                {confirmed.length === 1 ? 'it' : 'them'} gets new transfers.
              </li>
            )}
            <li>Food orders are not affected.</li>
            <li>
              The game drops out of everyone&apos;s stats until it settles
              again.
            </li>
          </ul>
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={200}
            placeholder="Why? e.g. Yoni's second buy-in was logged twice"
          />
          <div className="flex gap-2">
            <Button
              variant="destructive"
              size="sm"
              disabled={busy || reason.trim() === ''}
              onClick={unsettle}
            >
              {busy ? 'Unsettling…' : 'Unsettle game'}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => {
                setOpen(false)
                setError(null)
              }}
            >
              Never mind
            </Button>
          </div>
        </>
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
