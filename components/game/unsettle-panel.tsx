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

/**
 * Take a settled game back to counting chips so a buy-in or a count can be
 * fixed. unsettle_game() is the rule: admin only, a reason every player sees,
 * refused while a payment is marked paid but unconfirmed. This screen only
 * says what will happen before it does.
 */
export function UnsettlePanel({
  gameId,
  pending,
  paid,
  confirmed,
}: {
  gameId: string
  pending: number
  paid: UnsettleTransfer[]
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
            These payments are marked paid but not confirmed. Money may already
            have moved, so they have to be confirmed (or closed out) or undone
            first:
          </p>
          <ul className="flex flex-col gap-1">
            {paid.map((s) => (
              <li
                key={s.id}
                className="flex items-center justify-between gap-2 rounded-lg bg-muted px-2 py-1.5 text-xs"
              >
                <span>
                  {s.fromName} pays {s.toName}
                </span>
                <span className="tabular-nums">{formatCents(s.amountCents)}</span>
              </li>
            ))}
          </ul>
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
