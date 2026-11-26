'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

/** Away longer than this, and the page is fetched again on return. */
const STALE_AFTER_MS = 60_000

/**
 * Re-fetches the page when the app comes back after a while in the
 * background. iOS hands a Home Screen app back exactly as it was left, with
 * no reload button, so a page that rendered badly, or just went stale, used
 * to stay that way until the app was quit. router.refresh() asks the server
 * again and keeps what's on screen (an open sheet, a half-typed amount).
 */
export function RefreshOnResume() {
  const router = useRouter()

  useEffect(() => {
    let hiddenAt: number | null = null

    function onChange() {
      if (document.visibilityState === 'hidden') {
        hiddenAt = Date.now()
        return
      }
      if (hiddenAt !== null && Date.now() - hiddenAt > STALE_AFTER_MS) {
        router.refresh()
      }
      hiddenAt = null
    }

    document.addEventListener('visibilitychange', onChange)
    return () => document.removeEventListener('visibilitychange', onChange)
  }, [router])

  return null
}
