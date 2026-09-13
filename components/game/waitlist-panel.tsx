'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { overfillPrompt } from '@/lib/seats'

export type WaitlistEntry = { id: string; memberId: string; name: string }

/**
 * The waitlist, in order. The admin can seat anyone from here — the seat
 * limit is a default, not a wall, so going over it is allowed once the admin
 * says so out loud.
 */
export function WaitlistPanel({
  gameId,
  entries,
  isAdmin,
  myMemberId,
  confirmedCount,
  seatLimit,
}: {
  gameId: string
  entries: WaitlistEntry[]
  isAdmin: boolean
  myMemberId: string | null
  /** For the question: "This game is full (8/8). Adding X makes it 9." */
  confirmedCount: number
  seatLimit: number
}) {
  const supabase = useMemo(() => createClient(), [])
  const router = useRouter()

  // Keyed by member, and drawn on that member's row. An error at the top of
  // the section is off-screen from the row you tapped, which is how a refused
  // write looked like nothing happening.
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [pending, setPending] = useState<string | null>(null)
  // Set when the server says the table is full; the admin confirms to proceed.
  const [confirmOverfill, setConfirmOverfill] = useState<string | null>(null)

  async function addToGame(memberId: string, allowOverfill: boolean) {
    setErrors((e) => ({ ...e, [memberId]: '' }))
    setPending(memberId)
    const { error } = await supabase.rpc('promote_to_confirmed', {
      p_game_id: gameId,
      p_member_id: memberId,
      p_allow_overfill: allowOverfill,
    })
    setPending(null)

    if (error) {
      if (!allowOverfill && /game is full/i.test(error.message)) {
        setConfirmOverfill(memberId)
        return
      }
      // Whatever the database said, on the row that asked. Never swallowed.
      setConfirmOverfill(null)
      setErrors((e) => ({ ...e, [memberId]: error.message }))
      return
    }
    setConfirmOverfill(null)
    router.refresh()
  }

  if (entries.length === 0) return null

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-[0.7rem] font-medium uppercase tracking-[0.08em] text-muted-foreground">
        Waitlist ({entries.length})
      </h2>

      {entries.map((e, i) => (
        <Card key={e.id}>
          <CardContent className="flex flex-col gap-2 py-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm">
                {e.name}
                {e.memberId === myMemberId && (
                  <span className="text-muted-foreground"> (you)</span>
                )}
              </span>
              <div className="flex items-center gap-2">
                <span className="money flex size-6 items-center justify-center rounded-lg bg-muted text-xs text-muted-foreground">
                  {i + 1}
                </span>
                {isAdmin && confirmOverfill !== e.memberId && (
                  <Button
                    variant="outline"
                    size="xs"
                    disabled={pending === e.memberId}
                    onClick={() => addToGame(e.memberId, false)}
                  >
                    Add to game
                  </Button>
                )}
              </div>
            </div>

            {errors[e.memberId] && (
              <p className="rounded-lg bg-down-soft px-2 py-1.5 text-xs text-down">
                {errors[e.memberId]}
              </p>
            )}

            {isAdmin && confirmOverfill === e.memberId && (
              <div className="flex flex-col gap-2 rounded-lg bg-muted px-2 py-1.5">
                <span className="text-xs">
                  {overfillPrompt(e.name, confirmedCount, seatLimit)}
                </span>
                <span className="flex shrink-0 justify-end gap-2">
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => setConfirmOverfill(null)}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="xs"
                    disabled={pending === e.memberId}
                    onClick={() => addToGame(e.memberId, true)}
                  >
                    Add anyway
                  </Button>
                </span>
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </section>
  )
}
