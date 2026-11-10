import type { Metadata } from 'next'
import Link from 'next/link'
import { PhoneStory } from '@/components/landing/phone-story'
import { SettlementExample } from '@/components/landing/settlement-example'
import { SiteShell } from '@/components/landing/site-chrome'
import { Button } from '@/components/ui/button'
import { landing, SITE_NAME, SITE_URL } from '@/lib/landing-copy'

// A whole night with invented players, for a host deciding whether to bring
// their group. Public: it is the landing's own story (lib/landing-demo.ts),
// which nothing about a real group or player can reach. Signed-in hosts get
// here from the first-game card, since '/' shows them the dashboard instead.

const title = 'See a finished poker night'
const description =
  'Six invented players, one cash game: buy-ins as they happen, the chip count, and who pays whom at the end.'

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE_URL}/demo` },
  openGraph: {
    url: `${SITE_URL}/demo`,
    siteName: SITE_NAME,
    title,
    description,
    images: ['/og'],
  },
}

export default function DemoPage() {
  return (
    <SiteShell>
      <main>
        <section className="lp-dark">
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 pb-10 pt-16 lg:pt-24">
            <h1 className="lp-h2 max-w-3xl text-4xl sm:text-5xl lg:text-6xl">
              {landing.story.heading}
            </h1>
            <p className="max-w-xl text-lg text-muted-foreground">
              {landing.story.intro} Nothing here is a real game.
            </p>
          </div>
          <PhoneStory />
        </section>

        <section className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-12">
          <h2 className="text-2xl font-semibold">The whole night on one page</h2>
          <SettlementExample />
          <div className="mt-4 flex flex-col items-start gap-2 rounded-xl border bg-muted/40 p-4">
            <p className="font-medium">Run your own game like this</p>
            <p className="text-sm text-muted-foreground">
              Make a group, send your players the invite link, schedule a game.
              Everything else happens at the table.
            </p>
            <Button render={<Link href="/" />} nativeButton={false}>
              Start your group
            </Button>
          </div>
        </section>
      </main>
    </SiteShell>
  )
}
