import { barHeights } from '@/lib/admin'

/**
 * Inline SVG, like the balance chart: this is a row of bars, and a library
 * would be more code than the thing it draws. An all-zero series renders as
 * an empty axis rather than nothing at all — "no signups for six weeks" is a
 * real answer and should look like one.
 */
export function BarChart({
  data,
  label,
}: {
  data: { label: string; value: number }[]
  label: string
}) {
  const w = 320
  const h = 88
  const gap = 3
  const values = data.map((d) => d.value)
  const heights = barHeights(values)
  const barW = data.length > 0 ? (w - gap * (data.length - 1)) / data.length : 0
  const total = values.reduce((s, v) => s + v, 0)

  return (
    <figure className="flex flex-col gap-1.5">
      <figcaption className="flex items-baseline justify-between text-[0.7rem] font-medium uppercase tracking-[0.08em] text-muted-foreground">
        <span>{label}</span>
        <span className="money normal-case tracking-normal">{total} total</span>
      </figcaption>
      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="w-full"
        role="img"
        aria-label={`${label}: ${data
          .map((d) => `${d.label} ${d.value}`)
          .join(', ')}`}
      >
        {data.map((d, i) => {
          const barH = Math.max(heights[i] * (h - 14), d.value > 0 ? 2 : 0)
          return (
            <rect
              key={d.label}
              x={i * (barW + gap)}
              y={h - 14 - barH}
              width={barW}
              height={barH}
              rx={2}
              className="fill-up"
            />
          )
        })}
        <line
          x1={0}
          y1={h - 14}
          x2={w}
          y2={h - 14}
          className="stroke-border"
          strokeWidth={1}
        />
      </svg>
      <div className="flex justify-between text-[0.65rem] text-muted-foreground">
        <span>{data[0]?.label}</span>
        <span>{data[data.length - 1]?.label}</span>
      </div>
    </figure>
  )
}

/** A labelled number. The unit of this whole page. */
export function Metric({
  label,
  value,
  sub,
}: {
  label: string
  value: string
  sub?: string
}) {
  return (
    <div className="flex flex-col gap-0.5 rounded-2xl border border-border bg-card px-3.5 py-3">
      <span className="text-[0.65rem] font-medium uppercase tracking-[0.08em] text-muted-foreground">
        {label}
      </span>
      <span className="money-display text-2xl font-semibold">{value}</span>
      {sub && (
        <span className="text-[0.7rem] text-muted-foreground">{sub}</span>
      )}
    </div>
  )
}

/** A funnel step and how much of the previous step reached it. */
export function FunnelRow({
  label,
  value,
  of,
}: {
  label: string
  value: number
  of?: number | null
}) {
  const share =
    of !== null && of !== undefined && of > 0
      ? `${((value / of) * 100).toFixed(0)}% of previous`
      : null
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border/60 py-2 last:border-0">
      <span className="text-sm">{label}</span>
      <span className="flex items-baseline gap-2">
        {share && (
          <span className="text-[0.7rem] text-muted-foreground">{share}</span>
        )}
        <span className="money text-base font-semibold">{value}</span>
      </span>
    </div>
  )
}
