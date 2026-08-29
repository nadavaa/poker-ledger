'use client'

import { useState } from 'react'
import { formatPhone } from '@/lib/payment'
import { Button } from '@/components/ui/button'

/**
 * Zelle has no deep link — it lives inside each bank's own app, with no
 * public URL scheme. So the honest thing is the number itself, copyable,
 * and a line saying where to take it.
 */
export function ZelleDetails({
  phone,
  payeeName,
  secondary = false,
}: {
  phone: string
  payeeName: string
  secondary?: boolean
}) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    await navigator.clipboard.writeText(phone)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (secondary) {
    return (
      <button
        onClick={copy}
        className="money select-text text-xs text-muted-foreground underline-offset-2 hover:underline"
      >
        {copied ? 'Copied' : `Zelle ${formatPhone(phone)}`}
      </button>
    )
  }

  return (
    <span className="flex flex-col items-end gap-1">
      <Button
        variant="outline"
        size="sm"
        className="rounded-xl"
        onClick={copy}
      >
        {copied ? 'Copied' : `Copy ${payeeName}'s number`}
      </Button>
      <span className="money select-text text-xs text-muted-foreground">
        {formatPhone(phone)}
      </span>
    </span>
  )
}
