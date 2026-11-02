import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { HeroArt } from '@/components/landing/hero-art'
import { JsonLd } from '@/components/landing/json-ld'
import { PhoneStory } from '@/components/landing/phone-story'
import { SiteShell } from '@/components/landing/site-chrome'
import {
  landing,
  MCP_URL,
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_URL,
} from '@/lib/landing-copy'

function Bullets({ items }: { items: readonly string[] }) {
  return (
    <ul className="flex flex-col gap-2 text-muted-foreground">
      {items.map((item) => (
        <li key={item} className="flex gap-3">
          <span
            aria-hidden
            className="mt-[0.7em] h-px w-3 shrink-0 bg-[color:var(--lp-accent)]"
          />
          {item}
        </li>
      ))}
    </ul>
  )
}

function CtaButton({ className = '' }: { className?: string }) {
  return (
    <Button
      size="lg"
      className={`h-12 px-6 text-base ${className}`}
      render={<Link href="/login" />}
      nativeButton={false}
    >
      {landing.hero.cta}
    </Button>
  )
}

// Public and signed-out: server-rendered text, a code-drawn hero and the phone
// story. Nothing here reads a real group, player or game.
export function LandingPage() {
  const c = landing
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite',
        '@id': `${SITE_URL}/#website`,
        url: SITE_URL,
        name: SITE_NAME,
        description: SITE_DESCRIPTION,
      },
      {
        '@type': 'WebApplication',
        '@id': `${SITE_URL}/#app`,
        name: SITE_NAME,
        url: SITE_URL,
        description: SITE_DESCRIPTION,
        applicationCategory: 'UtilitiesApplication',
        operatingSystem: 'Web',
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
      },
      {
        '@type': 'FAQPage',
        mainEntity: c.faq.items.map(({ q, a }) => ({
          '@type': 'Question',
          name: q,
          acceptedAnswer: { '@type': 'Answer', text: a },
        })),
      },
    ],
  }

  return (
    <SiteShell>
      <JsonLd data={jsonLd} />

      <main className="flex flex-col overflow-x-clip">
        {/* Hero: lead-anchored type, three depth planes on the right. */}
        <section className="mx-auto grid w-full max-w-6xl items-center gap-6 px-4 pb-20 pt-10 lg:grid-cols-[1.1fr_0.9fr] lg:gap-12 lg:pb-28 lg:pt-16">
          <div className="flex flex-col gap-7">
            <h1
              className="lp-display lp-rise text-[clamp(2.4rem,6vw,4.6rem)]"
              style={{ ['--d' as string]: '0ms' }}
            >
              {c.hero.headline}
            </h1>
            <p
              className="lp-rise max-w-[34rem] text-lg text-muted-foreground sm:text-xl"
              style={{ ['--d' as string]: '120ms' }}
            >
              {c.hero.sub}
            </p>
            <div
              className="lp-rise flex flex-col gap-3 sm:flex-row sm:items-center"
              style={{ ['--d' as string]: '240ms' }}
            >
              <CtaButton className="w-full sm:w-fit" />
              <Link
                href="#story"
                className="py-3 text-base font-medium underline-offset-4 hover:underline sm:px-3"
              >
                {c.hero.watch}
              </Link>
            </div>
          </div>
          <HeroArt />
        </section>

        {/* The story: dark ground, pinned phone, narrator captions. */}
        <section id="story" className="lp-dark scroll-mt-12">
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 pb-10 pt-24 lg:pt-32">
            <h2 className="lp-h2 max-w-3xl text-4xl sm:text-5xl lg:text-6xl">
              {c.story.heading}
            </h2>
            <p className="max-w-xl text-lg text-muted-foreground">
              {c.story.intro}
            </p>
          </div>
          <PhoneStory />
        </section>

        <section className="mx-auto w-full max-w-6xl px-4 pb-20 pt-4">
          <div className="flex max-w-xl flex-col gap-10">
            <div className="flex flex-col gap-3">
              <h3 className="font-semibold">{c.features.heading}</h3>
              <Bullets items={c.features.items} />
            </div>
          </div>
        </section>

        <div className="lp-rule mx-auto w-full max-w-6xl" />

        <section className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-24 md:grid-cols-[1.1fr_0.9fr] md:items-start">
          <div className="flex flex-col gap-4">
            <h2 className="lp-h2 text-3xl sm:text-4xl">{c.connector.heading}</h2>
            <p className="max-w-xl text-lg text-muted-foreground">
              {c.connector.intro}
            </p>
            <Link
              href="/ai-connector"
              className="w-fit py-2 font-medium underline underline-offset-4"
            >
              Set it up and see what it can do
            </Link>
          </div>
          <div className="flex flex-col gap-3 rounded-2xl border bg-card p-5">
            <p className="text-sm font-medium">{c.connector.addressLabel}</p>
            <code className="block overflow-x-auto rounded-lg bg-muted px-3 py-2 text-sm">
              {MCP_URL}
            </code>
          </div>
        </section>

        <section
          id="faq"
          className="mx-auto grid w-full max-w-6xl scroll-mt-16 gap-10 px-4 pb-28 lg:grid-cols-[0.8fr_1.6fr] lg:gap-16"
        >
          <h2 className="lp-h2 text-3xl sm:text-4xl">{c.faq.heading}</h2>
          <div className="flex flex-col divide-y border-y">
            {c.faq.items.map(({ q, a }) => (
              <details key={q} className="group">
                <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-6 py-3 text-lg font-medium tracking-tight [&::-webkit-details-marker]:hidden">
                  {q}
                  <span
                    aria-hidden
                    className="text-2xl font-light text-muted-foreground transition-transform duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] group-open:rotate-45"
                  >
                    +
                  </span>
                </summary>
                <p className="max-w-2xl pb-5 text-muted-foreground">{a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* Close: inverts to the dark ground and goes quiet. */}
        <section className="lp-dark">
          <div className="mx-auto flex w-full max-w-6xl flex-col items-start gap-6 px-4 py-28">
            <h2 className="lp-h2 max-w-2xl text-4xl sm:text-6xl">
              {c.closing.heading}
            </h2>
            <p className="max-w-md text-lg text-muted-foreground">
              {c.closing.body}
            </p>
            <CtaButton className="w-full sm:w-fit" />
          </div>
        </section>
      </main>
    </SiteShell>
  )
}
