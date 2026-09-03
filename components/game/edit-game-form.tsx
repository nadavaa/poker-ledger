'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { centsToDollars, dollarsToCents } from '@/lib/money'
import { useDirtyForm } from '@/components/use-dirty-form'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  lockReason,
  validateEdit,
  type EditableField,
  type GameStatus,
} from '@/lib/game-edit'

type Fields = {
  name: string
  location: string
  scheduledAt: string
  seats: string
  buyin: string
  ratio: string
}

function parseCents(v: string): number | null {
  try {
    const c = dollarsToCents(v)
    return c > 0 ? c : null
  } catch {
    return null
  }
}

/** An ISO instant as the value a datetime-local input wants, in local time. */
function toLocalInput(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`
}

/** Compared as stored values, so "50" and "50.00" aren't a change, and
 *  neither is the same instant typed a second time. */
function normalize(f: Fields): Fields {
  const when = new Date(f.scheduledAt)
  return {
    name: f.name.trim(),
    location: f.location.trim(),
    scheduledAt: Number.isNaN(when.getTime())
      ? f.scheduledAt
      : when.toISOString(),
    seats: String(Number(f.seats) || ''),
    buyin: String(parseCents(f.buyin) ?? ''),
    ratio: String(Number(f.ratio) || ''),
  }
}

/** Why a greyed-out field is greyed out, said next to it rather than hidden. */
function Locked({
  status,
  field,
}: {
  status: GameStatus
  field: EditableField
}) {
  const reason = lockReason(status, field)
  if (!reason) return null
  return <p className="text-xs text-muted-foreground">{reason}</p>
}

/**
 * Editing a game. What is editable depends on what the game is doing, and a
 * locked field is greyed out with the reason beside it rather than hidden —
 * the admin needs to see the buy-in to know it's the one the pot was priced
 * against.
 *
 * The trigger on `games` refuses anything this form would refuse, so a stale
 * tab cannot get around it.
 */
export function EditGameForm({
  gameId,
  status,
  initial,
}: {
  gameId: string
  status: GameStatus
  initial: {
    name: string | null
    location: string | null
    scheduledAt: string
    seatLimit: number
    buyinCents: number
    chipsPerDollar: number
  }
}) {
  const supabase = useMemo(() => createClient(), [])
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const { fields, current, set, pending, setPending, commit, canSave } =
    useDirtyForm<Fields>({
      initial: {
        name: initial.name ?? '',
        location: initial.location ?? '',
        scheduledAt: toLocalInput(initial.scheduledAt),
        seats: String(initial.seatLimit),
        buyin: centsToDollars(initial.buyinCents),
        ratio: String(initial.chipsPerDollar),
      },
      normalize,
      isValid: (f) => {
        const { errors } = validateEdit({
          name: f.name,
          location: f.location,
          scheduledAt: f.scheduledAt,
          seatLimit: normalize(f).seats,
          buyinCents: String(parseCents(f.buyin) ?? ''),
          chipsPerDollar: normalize(f).ratio,
        })
        return Object.keys(errors).length === 0
      },
    })

  const problems = validateEdit({
    name: fields.name,
    location: fields.location,
    scheduledAt: fields.scheduledAt,
    seatLimit: current.seats,
    buyinCents: current.buyin,
    chipsPerDollar: current.ratio,
  })

  function change(key: keyof Fields, value: string) {
    setSaved(false)
    setError(null)
    set(key, value)
  }

  async function save() {
    if (!canSave) return
    setError(null)
    setPending(true)

    // Only what this status allows is even sent. The trigger enforces it too;
    // this keeps a no-op edit from touching a locked column at all.
    const payload = {
      name: current.name === '' ? null : current.name,
      location: current.location === '' ? null : current.location,
      ...(status === 'scheduled'
        ? {
            scheduled_at: current.scheduledAt,
            seat_limit: Number(current.seats),
            default_buyin_cents: Number(current.buyin),
            chips_per_dollar: Number(current.ratio),
          }
        : {}),
    }

    const { error, count } = await supabase
      .from('games')
      .update(payload, { count: 'exact' })
      .eq('id', gameId)
    setPending(false)

    if (error) {
      setError(error.message)
      return
    }
    if (!count) {
      // RLS returned no rows rather than an error: the policy said no.
      setError(
        'The database refused the edit. You may no longer run this game.'
      )
      return
    }
    commit()
    setSaved(true)
    router.refresh()
  }

  const frozen = (field: EditableField) => lockReason(status, field) !== null

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="game-name">Name</Label>
        <Input
          id="game-name"
          value={fields.name}
          onChange={(e) => change('name', e.target.value)}
          placeholder="Optional"
          maxLength={80}
          disabled={frozen('name')}
        />
        <Locked status={status} field="name" />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="game-location">Location</Label>
        <Input
          id="game-location"
          value={fields.location}
          onChange={(e) => change('location', e.target.value)}
          placeholder="Optional"
          maxLength={120}
          disabled={frozen('location')}
        />
        <Locked status={status} field="location" />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="game-when">Date and time</Label>
        <Input
          id="game-when"
          type="datetime-local"
          value={fields.scheduledAt}
          onChange={(e) => change('scheduledAt', e.target.value)}
          disabled={frozen('scheduledAt')}
          aria-invalid={!!problems.errors.scheduledAt}
        />
        <Locked status={status} field="scheduledAt" />
        {problems.errors.scheduledAt && (
          <p className="text-xs text-down">{problems.errors.scheduledAt}</p>
        )}
        {/* Allowed, not blocked: games do get logged after the fact. */}
        {problems.warnings.scheduledAt && (
          <p className="text-xs text-pending">
            {problems.warnings.scheduledAt}
          </p>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="game-seats">Seats</Label>
          <Input
            id="game-seats"
            inputMode="numeric"
            value={fields.seats}
            onChange={(e) => change('seats', e.target.value.replace(/\D/g, ''))}
            disabled={frozen('seatLimit')}
            aria-invalid={!!problems.errors.seatLimit}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="game-buyin">Buy-in</Label>
          <Input
            id="game-buyin"
            inputMode="decimal"
            value={fields.buyin}
            onChange={(e) => change('buyin', e.target.value)}
            disabled={frozen('buyinCents')}
            aria-invalid={!!problems.errors.buyinCents}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="game-ratio">Chips / $</Label>
          <Input
            id="game-ratio"
            inputMode="numeric"
            value={fields.ratio}
            onChange={(e) => change('ratio', e.target.value)}
            disabled={frozen('chipsPerDollar')}
            aria-invalid={!!problems.errors.chipsPerDollar}
          />
        </div>
      </div>

      {status === 'active' && (
        <p className="rounded-xl bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
          Seats, buy-in and the chip ratio are frozen while the game is
          running. Every buy-in already in the pot was priced against them.
        </p>
      )}

      {(problems.errors.seatLimit ||
        problems.errors.buyinCents ||
        problems.errors.chipsPerDollar) && (
        <p className="text-xs text-down">
          {problems.errors.seatLimit ??
            problems.errors.buyinCents ??
            problems.errors.chipsPerDollar}
        </p>
      )}

      {error && (
        <p className="rounded-xl bg-down-soft px-3 py-2 text-sm text-down">
          {error}
        </p>
      )}

      <Button
        className="h-11 rounded-xl"
        disabled={!canSave}
        onClick={save}
      >
        {pending ? 'Saving…' : saved ? 'Saved' : 'Save changes'}
      </Button>
    </div>
  )
}
