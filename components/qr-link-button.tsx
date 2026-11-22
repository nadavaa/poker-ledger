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
}: {
  path: string
  title: string
  description?: string
}) {
  const [url, setUrl] = useState<string | null>(null)

  return (
    <>
      <Button
        variant="outline"
        size="icon-xs"
        aria-label={`Show ${title} QR code`}
        onClick={() => setUrl(`${window.location.origin}${path}`)}
      >
        <QrCode className="size-4" aria-hidden />
      </Button>

      <ActionSheet
        open={url !== null}
        title={title}
        description={description}
        onClose={() => setUrl(null)}
      >
        {url && (
          // Always dark on white: scanners read a light-on-dark code badly,
          // and the quiet zone around it is part of the code.
          <div className="mx-auto rounded-2xl bg-white p-4">
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
