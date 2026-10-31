import type { MetadataRoute } from 'next'
import { SITE_URL } from '@/lib/landing-copy'

// Only the landing page is public. Everything else is behind sign-in already;
// naming it here keeps well-behaved crawlers from probing it at all.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/join/',
        '/claim/',
        '/games/',
        '/groups/',
        '/welcome',
        '/profile',
        '/settings',
        '/admin',
        '/api/',
        '/auth/',
        '/oauth/',
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  }
}
