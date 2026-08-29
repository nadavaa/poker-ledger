// Avatar helpers: turning an id and a name into something to show when there
// is no photo, and turning a stored value into a URL.
//
// Pure, so the fallback is testable: an empty circle or a broken image icon
// is worse than no photo at all.

/** Up to two letters, from the first and last word of a name. */
export function initials(name: string | null | undefined): string {
  const words = (name ?? '').trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '?'
  const first = words[0]![0]!
  const last = words.length > 1 ? words[words.length - 1]![0]! : ''
  return (first + last).toUpperCase()
}

// Spread around the wheel rather than picked from a list, so two people in the
// same group rarely collide.
const HUES = [8, 34, 62, 96, 140, 172, 200, 232, 262, 292, 320, 348]

/**
 * A hue derived from the id, so the same person is the same colour on every
 * device and every session. Returns HSL strings rather than tokens because
 * this is generated colour, not part of the palette.
 */
export function avatarColor(id: string | null | undefined): {
  background: string
  foreground: string
} {
  let hash = 0
  for (const ch of id ?? '') {
    hash = (hash * 31 + ch.charCodeAt(0)) >>> 0
  }
  const hue = HUES[hash % HUES.length]!
  return {
    background: `hsl(${hue} 52% 42%)`,
    foreground: 'hsl(0 0% 100%)',
  }
}

/**
 * `avatar_url` holds either a storage path we wrote (`{owner}/{uuid}.webp`)
 * or an absolute URL — Google hands one over at signup — so absolute values
 * pass through untouched.
 */
export function avatarSrc(
  value: string | null | undefined,
  bucket: 'avatars' | 'group-avatars'
): string | null {
  const v = value?.trim()
  if (!v) return null
  if (v.startsWith('http://') || v.startsWith('https://')) return v
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!base) return null
  return `${base}/storage/v1/object/public/${bucket}/${v}`
}

/** The path inside the bucket, or null if the value is an external URL. */
export function storagePath(value: string | null | undefined): string | null {
  const v = value?.trim()
  if (!v || v.startsWith('http://') || v.startsWith('https://')) return null
  return v
}
