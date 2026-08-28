'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { formatCents } from '@/lib/money'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export type BlockingSettlement = {
  id: string
  fromName: string
  toName: string
  amountCents: number
  status: string
}

/**
 * Deleting a game is only ever allowed for one that never happened. Anything
 * with money in it gets cancelled instead, which keeps the roster, the
 * buy-ins and the audit trail and only means no settlement is computed.
 *
 * The rules are RLS policies; this screen explains them and makes the user
 * type the name so a destructive action can't be a stray tap.
 */
export function DangerZone({
  gameId,
  groupId,
  gameLabel,
  status,
  signupCount,
  buyinCount,
  buyinTotalCents,
  blockingSettlements,
  canDelete,
  canCancel,
}: {
  gameId: string
  groupId: string
  gameLabel: string
  status: string
  signupCount: number
  buyinCount: number
  buyinTotalCents: number
  blockingSettlements: BlockingSettlement[]
  canDelete: boolean
  canCancel: boolean
}) {
  const supabase = useMemo(() => createClient(), [])
  const router = useRouter()

  const [typed, setTyped] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const nameMatches = typed.trim() === gameLabel.trim()
  const blocked = blockingSettlements.length > 0

  async function deleteGame() {
    setError(null)
    setPending(true)
    const { error, count } = await supabase
      .from('games')
      .delete({ count: 'exact' })
      .eq('id', gameId)
    setPending(false)

    if (error) {
      setError(error.message)
      return
    }
    if (!count) {
      // RLS returned no rows rather than an error: the policy said no.
      setError(
        'The database refused the delete. The game may have buy-ins or may no longer be scheduled.'
      )
      return
    }
    router.replace(`/groups/${groupId}`)
  }

  async function cancelGame() {
    setError(null)
    setPending(true)
    const { error } = await supabase.rpc('cancel_game', { p_game_id: gameId })
    setPending(false)
    if (error) {
      setError(error.message)
      return
    }
    router.refresh()
  }

  if (status === 'settled') {
    return (
      <div className="flex flex-col gap-1 rounded-lg border border-border p-3">
        <h3 className="text-sm font-medium">Delete game</h3>
        <p className="text-xs text-muted-foreground">
          A settled game can&apos;t be deleted or cancelled. Its results feed
          every player&apos;s lifetime stats, and it may carry settlements
          people are still owed — removing it would rewrite someone
          else&apos;s numbers and could erase a debt.
        </p>
      </div>
    )
  }

  if (status === 'cancelled') {
    return null
  }

  if (!canDelete && !canCancel) return null

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
      <h3 className="text-sm font-medium">
        {canDelete ? 'Delete game' : 'Cancel game'}
      </h3>

      {blocked ? (
        <>
          <p className="text-xs text-muted-foreground">
            This game has settlements that are still open. Resolve them before
            deleting or cancelling.
          </p>
          <ul className="flex flex-col gap-1">
            {blockingSettlements.map((s) => (
              <li
                key={s.id}
                className="flex items-center justify-between gap-2 rounded-lg bg-muted px-2 py-1.5 text-xs"
              >
                <span>
                  {s.fromName} pays {s.toName}
                </span>
                <span className="tabular-nums">
                  {formatCents(s.amountCents)} · {s.status}
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <>
          {canDelete ? (
            <p className="text-xs text-muted-foreground">
              This game never started and has no buy-ins, so it can be removed
              completely. This will delete {signupCount}{' '}
              {signupCount === 1 ? 'signup' : 'signups'}. It cannot be undone.
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              This game has money in it, so it can&apos;t be deleted.
              Cancelling keeps the roster and all {buyinCount}{' '}
              {buyinCount === 1 ? 'buy-in' : 'buy-ins'} totalling{' '}
              {formatCents(buyinTotalCents)} on the record, and only means no
              settlement will be computed.
            </p>
          )}

          <label className="text-xs text-muted-foreground" htmlFor="confirm">
            Type <span className="font-medium">{gameLabel}</span> to confirm
          </label>
          <Input
            id="confirm"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={gameLabel}
            autoComplete="off"
          />
          <Button
            variant="destructive"
            size="sm"
            disabled={!nameMatches || pending}
            onClick={canDelete ? deleteGame : cancelGame}
          >
            {pending
              ? 'Working…'
              : canDelete
                ? 'Delete this game'
                : 'Cancel this game'}
          </Button>
        </>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}
