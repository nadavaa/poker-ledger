import type { MetadataRoute } from 'next'
import { SITE_URL } from '@/lib/landing-copy'

// Public pages only, written out by hand on purpose: never generated from the
// database, and never an invite, claim, game or group address.
export default function sitemap(): MetadataRoute.Sitemap {
  return [{ url: SITE_URL }]
}
