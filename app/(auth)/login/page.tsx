'use client'

import { Suspense, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

function LoginForm() {
  const searchParams = useSearchParams()
  const rawNext = searchParams.get('next')
  const next = rawNext?.startsWith('/') ? rawNext : '/'

  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent'>('idle')
  const [error, setError] = useState<string | null>(null)

  const callbackUrl = () =>
    `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`

  async function sendMagicLink(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setStatus('sending')
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: callbackUrl() },
    })
    if (error) {
      setError(error.message)
      setStatus('idle')
    } else {
      setStatus('sent')
    }
  }

  async function signInWithGoogle() {
    setError(null)
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: callbackUrl() },
    })
    if (error) setError(error.message)
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Poker Ledger</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {status === 'sent' ? (
          <p className="text-sm">
            Check your email — we sent a sign-in link to{' '}
            <span className="font-medium">{email}</span>.
          </p>
        ) : (
          <>
            <form onSubmit={sendMagicLink} className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <Button type="submit" disabled={status === 'sending'}>
                {status === 'sending' ? 'Sending…' : 'Send magic link'}
              </Button>
            </form>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <div className="h-px flex-1 bg-border" />
              or
              <div className="h-px flex-1 bg-border" />
            </div>
            <Button variant="outline" onClick={signInWithGoogle}>
              Continue with Google
            </Button>
          </>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  )
}

export default function LoginPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <Suspense>
        <LoginForm />
      </Suspense>
    </main>
  )
}
