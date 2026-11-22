import { notFound } from 'next/navigation'

/**
 * Screen previews for checking layout by eye (Claude or a person), with fake
 * data and no database. Local `next dev` only: every /dev page 404s in any
 * production build, previews included.
 */
export default function DevLayout({ children }: { children: React.ReactNode }) {
  if (process.env.NODE_ENV === 'production') notFound()
  return children
}
