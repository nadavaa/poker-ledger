'use client'

import { useState } from 'react'
import { avatarColor, avatarSrc, initials } from '@/lib/avatar'

/**
 * One avatar for people and groups alike. Always a circle, always cropped to
 * centre rather than squashed, and never empty: a missing, deleted or broken
 * image falls back to initials on a colour derived from the id, so the same
 * person is the same colour everywhere.
 */
export function Avatar({
  id,
  name,
  url,
  bucket = 'avatars',
  size = 40,
  className = '',
}: {
  /** Drives the fallback colour, so it must be stable for the entity. */
  id: string | null | undefined
  name: string | null | undefined
  url: string | null | undefined
  bucket?: 'avatars' | 'group-avatars'
  size?: number
  className?: string
}) {
  // An avatar_url can outlive its object; falling back beats a broken icon.
  const [failed, setFailed] = useState(false)
  const src = failed ? null : avatarSrc(url, bucket)
  const { background, foreground } = avatarColor(id)

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full ${className}`}
      style={{ width: size, height: size }}
      aria-hidden
    >
      {src ? (
        // Plain img on purpose: already 512px webp, rendered at 40-64px, and
        // next/image would need remote patterns for two hosts to gain nothing.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          width={size}
          height={size}
          onError={() => setFailed(true)}
          className="size-full object-cover"
        />
      ) : (
        <span
          className="flex size-full items-center justify-center font-semibold"
          style={{
            background,
            color: foreground,
            fontSize: Math.max(11, Math.round(size * 0.4)),
          }}
        >
          {initials(name)}
        </span>
      )}
    </span>
  )
}
