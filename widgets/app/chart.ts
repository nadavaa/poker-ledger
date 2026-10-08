// The running balance as an inline SVG. The question the chart answers is
// "above or below zero", so zero is the loudest line, labelled in words, and
// the two sides differ by shape and caption as well as by colour: points above
// zero are filled, points below are hollow.

import { formatCents } from '@/lib/money'
import { sideOfZero, type StatsPoint } from '@/lib/mcp/ui/shape'

const NS = 'http://www.w3.org/2000/svg'
const svg = <K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {}
) => {
  const el = document.createElementNS(NS, tag)
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v))
  return el
}

/** Round tick steps (1, 2, 5 × 10ⁿ dollars) so the labels read cleanly. */
function niceStep(range: number, target: number): number {
  const raw = range / target
  const pow = 10 ** Math.floor(Math.log10(raw))
  const f = raw / pow
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * pow
}

export type ChartHandlers = {
  /** Called with the point under the finger or cursor, or null to clear. */
  onPoint: (index: number | null, x: number, y: number) => void
}

export function drawChart(
  points: StatsPoint[],
  width: number,
  handlers: ChartHandlers
): SVGSVGElement {
  const H = 220
  const pad = { l: 52, r: 12, t: 14, b: 26 }
  const w = Math.max(240, width)
  const plotW = w - pad.l - pad.r
  const plotH = H - pad.t - pad.b

  // One point, or a flat season, still gets a drawable range around zero.
  const values = points.map((p) => p.running.cents)
  let lo = Math.min(0, ...values)
  let hi = Math.max(0, ...values)
  if (hi === lo) hi = lo + 100
  const step = niceStep(hi - lo, 4)
  lo = Math.floor(lo / step) * step
  hi = Math.ceil(hi / step) * step

  const x = (i: number) =>
    pad.l + (points.length === 1 ? plotW / 2 : (i / (points.length - 1)) * plotW)
  const y = (cents: number) => pad.t + ((hi - cents) / (hi - lo)) * plotH
  const zeroY = y(0)

  const root = svg('svg', {
    viewBox: `0 0 ${w} ${H}`,
    width: w,
    height: H,
    role: 'img',
    'aria-label': describe(points),
  })
  root.style.touchAction = 'pan-y'
  root.style.display = 'block'

  // Gridlines and dollar labels, in the app's own money format.
  for (let t = lo; t <= hi; t += step) {
    if (t === 0) continue
    root.append(
      svg('line', { x1: pad.l, x2: w - pad.r, y1: y(t), y2: y(t), stroke: 'var(--line)', 'stroke-width': 1, opacity: 0.5 })
    )
    const label = svg('text', { x: pad.l - 6, y: y(t) + 4, 'text-anchor': 'end', fill: 'var(--fg-soft)', 'font-size': 11 })
    label.textContent = formatCents(t)
    root.append(label)
  }

  // Area between the line and zero: green above, red below, clipped so each
  // colour stays on its own side.
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(i)},${y(p.running.cents)}`).join(' ')
  if (points.length > 1) {
    const area = `${path} L${x(points.length - 1)},${zeroY} L${x(0)},${zeroY} Z`
    const defs = svg('defs')
    const above = svg('clipPath', { id: 'above' })
    above.append(svg('rect', { x: 0, y: 0, width: w, height: zeroY }))
    const below = svg('clipPath', { id: 'below' })
    below.append(svg('rect', { x: 0, y: zeroY, width: w, height: H - zeroY }))
    defs.append(above, below)
    root.append(
      defs,
      svg('path', { d: area, fill: 'var(--good)', opacity: 0.18, 'clip-path': 'url(#above)' }),
      svg('path', { d: area, fill: 'var(--bad)', opacity: 0.18, 'clip-path': 'url(#below)' })
    )
  }

  // The zero line: solid, heavier than the grid, and named.
  root.append(
    svg('line', { x1: pad.l, x2: w - pad.r, y1: zeroY, y2: zeroY, stroke: 'var(--fg)', 'stroke-width': 2 })
  )
  const zeroLabel = svg('text', { x: pad.l - 6, y: zeroY + 4, 'text-anchor': 'end', fill: 'var(--fg)', 'font-size': 11, 'font-weight': 700 })
  zeroLabel.textContent = '$0'
  root.append(zeroLabel)
  const up = svg('text', { x: w - pad.r, y: Math.max(pad.t + 10, zeroY - 6), 'text-anchor': 'end', fill: 'var(--good)', 'font-size': 11, 'font-weight': 600 })
  up.textContent = '▲ up'
  const down = svg('text', { x: w - pad.r, y: Math.min(H - pad.b - 4, zeroY + 15), 'text-anchor': 'end', fill: 'var(--bad)', 'font-size': 11, 'font-weight': 600 })
  down.textContent = '▼ down'
  root.append(up, down)

  if (points.length > 1) {
    root.append(
      svg('path', { d: path, fill: 'none', stroke: 'var(--fg)', 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' })
    )
  }

  // Dates at the two ends only: more would collide on a phone.
  const first = svg('text', { x: pad.l, y: H - 6, 'text-anchor': 'start', fill: 'var(--fg-soft)', 'font-size': 11 })
  first.textContent = points[0].date
  root.append(first)
  if (points.length > 1) {
    const last = svg('text', { x: w - pad.r, y: H - 6, 'text-anchor': 'end', fill: 'var(--fg-soft)', 'font-size': 11 })
    last.textContent = points[points.length - 1].date
    root.append(last)
  }

  const dots: SVGCircleElement[] = []
  const r = points.length > 40 ? 3 : 5
  points.forEach((p, i) => {
    const side = sideOfZero(p.running.cents)
    const dot = svg('circle', {
      cx: x(i),
      cy: y(p.running.cents),
      r,
      // Filled above or at zero, hollow below: readable in greyscale.
      fill: side === 'down' ? 'var(--bg)' : 'var(--fg)',
      stroke: side === 'down' ? 'var(--bad)' : 'var(--fg)',
      'stroke-width': 2,
      tabindex: 0,
      role: 'img',
      'aria-label': pointWords(p),
    })
    dots.push(dot)
    const show = () => {
      dots.forEach((d, j) => d.setAttribute('r', String(j === i ? r + 3 : r)))
      handlers.onPoint(i, x(i), y(p.running.cents))
    }
    dot.addEventListener('focus', show)
    dot.addEventListener('blur', () => {
      dots.forEach((d) => d.setAttribute('r', String(r)))
      handlers.onPoint(null, 0, 0)
    })
    root.append(dot)
  })

  // One handler for hover and touch: the nearest point by x, so a fingertip
  // does not have to land on a 10px dot.
  const nearest = (clientX: number) => {
    const box = root.getBoundingClientRect()
    const px = ((clientX - box.left) / box.width) * w
    let best = 0
    points.forEach((_, i) => {
      if (Math.abs(x(i) - px) < Math.abs(x(best) - px)) best = i
    })
    return best
  }
  const pick = (e: PointerEvent) => {
    const i = nearest(e.clientX)
    dots.forEach((d, j) => d.setAttribute('r', String(j === i ? r + 3 : r)))
    handlers.onPoint(i, x(i), y(points[i].running.cents))
  }
  root.addEventListener('pointermove', pick)
  root.addEventListener('pointerdown', pick)
  root.addEventListener('pointerleave', (e) => {
    if (e.pointerType === 'mouse') {
      dots.forEach((d) => d.setAttribute('r', String(r)))
      handlers.onPoint(null, 0, 0)
    }
  })
  return root
}

export function pointWords(p: StatsPoint): string {
  const side = sideOfZero(p.running.cents)
  const net = sideOfZero(p.net.cents)
  const game = net === 'even' ? 'broke even' : `${net === 'up' ? 'won' : 'lost'} ${formatCents(Math.abs(p.net.cents))}`
  const total =
    side === 'even' ? 'even overall' : `${formatCents(Math.abs(p.running.cents))} ${side} overall`
  return `${p.date}: ${game}, ${total}`
}

function describe(points: StatsPoint[]): string {
  const last = points[points.length - 1]
  const side = sideOfZero(last.running.cents)
  return `Running balance over ${points.length} games, ending ${side === 'even' ? 'at zero' : `${formatCents(Math.abs(last.running.cents))} ${side}`}.`
}
