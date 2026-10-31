import type { Metadata } from 'next'
import Link from 'next/link'
import { SiteShell } from '@/components/landing/site-chrome'
import { GUIDES } from '@/lib/guides'
import { SITE_NAME, SITE_URL } from '@/lib/landing-copy'

const DESCRIPTION =
  'Short, practical guides to running and settling a home poker cash game.'

export const metadata: Metadata = {
  title: 'Home poker guides',
  description: DESCRIPTION,
  alternates: { canonical: `${SITE_URL}/guides` },
  openGraph: {
    type: 'website',
    url: `${SITE_URL}/guides`,
    siteName: SITE_NAME,
    title: 'Home poker guides',
    description: DESCRIPTION,
    images: ['/og'],
  },
  twitter: { card: 'summary_large_image' },
}

export default function GuidesPage() {
  return (
    <SiteShell>
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-10">
        <h1 className="text-4xl font-semibold tracking-tight">
          Home poker guides
        </h1>
        <p className="text-lg text-muted-foreground">{DESCRIPTION}</p>
        <ul className="flex flex-col gap-4">
          {GUIDES.map((g) => (
            <li key={g.slug} className="rounded-xl border bg-card p-4">
              <h2 className="text-xl font-semibold">
                <Link href={`/guides/${g.slug}`} className="hover:underline">
                  {g.title}
                </Link>
              </h2>
              <p className="mt-1 text-muted-foreground">{g.description}</p>
            </li>
          ))}
        </ul>
      </main>
    </SiteShell>
  )
}
