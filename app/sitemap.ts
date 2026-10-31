import type { MetadataRoute } from 'next'
import { GUIDES } from '@/lib/guides'
import { SITE_URL } from '@/lib/landing-copy'

// Public pages only, written out on purpose: never generated from the
// database, and never an invite, claim, game or group address.
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: SITE_URL },
    { url: `${SITE_URL}/ai-connector` },
    { url: `${SITE_URL}/guides` },
    ...GUIDES.map((g) => ({ url: `${SITE_URL}/guides/${g.slug}` })),
  ]
}
