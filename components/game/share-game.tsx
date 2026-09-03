'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'

/**
 * One link that does the whole job: joins the group, signs them up if the
 * game can take them, and lands them on the right screen either way.
 *
 * The share sheet gets the WhatsApp text because that is where this gets
 * pasted; the clipboard fallback gets the same text, so a desktop browser
 * without navigator.share still hands over something worth sending.
 */
export function ShareGame({
  gameId,
  groupName,
  when,
  location,
  buyinLabel,
}: {
  gameId: string
  groupName: string
  when: string
  location: string | null
  /** e.g. "$50 buy-in". Omitted from the message when there isn't one. */
  buyinLabel?: string | null
}) {
  const [done, setDone] = useState<'shared' | 'text' | 'link' | null>(null)

  function flash(what: 'shared' | 'text' | 'link') {
    setDone(what)
    setTimeout(() => setDone(null), 2000)
  }

  function url() {
    return `${window.location.origin}/games/${gameId}/join`
  }

  function message() {
    return [
      `🃏 Poker — ${groupName}`,
      [when, location].filter(Boolean).join(' · '),
      buyinLabel,
      '',
      `Tap to join: ${url()}`,
    ]
      .filter((line) => line !== null && line !== undefined)
      .join('\n')
  }

  async function share() {
    const text = message()
    // The OS sheet is the shortest path to WhatsApp on a phone, which is the
    // only place this link is ever going.
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ text })
        flash('shared')
        return
      } catch {
        // Cancelled, or refused because the page isn't in a user gesture any
        // more. Fall through to the clipboard rather than doing nothing.
      }
    }
    await navigator.clipboard.writeText(text)
    flash('text')
  }

  async function copyLink() {
    await navigator.clipboard.writeText(url())
    flash('link')
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        className="h-11 flex-1 rounded-xl"
        onClick={share}
      >
        {done === 'shared'
          ? 'Shared'
          : done === 'text'
            ? 'Copied — paste it in the chat'
            : 'Share game'}
      </Button>
      <Button
        variant="ghost"
        className="h-11 rounded-xl"
        onClick={copyLink}
      >
        {done === 'link' ? 'Copied' : 'Copy link'}
      </Button>
    </div>
  )
}
