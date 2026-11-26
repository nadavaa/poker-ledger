'use client'

import { useState } from 'react'
import { Check, Share } from 'lucide-react'
import { Button } from '@/components/ui/button'

/**
 * Opens the phone's own share sheet for a link, so the person picks the app
 * (Messages, WhatsApp, Mail…) instead of copying and pasting. Where there is
 * no share sheet, as in most desktop browsers, it copies the link instead
 * and shows a check for a moment.
 */
export function ShareLinkButton({
  path,
  title,
  label,
  size = 'icon-sm',
  text,
}: {
  path: string
  /** What the share sheet shows as the subject. */
  title: string
  /** Accessible name; the button itself is only an icon. */
  label: string
  /** icon-sm beside size="sm" buttons, icon-xs in a list row. */
  size?: 'icon-xs' | 'icon-sm'
  /** Words beside the icon, for where the icon alone doesn't say what is
   *  being shared. The button then sizes to fit (h-9, like icon-xs). */
  text?: string
}) {
  const [copied, setCopied] = useState(false)

  async function share() {
    const url = `${window.location.origin}${path}`
    if (navigator.share) {
      try {
        await navigator.share({ title, url })
      } catch {
        // Closing the share sheet without picking an app rejects. Nothing
        // went wrong, so there is nothing to tell them.
      }
      return
    }
    await navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const icon = copied ? (
    <Check className="size-4" aria-hidden />
  ) : (
    <Share className="size-4" aria-hidden />
  )

  if (text) {
    return (
      <Button variant="outline" size="xs" aria-label={label} onClick={share}>
        {icon}
        {copied ? 'Copied!' : text}
      </Button>
    )
  }

  return (
    <Button
      variant="outline"
      size={size}
      aria-label={copied ? 'Link copied' : label}
      onClick={share}
    >
      {icon}
    </Button>
  )
}
