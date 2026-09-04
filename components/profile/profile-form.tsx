'use client'

import { useMemo, useState } from 'react'
import { useDirtyForm } from '@/components/use-dirty-form'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { formatPhone, parseUsPhone } from '@/lib/payment'
import { handleProblem, normalizeHandle } from '@/lib/venmo'
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

function toFields(v: ProfileValues): Fields {
  return {
    displayName: v.displayName,
    venmo: v.venmoHandle ?? '',
    phone: v.phone ? formatPhone(v.phone) : '',
    // Two options only, so a null preference has to resolve to one of them:
    // whichever they already have, and Venmo when they have neither.
    preferred:
      v.preferred === 'venmo' || v.preferred === 'zelle'
        ? v.preferred
        : v.phone && !v.venmoHandle
          ? 'zelle'
          : 'venmo',
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

  const {
    fields,
    current,
    set,
    pending,
    setPending,
    commit,
    canSave,
  } = useDirtyForm<Fields>({
    initial: toFields(initial),
    normalize,
    isValid: (f) =>
      f.displayName.trim() !== '' &&
      // Only judge the phone while it's the field on screen. Otherwise a bad
      // number typed under Zelle would keep Save dead after switching to
      // Venmo, with nothing visible explaining why.
      (f.preferred !== 'zelle' || parseUsPhone(f.phone).valid) &&
      // Same rule as the phone: only judge the field that's on screen, and
      // judge it on the stripped value so a leading @ is never an error.
      (f.preferred !== 'venmo' || handleProblem(f.venmo) === null),
  })

  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const phoneValid = parseUsPhone(fields.phone).valid
  const venmoProblem = handleProblem(fields.venmo)

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
        <Label htmlFor="display_name">Display name</Label>
        <Input
          id="display_name"
          value={fields.displayName}
          onChange={(e) => {
            setSaved(false)
            set('displayName', e.target.value)
          }}
          maxLength={80}
          aria-invalid={current.displayName === ''}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="preferred">Preferred method</Label>
        <select
          id="preferred"
          value={fields.preferred}
          onChange={(e) => {
            setSaved(false)
            set('preferred', e.target.value)
          }}
          className="h-11 rounded-lg border border-border bg-background px-3.5 text-sm"
        >
          <option value="venmo">Venmo</option>
          <option value="zelle">Zelle</option>
        </select>
      </div>

      {/* The other value stays in state and is still saved — switching hides a
          field, it never clears what's stored. */}
      {fields.preferred === 'venmo' && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="venmo_handle">Venmo handle</Label>
          <Input
            id="venmo_handle"
            value={fields.venmo}
            onChange={(e) => {
              setSaved(false)
              set('venmo', e.target.value)
            }}
            maxLength={60}
            placeholder="your-venmo"
            aria-invalid={!!venmoProblem}
          />
          {venmoProblem ? (
            <p className="text-xs text-down">{venmoProblem}</p>
          ) : (
            <p className="text-xs text-muted-foreground">
              With or without the @ — it&apos;s stored without.
            </p>
          )}
        </div>
      )}

      {fields.preferred === 'zelle' && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="phone_number">Phone for Zelle</Label>
          <Input
            id="phone_number"
            type="tel"
            inputMode="tel"
            value={fields.phone}
            onChange={(e) => {
              setSaved(false)
              set('phone', e.target.value)
            }}
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
            Only shown to someone who owes you money when Zelle is preferred.
          </p>
        </div>
      )}

      {error && <p className="text-sm text-down">{error}</p>}
      {saved && !canSave && <p className="text-sm text-up">Saved.</p>}

      <Button className="h-11 rounded-xl" type="submit" disabled={!canSave}>
        {pending ? 'Saving…' : 'Save'}
      </Button>
    </form>
  )
}
