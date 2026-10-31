import { ImageResponse } from 'next/og'
import { SITE_NAME } from '@/lib/landing-copy'

// Share preview for the public pages only. Static text, no data.
export const dynamic = 'force-static'

export function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: 72,
          background: '#0b0b0e',
          color: '#f5f5f5',
        }}
      >
        <div style={{ fontSize: 40, opacity: 0.7 }}>{SITE_NAME}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div style={{ fontSize: 80, fontWeight: 700, lineHeight: 1.05 }}>
            Track your home poker game. Settle up without the arguments.
          </div>
          <div style={{ fontSize: 34, opacity: 0.7 }}>
            Buy-ins, cash-outs and who owes whom. Free for now.
          </div>
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  )
}
