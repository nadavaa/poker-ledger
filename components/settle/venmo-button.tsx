'use client'

import { useState } from 'react'
import { formatCents } from '@/lib/money'
import { venmoLink } from '@/lib/venmo'
import { Button } from '@/components/ui/button'

/**
 * Opens Venmo with the amount prefilled. The deep link is a convenience, not
 * a dependency — the scheme is undocumented and has changed before — so the
 * handle and amount are always available as copyable plain text.
 */
export function VenmoButton({
  handle,
  amountCents,
  note,
  direction,
  counterpartyName,
}: {
  handle: string | null
  amountCents: number
  note: string
  /** 'pay' sends money, 'collect' requests it. */
  direction: 'pay' | 'collect'
  counterpartyName: string
}) {
  const [copied, setCopied] = useState(false)

  const plain = handle
    ? `@${handle.replace(/^@/, '')} ${formatCents(amountCents)}`
    : `${counterpartyName} ${formatCents(amountCents)}`

  async function copy() {
    await navigator.clipboard.writeText(plain)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (!handle) {
    return (
      <Button variant="outline" size="sm" className="rounded-xl" onClick={copy}>
        {copied ? 'Copied' : 'Copy amount'}
      </Button>
    )
  }

  const links = venmoLink(
    handle,
    amountCents,
    note,
    direction === 'pay' ? 'pay' : 'charge'
  )

  return (
    <span className="flex shrink-0 items-center gap-1.5">
      <Button
        size="sm"
        className="rounded-xl"
        render={<a href={links.app} rel="noreferrer" />}
        nativeButton={false}
      >
        {direction === 'pay' ? 'Venmo' : 'Request'}
      </Button>
      <Button
        variant="ghost"
        size="xs"
        onClick={copy}
        aria-label={`Copy ${plain}`}
      >
        {copied ? 'Copied' : 'Copy'}
      </Button>
    </span>
  )
}
