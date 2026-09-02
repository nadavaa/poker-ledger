'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ActionSheet, DotsButton } from '@/components/action-sheet'
import { Button } from '@/components/ui/button'

/**
 * Remove and To waitlist behind one control. Both are refused by
 * demote_from_confirmed() while the player has live buy-ins — their money is
 * in the pot — so the menu says why rather than offering a button that fails.
 */
export function PlayerRowMenu({
  gameId,
  memberId,
  name,
  liveBuyins,
}: {
  gameId: string
  memberId: string
  name: string
  liveBuyins: number
}) {
  const supabase = useMemo(() => createClient(), [])
  const router = useRouter()

  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const blocked = liveBuyins > 0

  async function demote(to: 'waitlist' | 'withdrawn') {
    setError(null)
    setPending(true)
    const { error } = await supabase.rpc('demote_from_confirmed', {
      p_game_id: gameId,
      p_member_id: memberId,
      p_to: to,
    })
    setPending(false)
    if (error) {
      setError(error.message)
      return
    }
    setOpen(false)
    router.refresh()
  }

  return (
    <>
      <DotsButton label={`Options for ${name}`} onClick={() => setOpen(true)} />

      <ActionSheet
        open={open}
        title={name}
        description={
          blocked
            ? undefined
            : 'Move them out of this game. Their seat frees up for the waitlist.'
        }
        onClose={() => setOpen(false)}
      >
        {blocked ? (
          <p className="rounded-xl bg-muted px-3 py-2.5 text-sm text-muted-foreground">
            {name} has {liveBuyins} buy-in{liveBuyins === 1 ? '' : 's'} in the
            pot. Void {liveBuyins === 1 ? 'it' : 'them'} first, then they can be
            moved or removed.
          </p>
        ) : (
          <>
            <Button
              variant="outline"
              className="h-11 justify-start rounded-xl"
              disabled={pending}
              onClick={() => demote('waitlist')}
            >
              Move to waitlist
            </Button>
            <Button
              variant="destructive"
              className="h-11 justify-start rounded-xl"
              disabled={pending}
              onClick={() => demote('withdrawn')}
            >
              Remove from game
            </Button>
          </>
        )}

        {error && <p className="text-sm text-down">{error}</p>}
      </ActionSheet>
    </>
  )
}
