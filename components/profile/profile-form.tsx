'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { formatPhone, parseUsPhone } from '@/lib/payment'
import { normalizeHandle } from '@/lib/venmo'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export type ProfileValues = {
  displayName: string
  venmoHandle: string | null
  /** E.164 as stored. */
  phone: string | null
  preferred: string | null
}

type Fields = {
  displayName: string
  venmo: string
  phone: string
  preferred: string
}

type Normalized = Omit<Fields, 'venmo'> & { venmo: string }

/**
 * Comparison happens on normalized values, never raw input. A stored
 * "+15552345678" renders as "(555) 234-5678", so comparing what's on screen
 * would mark the form dirty the instant it loaded.
 */
function normalize(f: Fields): Normalized {
  return {
    displayName: f.displayName.trim(),
    venmo: normalizeHandle(f.venmo) ?? '',
    phone: parseUsPhone(f.phone).value ?? '',
    preferred: f.preferred,
  }
}

function same(a: Normalized, b: Normalized) {
  return (
    a.displayName === b.displayName &&
    a.venmo === b.venmo &&
    a.phone === b.phone &&
    a.preferred === b.preferred
  )
}

function toFields(v: ProfileValues): Fields {
  return {
    displayName: v.displayName,
    venmo: v.venmoHandle ?? '',
    phone: v.phone ? formatPhone(v.phone) : '',
    preferred: v.preferred ?? '',
  }
}

export function ProfileForm({
  userId,
  initial,
}: {
  userId: string
  initial: ProfileValues
}) {
  const supabase = useMemo(() => createClient(), [])
  const router = useRouter()

  const [fields, setFields] = useState<Fields>(() => toFields(initial))
  // What's stored, normalized. Reset after a successful save so the button
  // greys out again instead of staying live.
  const [baseline, setBaseline] = useState<Normalized>(() =>
    normalize(toFields(initial))
  )
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const current = normalize(fields)
  const phoneValid = parseUsPhone(fields.phone).valid

  const dirty = !same(current, baseline)
  const valid = current.displayName !== '' && phoneValid
  const canSave = dirty && valid && !pending

  function set(key: keyof Fields, value: string) {
    setSaved(false)
    setFields((f) => ({ ...f, [key]: value }))
  }

  async function save() {
    if (!canSave) return
    setError(null)
    setPending(true)

    const { error: nameError } = await supabase
      .from('profiles')
      .update({ display_name: current.displayName })
      .eq('id', userId)

    if (nameError) {
      setPending(false)
      setError(nameError.message)
      return
    }

    const { error: payError } = await supabase.rpc('set_my_payment_details', {
      p_venmo_handle: current.venmo || null,
      p_phone: current.phone || null,
      p_preferred: current.preferred || null,
    })
    setPending(false)

    if (payError) {
      setError(payError.message)
      return
    }

    setBaseline(current)
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
        <Label htmlFor="display_name">Display name</Label>
        <Input
          id="display_name"
          value={fields.displayName}
          onChange={(e) => set('displayName', e.target.value)}
          maxLength={80}
          aria-invalid={current.displayName === ''}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="venmo_handle">Venmo handle</Label>
        <Input
          id="venmo_handle"
          value={fields.venmo}
          onChange={(e) => set('venmo', e.target.value)}
          maxLength={60}
          placeholder="your-venmo"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="phone_number">Phone for Zelle</Label>
        <Input
          id="phone_number"
          type="tel"
          inputMode="tel"
          value={fields.phone}
          onChange={(e) => set('phone', e.target.value)}
          maxLength={20}
          placeholder="(555) 234-5678"
          aria-invalid={!phoneValid}
        />
        {!phoneValid && (
          <p className="text-xs text-down">
            That doesn&apos;t look like a US phone number.
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          Only shown to someone who owes you money from a settled game, and to
          that game&apos;s admin. Never on the members list.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="preferred">Preferred method</Label>
        <select
          id="preferred"
          value={fields.preferred}
          onChange={(e) => set('preferred', e.target.value)}
          className="h-9 rounded-lg border border-border bg-background px-2 text-sm"
        >
          <option value="">No preference</option>
          <option value="venmo">Venmo</option>
          <option value="zelle">Zelle</option>
        </select>
        <p className="text-xs text-muted-foreground">
          Whichever you pick shows first when someone pays you. Fill in either,
          both, or neither.
        </p>
      </div>

      {error && <p className="text-sm text-down">{error}</p>}
      {saved && !dirty && <p className="text-sm text-up">Saved.</p>}

      <Button className="h-11 rounded-xl" type="submit" disabled={!canSave}>
        {pending ? 'Saving…' : 'Save'}
      </Button>
    </form>
  )
}
