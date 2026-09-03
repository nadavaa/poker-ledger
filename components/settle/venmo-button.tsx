'use client'

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
  if (!handle) return null

  // The note is the helper's, not this component's: every Venmo link in the
  // app carries the same one.
  const links = venmoLink(handle, amountCents)

  return (
    <Button
      size="sm"
      className="rounded-xl"
      render={
        <a href={links.web} target="_blank" rel="noopener noreferrer" />
      }
      nativeButton={false}
    >
      Pay {payeeName}
    </Button>
  )
}
