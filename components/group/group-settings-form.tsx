'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { centsToDollars, dollarsToCents } from '@/lib/money'
import { useDirtyForm } from '@/components/use-dirty-form'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type Fields = {
  name: string
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

/** Compared as stored values, so "50" and "50.00" aren't a change. */
function normalize(f: Fields): Fields {
  return {
    name: f.name.trim(),
    seats: String(Number(f.seats) || ''),
    buyin: String(parseCents(f.buyin) ?? ''),
    ratio: String(Number(f.ratio) || ''),
  }
}

export function GroupSettingsForm({
  groupId,
  initial,
}: {
  groupId: string
  initial: {
    name: string
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
        name: initial.name,
        seats: String(initial.seatLimit),
        buyin: centsToDollars(initial.buyinCents),
        ratio: String(initial.chipsPerDollar),
      },
      normalize,
      isValid: (f) =>
        f.name.trim() !== '' &&
        parseCents(f.buyin) !== null &&
        Number(f.seats) >= 2 &&
        Number(f.ratio) > 0,
    })

  function change(key: keyof Fields, value: string) {
    setSaved(false)
    set(key, value)
  }

  async function save() {
    if (!canSave) return
    setError(null)
    setPending(true)

    const { error } = await supabase
      .from('groups')
      .update({
        name: current.name,
        default_seat_limit: Number(current.seats),
        default_buyin_cents: Number(current.buyin),
        chips_per_dollar: Number(current.ratio),
      })
      .eq('id', groupId)

    setPending(false)
    if (error) {
      setError(error.message)
      return
    }
    commit()
    setSaved(true)
    router.refresh()
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        save()
      }}
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="name">Group name</Label>
        <Input
          id="name"
          value={fields.name}
          onChange={(e) => change('name', e.target.value)}
          maxLength={80}
          aria-invalid={fields.name.trim() === ''}
        />
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="seats">Seats</Label>
          <Input
            id="seats"
            type="number"
            min={2}
            max={50}
            value={fields.seats}
            onChange={(e) => change('seats', e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="buyin">Buy-in $</Label>
          <Input
            id="buyin"
            inputMode="decimal"
            value={fields.buyin}
            onChange={(e) => change('buyin', e.target.value)}
            aria-invalid={parseCents(fields.buyin) === null}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ratio">Chips/$</Label>
          <Input
            id="ratio"
            type="number"
            step="0.25"
            min={0.25}
            value={fields.ratio}
            onChange={(e) => change('ratio', e.target.value)}
          />
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        These are the starting values for the next game you create. Games
        already scheduled or played keep the numbers they were created with.
      </p>

      {error && <p className="text-sm text-down">{error}</p>}
      {saved && !canSave && <p className="text-sm text-up">Saved.</p>}

      <Button className="h-11 rounded-xl" type="submit" disabled={!canSave}>
        {pending ? 'Saving…' : 'Save settings'}
      </Button>
    </form>
  )
}
