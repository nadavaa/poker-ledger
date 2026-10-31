import type { Metadata } from 'next'
import { JsonLd } from '@/components/landing/json-ld'
import { SiteShell } from '@/components/landing/site-chrome'
import { landing, MCP_URL, SITE_NAME, SITE_URL } from '@/lib/landing-copy'

const TITLE = 'Use KevesPoker with Claude or ChatGPT'
const DESCRIPTION =
  'Add KevesPoker to Claude or ChatGPT as a custom connector to ask about your poker balances, games and waitlist. What it can and cannot do.'

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: `${SITE_URL}/ai-connector` },
  openGraph: {
    type: 'article',
    url: `${SITE_URL}/ai-connector`,
    siteName: SITE_NAME,
    title: TITLE,
    description: DESCRIPTION,
    images: ['/og'],
  },
  twitter: { card: 'summary_large_image', title: TITLE, description: DESCRIPTION },
}

export default function AiConnectorPage() {
  const k = landing.connector
  return (
    <SiteShell>
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'TechArticle',
          headline: TITLE,
          description: DESCRIPTION,
          url: `${SITE_URL}/ai-connector`,
          author: { '@type': 'Organization', name: SITE_NAME },
        }}
      />
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-10">
        <h1 className="text-4xl font-semibold tracking-tight text-balance">
          {TITLE}
        </h1>
        <p className="text-lg text-muted-foreground">{k.intro}</p>

        <section className="flex flex-col gap-2">
          <h2 className="text-2xl font-semibold">Connector address</h2>
          <code className="block overflow-x-auto rounded-lg bg-muted px-3 py-2 text-sm">
            {MCP_URL}
          </code>
          <p className="text-sm text-muted-foreground">
            Use the address with <code>www</code> exactly as written.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-2xl font-semibold">Set it up</h2>
          <ol className="flex list-decimal flex-col gap-2 pl-5 text-muted-foreground">
            {k.steps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
          <p className="text-muted-foreground">
            You approve a consent screen the first time. Nothing is readable
            until you do.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-2xl font-semibold">Things to ask</h2>
          <ul className="flex list-disc flex-col gap-1.5 pl-5 text-muted-foreground">
            {k.examples.map((e) => (
              <li key={e}>“{e}”</li>
            ))}
          </ul>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-2xl font-semibold">{k.canHeading}</h2>
          <ul className="flex list-disc flex-col gap-1.5 pl-5 text-muted-foreground">
            {k.can.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-2xl font-semibold">{k.cannotHeading}</h2>
          <p className="text-muted-foreground">{k.cannot}</p>
        </section>
      </main>
    </SiteShell>
  )
}
