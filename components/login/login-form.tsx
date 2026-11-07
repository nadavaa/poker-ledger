'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { login as copy } from '@/lib/landing-copy'
import { friendlyAuthError, retryAfterSeconds } from '@/lib/login'

/** Supabase allows one magic link per address per 60 seconds by default. */
const RESEND_COOLDOWN_S = 60

/** Google's own mark, per their sign-in branding guidelines. */
function GoogleMark() {
  return (
    <svg viewBox="0 0 18 18" aria-hidden className="size-4">
      <path
        fill="#4285F4"
        d="M17.64 9.2045c0-.6381-.0573-1.2518-.1636-1.8409H9v3.4814h4.8436c-.2086 1.125-.8427 2.0782-1.7959 2.7164v2.2581h2.9087c1.7018-1.5668 2.6836-3.874 2.6836-6.615z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.4673-.806 5.9564-2.1805l-2.9087-2.2581c-.8059.54-1.8368.859-3.0477.859-2.344 0-4.3282-1.5831-5.036-3.7104H.9574v2.3318C2.4382 15.9832 5.4818 18 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.964 10.71c-.18-.54-.2822-1.1168-.2822-1.71s.1023-1.17.2823-1.71V4.9582H.9573A8.9965 8.9965 0 0 0 0 9c0 1.4523.3477 2.8268.9573 4.0418L3.964 10.71z"
      />
      <path
        fill="#EA4335"
        d="M9 3.5795c1.3214 0 2.5077.4541 3.4405 1.346l2.5813-2.5814C13.4632.8918 11.426 0 9 0 5.4818 0 2.4382 2.0168.9573 4.9582L3.964 7.29C4.6718 5.1627 6.656 3.5795 9 3.5795z"
      />
    </svg>
  )
}

export function LoginForm({ next }: { next: string }) {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [cooldown, setCooldown] = useState(0)
  const [resent, setResent] = useState(false)

  useEffect(() => {
    if (cooldown <= 0) return
    const t = setTimeout(() => setCooldown((s) => s - 1), 1000)
    return () => clearTimeout(t)
  }, [cooldown])

  async function sendLink(): Promise<boolean> {
    setError(null)
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        // /auth/confirm handles both the default ?code= link and the
        // token_hash link from a customized email template.
        emailRedirectTo: `${window.location.origin}/auth/confirm?next=${encodeURIComponent(next)}`,
      },
    })
    if (error) {
      setError(friendlyAuthError(error.message, error.status))
      const wait = retryAfterSeconds(error.message)
      if (wait !== null) setCooldown(wait)
      return false
    }
    setCooldown(RESEND_COOLDOWN_S)
    return true
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setStatus('sending')
    setStatus((await sendLink()) ? 'sent' : 'idle')
  }

  async function onResend() {
    setResent(false)
    if (await sendLink()) setResent(true)
  }

  async function signInWithGoogle() {
    setError(null)
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    })
    if (error) setError(friendlyAuthError(error.message, error.status))
  }

  const errorLine = error && (
    <p role="alert" className="text-sm text-destructive">
      {error}
    </p>
  )

  if (status === 'sent') {
    return (
      <div className="flex flex-col gap-5 rounded-2xl border bg-card p-6 shadow-[0_24px_40px_-28px_rgb(0_0_0/0.3)]">
        <div className="flex flex-col gap-2" aria-live="polite">
          <h2 className="lp-h2 text-2xl">{copy.sent.heading}</h2>
          <p className="text-muted-foreground">{copy.sent.body(email)}</p>
          <p className="text-sm text-muted-foreground">{copy.sent.spam}</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Button
            variant="outline"
            className="h-11"
            disabled={cooldown > 0}
            onClick={onResend}
          >
            {cooldown > 0 ? copy.sent.resendIn(cooldown) : copy.sent.resend}
          </Button>
          <button
            type="button"
            className="py-2 text-sm font-medium underline-offset-4 hover:underline sm:px-3"
            onClick={() => {
              setStatus('idle')
              setError(null)
              setResent(false)
            }}
          >
            {copy.sent.change}
          </button>
        </div>
        {resent && !error && (
          <p className="text-sm" style={{ color: 'var(--lp-accent)' }}>
            ✓ {copy.sent.resent}
          </p>
        )}
        {errorLine}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 rounded-2xl border bg-card p-6 shadow-[0_24px_40px_-28px_rgb(0_0_0/0.3)]">
      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">{copy.emailLabel}</Label>
          <Input
            id="email"
            type="email"
            required
            autoComplete="email"
            inputMode="email"
            placeholder="you@example.com"
            className="h-11 text-base"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <Button
          type="submit"
          size="lg"
          className="h-11 text-base"
          disabled={status === 'sending' || cooldown > 0}
        >
          {status === 'sending'
            ? copy.sending
            : cooldown > 0
              ? copy.sent.resendIn(cooldown)
              : copy.send}
        </Button>
      </form>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <div className="h-px flex-1 bg-border" />
        {copy.or}
        <div className="h-px flex-1 bg-border" />
      </div>
      <Button variant="outline" size="lg" className="h-11 text-base" onClick={signInWithGoogle}>
        <GoogleMark />
        {copy.google}
      </Button>
      {errorLine}
      <p className="text-xs text-muted-foreground">{copy.noPasswords}</p>
    </div>
  )
}
