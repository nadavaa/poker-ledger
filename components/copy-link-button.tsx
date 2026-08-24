'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'

export function CopyLinkButton({
  path,
  label,
  size = 'sm',
}: {
  path: string
  label: string
  size?: 'sm' | 'xs' | 'default'
}) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    await navigator.clipboard.writeText(`${window.location.origin}${path}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Button variant="outline" size={size} onClick={copy}>
      {copied ? 'Copied!' : label}
    </Button>
  )
}
