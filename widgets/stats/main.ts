import '../shared/base.css'
import './styles.css'
import { formatCents } from '@/lib/money'
import { parseResult, sideOfZero, statsView, type StatsView } from '@/lib/mcp/ui/shape'
import { h, mount } from '../shared/dom'
import { startApp } from '../shared/host'
import { drawChart, pointWords } from './chart'

const root = document.getElementById('root')!
let view: StatsView | { kind: 'error'; message: string } | null = null

startApp('Poker Ledger stats', (result) => {
  const parsed = parseResult(result)
  view = parsed.ok ? statsView(parsed.data) : { kind: 'error', message: parsed.message }
  render()
})

function stat(label: string, value: string, note?: string) {
  return h('div', { class: 'stat' },
    h('div', { class: 'stat-label muted', text: label }),
    h('div', { class: 'stat-value', text: value }),
    note ? h('div', { class: 'stat-note muted', text: note }) : null
  )
}

function render() {
  if (!view) return
  if (view.kind === 'error' || view.kind === 'empty') {
    mount(root, h('p', { class: 'muted', text: view.message }))
    return
  }
  const v = view
  const side = sideOfZero(v.lifetime.cents)
  const net = v.lifetime.cents === 0 ? '$0' : `${v.lifetime.cents > 0 ? '+' : '−'}${formatCents(Math.abs(v.lifetime.cents))}`

  const tip = h('div', { class: 'tip', attrs: { role: 'status', hidden: '' } })
  const frame = h('div', { class: 'frame' }, tip)

  let chartEl: SVGSVGElement | null = null
  const paint = () => {
    chartEl?.remove()
    chartEl = drawChart(v.points, frame.clientWidth || 320, {
      onPoint: (i, px, py) => {
        if (i === null) {
          tip.hidden = true
          return
        }
        const p = v.points[i]
        const n = sideOfZero(p.net.cents)
        tip.replaceChildren(
          h('strong', { text: p.date }),
          h('div', { text: n === 'even' ? 'Broke even' : `${n === 'up' ? '▲ Won' : '▼ Lost'} ${formatCents(Math.abs(p.net.cents))}` }),
          h('div', { class: 'muted', text: `Balance ${p.running.display}` })
        )
        tip.hidden = false
        // Keep the tip inside the frame: flip to the left of the point near the right edge.
        const flip = px > frame.clientWidth / 2
        tip.style.left = flip ? '' : `${px + 10}px`
        tip.style.right = flip ? `${frame.clientWidth - px + 10}px` : ''
        tip.style.top = `${Math.max(0, py - 24)}px`
      },
    })
    frame.append(chartEl)
  }

  mount(
    root,
    h('div', { class: 'head' },
      stat('Lifetime net', net, side === 'even' ? 'even' : side === 'up' ? 'up overall' : 'down overall'),
      stat('Games', String(v.games)),
      stat('Win rate', `${v.winRatePercent}%`),
      stat('Streak', v.streak.words)
    ),
    v.group ? h('div', { class: 'muted group', text: `${v.group} · running balance` }) : null,
    frame,
    h('p', { class: 'hint muted', text: 'Tap or hover the chart for a game’s date and result.' }),
    // Same facts as the chart, in order, for a screen reader.
    h('ul', { class: 'sr-only' }, ...v.points.map((p) => h('li', { text: pointWords(p) })))
  )
  paint()
  let last = frame.clientWidth
  new ResizeObserver(() => {
    if (Math.abs(frame.clientWidth - last) > 1) {
      last = frame.clientWidth
      paint()
    }
  }).observe(frame)
}
