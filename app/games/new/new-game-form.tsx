'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { centsToDollars } from '@/lib/money'

type GroupOption = {
  id: string
  name: string
  default_buyin_cents: number
  chips_per_dollar: number
  default_seat_limit: number
}

// Defaults for a brand-new group, matching the groups table defaults.
const NEW_GROUP_DEFAULTS = {
  default_buyin_cents: 5000,
  chips_per_dollar: 2,
  default_seat_limit: 9,
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
  groups,
  presetGroupId,
  action,
  errorMessage,
}: {
  groups: GroupOption[]
  presetGroupId?: string
  action: (formData: FormData) => void
  errorMessage?: string
}) {
  const initialGroup =
    (presetGroupId && groups.some((g) => g.id === presetGroupId)
      ? presetGroupId
      : groups[0]?.id) ?? '__new__'

  const [groupChoice, setGroupChoice] = useState(initialGroup)
  const isNewGroup = groupChoice === '__new__'
  const selected = groups.find((g) => g.id === groupChoice)
  const defaults = selected ?? NEW_GROUP_DEFAULTS

  return (
    <form action={action}>
      <Card>
        <CardContent className="flex flex-col gap-4 py-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="group">Group</Label>
            <select
              id="group"
              name="group"
              value={groupChoice}
              onChange={(e) => setGroupChoice(e.target.value)}
              className="h-9 rounded-lg border border-border bg-background px-2 text-sm"
            >
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
              <option value="__new__">+ New group…</option>
            </select>
          </div>

          {isNewGroup && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new_group_name">New group name</Label>
              <Input
                id="new_group_name"
                name="new_group_name"
                required
                maxLength={80}
                placeholder="Tuesday crew"
              />
            </div>
          )}

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
            <Input id="name" name="name" maxLength={80} placeholder="Labor Day game" />
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
                key={`seats-${groupChoice}`}
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
                key={`buyin-${groupChoice}`}
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
                key={`ratio-${groupChoice}`}
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
