'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export type AvailableMember = { id: string; name: string }

type Outcome = { confirmed: number; waitlist: number; errors: string[] }

function summarize({ confirmed, waitlist }: Outcome): string | null {
  const parts: string[] = []
  if (confirmed > 0) parts.push(`${confirmed} to the table`)
  if (waitlist > 0) parts.push(`${waitlist} to the waitlist (table is full)`)
  return parts.length ? `Added ${parts.join(', ')}.` : null
}

/**
 * Seat someone who isn't on the signup list: group members who never RSVP'd
 * (tick several at once), or a guest who has never used the app. Guests become
 * unclaimed members, so their history is real from the first hand and
 * claimable later.
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
  const [listOpen, setListOpen] = useState(false)
  // Kept in the order ticked: that is the seat order if the table fills.
  const [picked, setPicked] = useState<string[]>([])
  // Ignore ticks for anyone no longer available (e.g. seated since).
  const selected = picked.filter((id) => available.some((m) => m.id === id))
  const [guest, setGuest] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const pickerRef = useRef<HTMLDivElement>(null)

  // Close the checklist on a tap outside it.
  useEffect(() => {
    if (!listOpen) return
    function onDown(e: PointerEvent) {
      if (!pickerRef.current?.contains(e.target as Node)) setListOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [listOpen])

  function toggle(id: string) {
    setPicked((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))
  }

  async function seat(args: {
    memberId?: string
    guestName?: string
  }): Promise<{ status?: string; error?: string }> {
    const { data, error } = await supabase.rpc('add_player_to_game', {
      p_game_id: gameId,
      p_member_id: args.memberId ?? null,
      p_guest_name: args.guestName ?? null,
    })
    return error ? { error: error.message } : { status: data ?? undefined }
  }

  async function addMembers() {
    setError(null)
    setNote(null)
    setListOpen(false)
    setPending(true)

    const outcome: Outcome = { confirmed: 0, waitlist: 0, errors: [] }
    // One at a time, so the seat order is the order ticked. The seat limit
    // still applies: once the table is full the rest go to the waitlist.
    for (const id of selected) {
      const r = await seat({ memberId: id })
      if (r.error) {
        const name = available.find((m) => m.id === id)?.name ?? 'Player'
        outcome.errors.push(`${name}: ${r.error}`)
      } else if (r.status === 'confirmed') {
        outcome.confirmed++
      } else {
        outcome.waitlist++
      }
    }

    setPending(false)
    setNote(summarize(outcome))
    setError(outcome.errors.length ? outcome.errors.join('\n') : null)
    setPicked([])
    router.refresh()
  }

  async function addGuest() {
    setError(null)
    setNote(null)
    setPending(true)
    const r = await seat({ guestName: guest })
    setPending(false)
    if (r.error) {
      setError(r.error)
      return
    }
    setNote(
      r.status === 'confirmed'
        ? 'Added to the table.'
        : 'Table is full — added to the waitlist.'
    )
    setGuest('')
    router.refresh()
  }

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        Add players
      </Button>
    )
  }

  const triggerLabel =
    selected.length === 0
      ? 'From the group…'
      : selected.length === 1
        ? available.find((m) => m.id === selected[0])?.name ?? '1 selected'
        : `${selected.length} selected`

  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-border p-3.5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">Add players</h3>
        <Button variant="ghost" size="xs" onClick={() => setOpen(false)}>
          Close
        </Button>
      </div>

      {available.length > 0 && (
        <div className="flex items-start gap-2">
          <div ref={pickerRef} className="relative flex-1">
            <button
              type="button"
              onClick={() => setListOpen((o) => !o)}
              aria-expanded={listOpen}
              aria-haspopup="listbox"
              aria-label="Group members"
              className={`flex h-9 w-full items-center justify-between gap-2 rounded-lg border border-border bg-background px-2 text-left text-sm ${
                selected.length === 0 ? 'text-muted-foreground' : ''
              }`}
            >
              <span className="truncate">{triggerLabel}</span>
              <span aria-hidden className="text-xs text-muted-foreground">
                {listOpen ? '▲' : '▼'}
              </span>
            </button>

            {listOpen && (
              <div
                role="listbox"
                aria-multiselectable="true"
                className="absolute inset-x-0 top-full z-20 mt-1 max-h-60 overflow-y-auto rounded-lg border border-border bg-background py-1 shadow-lg"
              >
                {available.map((m) => {
                  const checked = selected.includes(m.id)
                  return (
                    <label
                      key={m.id}
                      role="option"
                      aria-selected={checked}
                      className="flex min-h-11 cursor-pointer items-center gap-3 px-3 text-sm hover:bg-muted"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggle(m.id)}
                        className="size-4 shrink-0 accent-primary"
                      />
                      <span className="truncate">{m.name}</span>
                    </label>
                  )
                })}
              </div>
            )}
          </div>
          <Button
            size="sm"
            disabled={selected.length === 0 || pending}
            onClick={addMembers}
          >
            {selected.length > 1 ? `Add (${selected.length})` : 'Add'}
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
          if (guest.trim()) addGuest()
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
      {error && <p className="whitespace-pre-line text-sm text-down">{error}</p>}
    </div>
  )
}
