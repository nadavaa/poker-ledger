import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { PhoneStory } from '@/components/landing/phone-story'
import { SettlementExample } from '@/components/landing/settlement-example'
// Scoped under .lp, so it styles only the phone story wrapper below.
import '@/components/landing/landing.css'
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
    <main className="flex w-full flex-col">
      <header className="mx-auto flex w-full max-w-md flex-col gap-1 p-4">
        <Link href={back} className="text-xs text-muted-foreground">
          &larr; Back
        </Link>
        <h1 className="text-lg font-semibold tracking-tight">Demo</h1>
        <p className="text-sm text-muted-foreground">
          {landing.story.intro} Nothing here is a real game. Scroll to play
          the night.
        </p>
      </header>

      {/* The real app screens, driven by scroll: the same story the landing
          tells, without the landing's header, nav or Sign up. */}
      <div className="lp">
        <PhoneStory />
      </div>

      <section className="mx-auto flex w-full max-w-md flex-col gap-3 p-4 pb-10">
        <h2 className="text-base font-semibold">The whole night on one page</h2>
        <SettlementExample />
        <Link
          href={back}
          className="w-fit text-sm font-medium underline underline-offset-2"
        >
          &larr; Back to your group
        </Link>
      </section>
    </main>
  )
}
