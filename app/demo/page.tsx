import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { SettlementExample } from '@/components/landing/settlement-example'
import { Steps } from '@/components/steps'
import { landing } from '@/lib/landing-copy'
import { createClient } from '@/lib/supabase/server'
import { getSessionUser } from '@/lib/supabase/auth'

// A sample night with invented players (lib/landing-demo.ts), for a host
// who just made a group. Signed-in only and in the app's own chrome: the
// signed-out landing and the signed-in app never mix, so this never shows
// the landing header or a Sign up button. Signed-out visitors have the
// landing's own story at /#story.

export const metadata: Metadata = {
  title: 'Demo',
  robots: { index: false },
}

export default async function DemoPage({
  searchParams,
}: {
  searchParams: Promise<{ group?: string }>
}) {
  const supabase = await createClient()
  const user = await getSessionUser(supabase)
  if (!user) redirect('/login?next=/demo')

  const { group } = await searchParams
  // Only ever a link back; RLS decides what that page shows.
  const back = group && /^[0-9a-f-]{36}$/i.test(group) ? `/groups/${group}` : '/'

  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-6 p-4">
      <header>
        <Link href={back} className="text-xs text-muted-foreground">
          &larr; Back
        </Link>
        <h1 className="text-lg font-semibold tracking-tight">Demo</h1>
        <p className="text-sm text-muted-foreground">
          {landing.story.intro} Nothing here is a real game.
        </p>
      </header>

      <Steps
        steps={landing.story.scenes.map((s) => ({ title: s.title, body: s.body }))}
      />

      <SettlementExample />
    </main>
  )
}
