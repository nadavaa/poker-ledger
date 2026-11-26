'use client'

import { useState } from 'react'
import { QrCode } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { ActionSheet } from '@/components/action-sheet'
import { Button } from '@/components/ui/button'

/**
 * A QR icon that opens a sheet with the link as a QR code, for handing a
 * phone across the table instead of texting the link.
 */
export function QrLinkButton({
  path,
  title,
  description,
  size = 'icon-xs',
}: {
  path: string
  title: string
  description?: string
  /** icon-sm sits level with a size="sm" button beside it. */
  size?: 'icon-xs' | 'icon-sm'
}) {
  // The url outlives `open`, so the code is still there while the sheet
  // slides away rather than vanishing from inside it.
  const [url, setUrl] = useState<string | null>(null)
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button
        variant="outline"
        size={size}
        aria-label={`Show ${title} QR code`}
        onClick={() => {
          setUrl(`${window.location.origin}${path}`)
          setOpen(true)
        }}
      >
        <QrCode className="size-4" aria-hidden />
      </Button>

      <ActionSheet
        open={open}
        title={title}
        description={description}
        onClose={() => setOpen(false)}
      >
        {url && (
          // Always dark on white: scanners read a light-on-dark code badly,
          // and the quiet zone around it is part of the code.
          // It arrives just behind the sheet, fading up from slightly small,
          // rather than as a white square that is simply there.
          <div className="mx-auto rounded-2xl bg-white p-4 animate-[qr-in_320ms_ease-out_120ms_both]">
            <QRCodeSVG
              value={url}
              size={224}
              marginSize={0}
              bgColor="#ffffff"
              fgColor="#000000"
              title={url}
            />
          </div>
        )}
      </ActionSheet>
    </>
  )
}
