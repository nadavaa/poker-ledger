'use client'

import { useEffect, useState } from 'react'
import { pickQuote } from '@/lib/quotes'
import { venmoLink } from '@/lib/venmo'
import { Button } from '@/components/ui/button'

/**
 * Opens Venmo with the payment prefilled. Only the payer ever sees this.
 *
 * The href is the https URL, not the venmo:// scheme: iOS and Android hand
 * https://venmo.com off to the installed app, and a desktop browser opens the
 * site. A bare custom scheme silently does nothing on desktop, which looks
 * exactly like a broken button.
 *
 * Renders nothing when there is no handle — the row shows the amount, the
 * name, and a note instead. Never a dead button.
 */
export function VenmoButton({
  handle,
  amountCents,
  payeeName,
}: {
  handle: string | null
  amountCents: number
  payeeName: string
}) {
  // Picked once, after mount: picking during render would differ between the
  // server and the client and mismatch the href. Until then the helper falls
  // back to the spade, and once set the note never changes for this button.
  const [quote, setQuote] = useState<string | null>(null)
  // eslint-disable-next-line react-hooks/set-state-in-effect -- mount-only pick
  useEffect(() => setQuote(pickQuote()), [])

  if (!handle) return null

  // Encoding, truncation and the spade fallback are the helper's.
  const links = venmoLink(handle, amountCents, quote)

  return (
    <Button
      size="sm"
      className="rounded-xl"
      render={<a href={links.web} target="_blank" rel="noopener noreferrer" />}
      nativeButton={false}
    >
      Pay {payeeName}
    </Button>
  )
}
