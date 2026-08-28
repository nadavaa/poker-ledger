'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

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
}: {
  gameId: string
  entries: WaitlistEntry[]
  isAdmin: boolean
  myMemberId: string | null
}) {
  const supabase = useMemo(() => createClient(), [])
  const router = useRouter()

  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<string | null>(null)
  // Set when the server says the table is full; the admin confirms to proceed.
  const [confirmOverfill, setConfirmOverfill] = useState<string | null>(null)

  async function addToGame(memberId: string, allowOverfill: boolean) {
    setError(null)
    setPending(memberId)
    const { error } = await supabase.rpc('promote_to_confirmed', {
      p_game_id: gameId,
      p_member_id: memberId,
      p_allow_overfill: allowOverfill,
    })
    setPending(null)

    if (error) {
      if (/game is full/i.test(error.message)) {
        setConfirmOverfill(memberId)
        return
      }
      setError(error.message)
      return
    }
    setConfirmOverfill(null)
    router.refresh()
  }

  if (entries.length === 0) return null

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-medium text-muted-foreground">
        Waitlist ({entries.length})
      </h2>

      {error && (
        <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

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
                <span className="text-xs text-muted-foreground">#{i + 1}</span>
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

            {isAdmin && confirmOverfill === e.memberId && (
              <div className="flex items-center justify-between gap-2 rounded-lg bg-muted px-2 py-1.5">
                <span className="text-xs">
                  Table is full. Seat {e.name} anyway and go over the limit?
                </span>
                <span className="flex shrink-0 gap-1">
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
