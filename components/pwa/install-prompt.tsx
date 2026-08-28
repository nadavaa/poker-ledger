'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'

type InstallEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const DISMISSED = 'install-prompt-dismissed'

/**
 * Distribution happens by pasting a link into WhatsApp, so the install nudge
 * has to come from inside the app. Shown once, dismissible for good.
 */
export function InstallPrompt() {
  const [event, setEvent] = useState<InstallEvent | null>(null)

  useEffect(() => {
    try {
      if (localStorage.getItem(DISMISSED)) return
    } catch {
      // Blocked storage: show it, worst case it reappears.
    }

    function onPrompt(e: Event) {
      e.preventDefault() // keep it until the user is ready
      setEvent(e as InstallEvent)
    }
    window.addEventListener('beforeinstallprompt', onPrompt)
    return () => window.removeEventListener('beforeinstallprompt', onPrompt)
  }, [])

  function dismiss() {
    try {
      localStorage.setItem(DISMISSED, '1')
    } catch {
      // Ignore: it just means we ask again next time.
    }
    setEvent(null)
  }

  if (!event) return null

  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card px-3.5 py-3">
      <p className="text-sm">
        <span className="font-medium">Add to your home screen</span>
        <span className="block text-xs text-muted-foreground">
          Opens full screen, no browser bar.
        </span>
      </p>
      <span className="flex shrink-0 gap-1">
        <Button variant="ghost" size="sm" onClick={dismiss}>
          Not now
        </Button>
        <Button
          size="sm"
          className="rounded-xl"
          onClick={async () => {
            await event.prompt()
            await event.userChoice
            dismiss()
          }}
        >
          Install
        </Button>
      </span>
    </div>
  )
}
