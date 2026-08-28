import { ImageResponse } from 'next/og'

export const size = { width: 512, height: 512 }
export const contentType = 'image/png'

// Generated at build time so there's no binary asset to keep in sync.
export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0a0a0c',
          color: '#4ade80',
          fontSize: 300,
          fontWeight: 700,
        }}
      >
        ♠
      </div>
    ),
    size
  )
}
