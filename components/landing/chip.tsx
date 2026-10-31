// A casino chip drawn in SVG: edge notches from a dashed stroke, an inner ring,
// a face. Three inks only (ink, felt green, bone) so it stays in the palette.

export type ChipTone = 'green' | 'ink' | 'bone'

const TONES: Record<ChipTone, { body: string; mark: string; face: string }> = {
  green: {
    body: 'oklch(0.42 0.1 160)',
    mark: 'oklch(0.96 0.01 100)',
    face: 'oklch(0.36 0.09 160)',
  },
  ink: {
    body: 'oklch(0.22 0.03 165)',
    mark: 'oklch(0.96 0.01 100)',
    face: 'oklch(0.17 0.025 165)',
  },
  bone: {
    body: 'oklch(0.94 0.015 100)',
    mark: 'oklch(0.42 0.1 160)',
    face: 'oklch(0.9 0.02 100)',
  },
}

export function Chip({
  tone = 'green',
  size = 120,
  className = '',
  style,
}: {
  tone?: ChipTone
  size?: number
  className?: string
  style?: React.CSSProperties
}) {
  const t = TONES[tone]
  return (
    <svg
      viewBox="0 0 120 120"
      width={size}
      height={size}
      aria-hidden
      className={`lp-chip ${className}`}
      style={style}
    >
      <circle cx="60" cy="60" r="58" fill={t.body} />
      <circle
        cx="60"
        cy="60"
        r="53"
        fill="none"
        stroke={t.mark}
        strokeWidth="9"
        strokeDasharray="17 16.7"
        opacity="0.95"
      />
      <circle cx="60" cy="60" r="42" fill={t.face} />
      <circle
        cx="60"
        cy="60"
        r="37"
        fill="none"
        stroke={t.mark}
        strokeWidth="1.5"
        opacity="0.8"
      />
      <path
        d="M60 44 L72 60 L60 76 L48 60 Z"
        fill={t.mark}
        opacity="0.92"
      />
    </svg>
  )
}
