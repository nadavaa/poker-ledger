'use client'

import { venmoLink } from '@/lib/venmo'
import { Button } from '@/components/ui/button'

/**
 * Opens Venmo with the amount prefilled.
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
  note,
  direction,
}: {
  handle: string | null
  amountCents: number
  note: string
  /** 'pay' sends money to them, 'collect' requests it from them. */
  direction: 'pay' | 'collect'
}) {
  if (!handle) return null

  const links = venmoLink(
    handle,
    amountCents,
    note,
    direction === 'pay' ? 'pay' : 'charge'
  )

  return (
    <Button
      size="sm"
      className="rounded-xl"
      render={
        <a href={links.web} target="_blank" rel="noopener noreferrer" />
      }
      nativeButton={false}
    >
      {direction === 'pay' ? 'Pay' : 'Request'}
    </Button>
  )
}
