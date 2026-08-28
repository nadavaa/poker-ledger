'use client'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { centsToDollars } from '@/lib/money'

type GroupDefaults = {
  default_buyin_cents: number
  chips_per_dollar: number
  default_seat_limit: number
}

function defaultDateTime() {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  d.setHours(20, 0, 0, 0)
  // datetime-local wants local time, not UTC.
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function NewGameForm({
  defaults,
  action,
  errorMessage,
}: {
  defaults: GroupDefaults
  action: (formData: FormData) => void
  errorMessage?: string
}) {
  return (
    <form action={action}>
      <Card>
        <CardContent className="flex flex-col gap-4 py-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="scheduled_at">Date and time</Label>
            <Input
              id="scheduled_at"
              name="scheduled_at"
              type="datetime-local"
              required
              defaultValue={defaultDateTime()}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">Game name (optional)</Label>
            <Input
              id="name"
              name="name"
              maxLength={80}
              placeholder="Labor Day game"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="location">Location (optional)</Label>
            <Input
              id="location"
              name="location"
              maxLength={120}
              placeholder="Gilad's place"
            />
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="seat_limit">Seats</Label>
              <Input
                id="seat_limit"
                name="seat_limit"
                type="number"
                min={2}
                max={50}
                required
                defaultValue={defaults.default_seat_limit}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="buyin">Buy-in $</Label>
              <Input
                id="buyin"
                name="buyin"
                inputMode="decimal"
                required
                defaultValue={centsToDollars(defaults.default_buyin_cents)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="chips_per_dollar">Chips/$</Label>
              <Input
                id="chips_per_dollar"
                name="chips_per_dollar"
                type="number"
                step="0.25"
                min={0.25}
                required
                defaultValue={defaults.chips_per_dollar}
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="playing"
              defaultChecked
              className="size-4"
            />
            I&apos;m playing too
          </label>

          <Button type="submit">Create game</Button>

          {errorMessage && (
            <p className="text-sm text-destructive">{errorMessage}</p>
          )}
        </CardContent>
      </Card>
    </form>
  )
}
