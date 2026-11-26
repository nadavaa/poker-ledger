'use client'

import { startTransition, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'

/**
 * When a page fails to load. The Home Screen app has no reload button, so
 * without this the only way out was to quit the app and open it again.
 * Try again asks the server for the page afresh, which re-runs the session
 * check, rather than only re-rendering what already failed.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const router = useRouter()

  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 p-6 text-center">
      <h1 className="text-lg font-semibold">This didn&apos;t load</h1>
      <p className="max-w-xs text-sm text-muted-foreground">
        Something went wrong getting your data. Nothing you entered is lost.
      </p>
      <Button
        className="mt-2 h-11 rounded-xl px-6"
        onClick={() =>
          startTransition(() => {
            router.refresh()
            reset()
          })
        }
      >
        Try again
      </Button>
    </main>
  )
}
