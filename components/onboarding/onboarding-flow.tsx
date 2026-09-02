'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { parseUsPhone } from '@/lib/payment'
import { normalizeHandle } from '@/lib/venmo'
import { AvatarUpload } from '@/components/avatar-upload'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type Method = 'venmo' | 'zelle' | ''

/**
 * Three short steps, every one skippable. Nothing here gates the app — the
 * flag is set whether they finish or skip, because asking again every login
 * is nagging, not onboarding.
 */
export function OnboardingFlow({
  userId,
  initialName,
  hasPhoto,
  avatarUrl,
}: {
  userId: string
  initialName: string
  /** Google already supplied one, so the photo step is pointless. */
  hasPhoto: boolean
  avatarUrl: string | null
}) {
  const supabase = useMemo(() => createClient(), [])
  const router = useRouter()

  const steps = hasPhoto ? (['name', 'pay'] as const) : (['name', 'pay', 'photo'] as const)
  const [index, setIndex] = useState(0)
  const step = steps[index]!

  const [name, setName] = useState(initialName)
  const [method, setMethod] = useState<Method>('')
  const [handle, setHandle] = useState('')
  const [phone, setPhone] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const phoneValid = parseUsPhone(phone).valid

  async function finish() {
    setPending(true)
    await supabase.rpc('complete_onboarding')
    setPending(false)
    router.replace('/')
    router.refresh()
  }

  function next() {
    if (index + 1 < steps.length) setIndex(index + 1)
    else finish()
  }

  async function saveName() {
    const clean = name.trim()
    if (!clean) return next()
    setError(null)
    setPending(true)
    const { error } = await supabase
      .from('profiles')
      .update({ display_name: clean })
      .eq('id', userId)
    setPending(false)
    if (error) return setError(error.message)
    next()
  }

  async function savePayment() {
    if (!method) return next()
    setError(null)
    setPending(true)
    // Cleaned on the way in: @ stripped, phone to E.164 in the database.
    const { error } = await supabase.rpc('set_my_payment_details', {
      p_venmo_handle: method === 'venmo' ? (normalizeHandle(handle) ?? null) : null,
      p_phone: method === 'zelle' ? (phone.trim() || null) : null,
      p_preferred: method,
    })
    setPending(false)
    if (error) return setError(error.message)
    next()
  }

  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-4 p-4">
      <div>
        <p className="text-xs text-muted-foreground">
          Step {index + 1} of {steps.length}
        </p>
        <h1 className="text-lg font-semibold tracking-tight">
          {step === 'name' && 'What should we call you?'}
          {step === 'pay' && 'How do you get paid?'}
          {step === 'photo' && 'Add a photo'}
        </h1>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-4 py-4">
          {step === 'name' && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="name">Display name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={80}
                placeholder="Your name"
              />
              <p className="text-xs text-muted-foreground">
                This is what the rest of your group sees.
              </p>
            </div>
          )}

          {step === 'pay' && (
            <>
              <div className="flex gap-2">
                <Button
                  variant={method === 'venmo' ? 'default' : 'outline'}
                  className="h-11 flex-1 rounded-xl"
                  onClick={() => setMethod('venmo')}
                >
                  Venmo
                </Button>
                <Button
                  variant={method === 'zelle' ? 'default' : 'outline'}
                  className="h-11 flex-1 rounded-xl"
                  onClick={() => setMethod('zelle')}
                >
                  Zelle
                </Button>
              </div>

              {/* Only the field that matches the choice. */}
              {method === 'venmo' && (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="handle">Venmo handle</Label>
                  <Input
                    id="handle"
                    value={handle}
                    onChange={(e) => setHandle(e.target.value)}
                    placeholder="your-venmo"
                    maxLength={60}
                  />
                </div>
              )}

              {method === 'zelle' && (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="phone">Phone for Zelle</Label>
                  <Input
                    id="phone"
                    type="tel"
                    inputMode="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="(555) 234-5678"
                    aria-invalid={!phoneValid}
                  />
                  {!phoneValid && (
                    <p className="text-xs text-down">
                      That doesn&apos;t look like a US phone number.
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Only shown to someone who owes you money when Zelle is
                    preferred.
                  </p>
                </div>
              )}
            </>
          )}

          {step === 'photo' && (
            <AvatarUpload
              bucket="avatars"
              ownerId={userId}
              entityId={userId}
              name={name}
              currentUrl={avatarUrl}
              onSaved={async (path) => {
                const { error } = await supabase
                  .from('profiles')
                  .update({ avatar_url: path })
                  .eq('id', userId)
                return { error: error?.message ?? null }
              }}
            />
          )}

          {error && <p className="text-sm text-down">{error}</p>}
        </CardContent>
      </Card>

      <div className="flex gap-2">
        <Button
          variant="ghost"
          className="h-11 flex-1 rounded-xl"
          disabled={pending}
          onClick={next}
        >
          Skip
        </Button>
        <Button
          className="h-11 flex-1 rounded-xl"
          disabled={pending || (step === 'pay' && method === 'zelle' && !phoneValid)}
          onClick={
            step === 'name' ? saveName : step === 'pay' ? savePayment : next
          }
        >
          {index + 1 === steps.length ? 'Done' : 'Next'}
        </Button>
      </div>
    </main>
  )
}
