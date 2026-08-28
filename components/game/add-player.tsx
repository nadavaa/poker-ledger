'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export type AvailableMember = { id: string; name: string }

/**
 * Seat someone who isn't on the signup list: a group member who never RSVP'd,
 * or a guest who has never used the app. Guests become unclaimed members, so
 * their history is real from the first hand and claimable later.
 */
export function AddPlayer({
  gameId,
  available,
}: {
  gameId: string
  available: AvailableMember[]
}) {
  const supabase = useMemo(() => createClient(), [])
  const router = useRouter()

  const [open, setOpen] = useState(false)
  const [memberId, setMemberId] = useState('')
  const [guest, setGuest] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)

  async function add(args: { memberId?: string; guestName?: string }) {
    setError(null)
    setNote(null)
    setPending(true)
    const { data, error } = await supabase.rpc('add_player_to_game', {
      p_game_id: gameId,
      p_member_id: args.memberId ?? null,
      p_guest_name: args.guestName ?? null,
    })
    setPending(false)

    if (error) {
      setError(error.message)
      return
    }

    // The seat limit still applies: a full table waitlists them.
    setNote(
      data === 'confirmed'
        ? 'Added to the table.'
        : 'Table is full — added to the waitlist.'
    )
    setMemberId('')
    setGuest('')
    router.refresh()
  }

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        Add player
      </Button>
    )
  }

  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-border p-3.5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">Add player</h3>
        <Button variant="ghost" size="xs" onClick={() => setOpen(false)}>
          Close
        </Button>
      </div>

      {available.length > 0 && (
        <div className="flex gap-2">
          <select
            value={memberId}
            onChange={(e) => setMemberId(e.target.value)}
            aria-label="Group member"
            className="h-9 flex-1 rounded-lg border border-border bg-background px-2 text-sm"
          >
            <option value="">From the group…</option>
            {available.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
          <Button
            size="sm"
            disabled={!memberId || pending}
            onClick={() => add({ memberId })}
          >
            Add
          </Button>
        </div>
      )}

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <div className="h-px flex-1 bg-border" />
        or
        <div className="h-px flex-1 bg-border" />
      </div>

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (guest.trim()) add({ guestName: guest })
        }}
      >
        <Input
          value={guest}
          onChange={(e) => setGuest(e.target.value)}
          placeholder="Guest name"
          maxLength={80}
        />
        <Button type="submit" size="sm" disabled={!guest.trim() || pending}>
          Add guest
        </Button>
      </form>
      <p className="text-xs text-muted-foreground">
        A guest joins the group as an unclaimed player, so their history is
        kept and they can claim it later.
      </p>

      {note && <p className="text-sm">{note}</p>}
      {error && <p className="text-sm text-down">{error}</p>}
    </div>
  )
}
