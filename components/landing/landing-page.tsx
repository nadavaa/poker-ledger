import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { landing, MCP_URL, SITE_NAME } from '@/lib/landing-copy'

function Section({
  heading,
  children,
}: {
  heading: string
  children: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-xl font-semibold">{heading}</h2>
      {children}
    </section>
  )
}

function Bullets({ items }: { items: readonly string[] }) {
  return (
    <ul className="flex list-disc flex-col gap-1.5 pl-5 text-muted-foreground">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  )
}

// Public and signed-out: plain server-rendered text, no data access, nothing
// about any real group, player or game.
export function LandingPage() {
  const c = landing
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-10 px-4 pb-12">
      <header className="flex items-center justify-between py-3">
        <span className="text-lg font-semibold">{SITE_NAME}</span>
        <Button variant="outline" render={<Link href="/login" />} nativeButton={false}>
          {c.hero.signIn}
        </Button>
      </header>

      <main className="flex flex-col gap-10">
        <section className="flex flex-col gap-4">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            {c.hero.headline}
          </h1>
          <p className="text-lg text-muted-foreground">{c.hero.sub}</p>
          <div className="flex flex-col gap-2">
            <Button
              size="lg"
              className="w-full sm:w-fit"
              render={<Link href="/login" />}
              nativeButton={false}
            >
              {c.hero.cta}
            </Button>
            <p className="text-sm text-muted-foreground">{c.hero.note}</p>
          </div>
        </section>

        <Section heading={c.howItWorks.heading}>
          <ol className="flex list-decimal flex-col gap-2 pl-5 text-muted-foreground">
            {c.howItWorks.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </Section>

        <Section heading={c.features.heading}>
          <Bullets items={c.features.items} />
        </Section>

        <Section heading={c.money.heading}>
          {c.money.body.map((p) => (
            <p key={p} className="text-muted-foreground">
              {p}
            </p>
          ))}
        </Section>

        <Section heading={c.who.heading}>
          <p className="text-muted-foreground">{c.who.body}</p>
        </Section>

        <Section heading={c.connector.heading}>
          <p className="text-muted-foreground">{c.connector.intro}</p>
          <div className="flex flex-col gap-1">
            <p className="text-sm font-medium">{c.connector.addressLabel}</p>
            <code className="block overflow-x-auto rounded-lg bg-muted px-3 py-2 text-sm">
              {MCP_URL}
            </code>
          </div>
          <ul className="flex list-disc flex-col gap-1.5 pl-5 text-muted-foreground">
            {c.connector.steps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
          <h3 className="mt-2 font-medium">{c.connector.canHeading}</h3>
          <Bullets items={c.connector.can} />
          <h3 className="mt-2 font-medium">{c.connector.cannotHeading}</h3>
          <p className="text-muted-foreground">{c.connector.cannot}</p>
        </Section>

        <Section heading={c.install.heading}>
          <p className="text-muted-foreground">{c.install.body}</p>
        </Section>

        <Section heading={c.faq.heading}>
          <dl className="flex flex-col gap-4">
            {c.faq.items.map(({ q, a }) => (
              <div key={q} className="flex flex-col gap-1">
                <dt className="font-medium">{q}</dt>
                <dd className="text-muted-foreground">{a}</dd>
              </div>
            ))}
          </dl>
        </Section>

        <section className="flex flex-col gap-2 border-t pt-8">
          <Button
            size="lg"
            className="w-full sm:w-fit"
            render={<Link href="/login" />}
            nativeButton={false}
          >
            {c.hero.cta}
          </Button>
        </section>
      </main>

      <footer className="text-sm text-muted-foreground">{c.footer}</footer>
    </div>
  )
}
