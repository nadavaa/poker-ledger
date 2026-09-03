'use client'

import { useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { DotsButton } from '@/components/action-sheet'
import { PopoverMenu, PopoverMenuItem } from '@/components/popover-menu'

/**
 * Remove and To waitlist behind one control, in the same anchored popover the
 * game menu uses. Both are refused by demote_from_confirmed() while the
 * player has live buy-ins — their money is in the pot — so the menu says why
 * rather than offering a button that fails.
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

  const anchor = useRef<HTMLSpanElement>(null)
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
      <span ref={anchor} className="inline-flex">
        <DotsButton
          label={`Options for ${name}`}
          onClick={() => setOpen((v) => !v)}
        />
      </span>

      <PopoverMenu
        open={open}
        anchorRef={anchor}
        onClose={() => setOpen(false)}
        label={`Options for ${name}`}
      >
        {blocked ? (
          <p className="max-w-64 px-3 py-2 text-sm text-muted-foreground">
            {name} has {liveBuyins} buy-in{liveBuyins === 1 ? '' : 's'} in the
            pot. Void {liveBuyins === 1 ? 'it' : 'them'} first, then they can be
            moved or removed.
          </p>
        ) : (
          <>
            <PopoverMenuItem
              disabled={pending}
              onClick={() => demote('waitlist')}
            >
              Move to waitlist
            </PopoverMenuItem>
            <PopoverMenuItem
              destructive
              disabled={pending}
              onClick={() => demote('withdrawn')}
            >
              Remove from game
            </PopoverMenuItem>
          </>
        )}

        {error && <p className="px-3 py-2 text-sm text-down">{error}</p>}
      </PopoverMenu>
    </>
  )
}
