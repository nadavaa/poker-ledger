import { formatCents } from '@/lib/money'
import type { BalancePoint } from '@/lib/stats'

/**
 * Running balance over a season. Inline SVG, no chart library: it's a single
 * polyline and a zero rule, and the zero rule is the part that matters —
 * whether the line is above or below it is the whole question.
 */
export function BalanceChart({ points }: { points: BalancePoint[] }) {
  if (points.length < 2) return null

  const w = 320
  const h = 96
  const pad = 6

  const values = points.map((p) => p.balanceCents)
  const max = Math.max(...values, 0)
  const min = Math.min(...values, 0)
  const span = max - min || 1

  const x = (i: number) => pad + (i * (w - pad * 2)) / (points.length - 1)
  const y = (v: number) => pad + ((max - v) * (h - pad * 2)) / span

  const line = points.map((p, i) => `${x(i)},${y(p.balanceCents)}`).join(' ')
  const last = values[values.length - 1]
  const up = last >= 0

  return (
    <div className="rounded-2xl border border-border bg-card p-3">
      <div className="flex items-baseline justify-between">
        <span className="text-[0.7rem] font-medium uppercase tracking-[0.08em] text-muted-foreground">
          Running balance
        </span>
        <span
          className={`money text-sm font-semibold ${
            up ? 'text-up' : 'text-down'
          }`}
        >
          {formatCents(last)}
        </span>
      </div>
      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="mt-2 w-full"
        role="img"
        aria-label={`Running balance across ${points.length} games, currently ${formatCents(last)}`}
      >
        <line
          x1={pad}
          x2={w - pad}
          y1={y(0)}
          y2={y(0)}
          stroke="currentColor"
          className="text-border"
          strokeWidth={1}
          strokeDasharray="3 3"
        />
        <polyline
          points={line}
          fill="none"
          stroke="currentColor"
          className={up ? 'text-up' : 'text-down'}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle
          cx={x(points.length - 1)}
          cy={y(last)}
          r={3.5}
          className={up ? 'fill-up' : 'fill-down'}
        />
      </svg>
    </div>
  )
}
