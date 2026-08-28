'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'

/** WhatsApp is where the group actually lives, so hand them text to paste. */
export function CopySummary({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Button
      variant="outline"
      className="h-11 w-full rounded-xl"
      onClick={copy}
    >
      {copied ? 'Copied — paste it in the chat' : 'Copy summary for WhatsApp'}
    </Button>
  )
}
