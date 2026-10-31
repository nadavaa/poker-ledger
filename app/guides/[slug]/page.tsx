import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { JsonLd } from '@/components/landing/json-ld'
import { SettlementExample } from '@/components/landing/settlement-example'
import { SiteShell } from '@/components/landing/site-chrome'
import { Button } from '@/components/ui/button'
import { GUIDES, getGuide } from '@/lib/guides'
import { SITE_NAME, SITE_URL } from '@/lib/landing-copy'

// Only the slugs written in lib/guides.ts exist; anything else is a 404.
export const dynamicParams = false

export function generateStaticParams() {
  return GUIDES.map((g) => ({ slug: g.slug }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const guide = getGuide((await params).slug)
  if (!guide) return {}
  const url = `${SITE_URL}/guides/${guide.slug}`
  return {
    title: guide.title,
    description: guide.description,
    alternates: { canonical: url },
    openGraph: {
      type: 'article',
      url,
      siteName: SITE_NAME,
      title: guide.title,
      description: guide.description,
      images: ['/og'],
    },
    twitter: {
      card: 'summary_large_image',
      title: guide.title,
      description: guide.description,
    },
  }
}

export default async function GuidePage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const guide = getGuide((await params).slug)
  if (!guide) notFound()

  return (
    <SiteShell>
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'Article',
          headline: guide.title,
          description: guide.description,
          datePublished: guide.published,
          mainEntityOfPage: `${SITE_URL}/guides/${guide.slug}`,
          author: { '@type': 'Organization', name: SITE_NAME },
          publisher: { '@type': 'Organization', name: SITE_NAME },
        }}
      />
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-10">
        <Link
          href="/guides"
          className="w-fit py-2 text-sm text-muted-foreground hover:text-foreground"
        >
          All guides
        </Link>
        <h1 className="text-4xl font-semibold tracking-tight text-balance">
          {guide.title}
        </h1>
        <p className="text-lg text-muted-foreground">{guide.description}</p>
        {guide.blocks.map((b, i) => {
          if (b.type === 'h2')
            return (
              <h2 key={i} className="mt-4 text-2xl font-semibold">
                {b.text}
              </h2>
            )
          if (b.type === 'ul')
            return (
              <ul
                key={i}
                className="flex list-disc flex-col gap-1.5 pl-5 text-muted-foreground"
              >
                {b.items.map((it) => (
                  <li key={it}>{it}</li>
                ))}
              </ul>
            )
          if (b.type === 'example') return <SettlementExample key={i} />
          return (
            <p key={i} className="text-muted-foreground">
              {b.text}
            </p>
          )
        })}
        <div className="mt-6 flex flex-col items-start gap-2 rounded-xl border bg-muted/40 p-4">
          <p className="font-medium">See it work</p>
          <p className="text-sm text-muted-foreground">
            The story on the home page runs this arithmetic with invented
            players.
          </p>
          <Button
            variant="outline"
            render={<Link href="/#story" />}
            nativeButton={false}
          >
            Watch a game play out
          </Button>
        </div>
      </main>
    </SiteShell>
  )
}
