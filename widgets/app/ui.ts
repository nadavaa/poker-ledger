// Building blocks that match the app: avatars, chips, money, cards, icons.
// Everything from the database goes in as text, never as markup (see dom.ts).

import { avatarColor, initials } from '@/lib/avatar'
import { h } from '../shared/dom'

export type Money = { cents: number; display: string }

export function avatar(name: string, id: string, large = false) {
  const c = avatarColor(id || name)
  return h('span', {
    class: `avatar${large ? ' lg' : ''}`,
    text: initials(name),
    attrs: { style: `background:${c.background};color:${c.foreground}`, 'aria-hidden': 'true' },
  })
}

export const tone = (cents: number) => (cents > 0 ? 'up' : cents < 0 ? 'down' : '')

/** "+$45", "-$30", "$0": the server's own display string, with a plus when up. */
export const signed = (m: Money) => (m.cents > 0 ? `+${m.display}` : m.display)

export function money(m: Money, opts: { sign?: boolean; display?: boolean; neutral?: boolean } = {}) {
  return h('span', {
    class: `${opts.display ? 'money-display' : 'money'} ${opts.neutral ? '' : tone(m.cents)}`.trim(),
    text: opts.sign === false ? m.display : signed(m),
  })
}

export const label = (text: string) => h('h2', { class: 'label', text })

export function chip(text: string, kind = '') {
  return h('span', { class: `chip ${kind}`.trim(), text })
}

const NS = 'http://www.w3.org/2000/svg'
export function icon(d: string, label: string) {
  const svg = document.createElementNS(NS, 'svg')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('fill', 'none')
  svg.setAttribute('stroke', 'currentColor')
  svg.setAttribute('stroke-width', '2')
  svg.setAttribute('stroke-linecap', 'round')
  svg.setAttribute('stroke-linejoin', 'round')
  svg.setAttribute('aria-hidden', 'true')
  const path = document.createElementNS(NS, 'path')
  path.setAttribute('d', d)
  svg.append(path)
  const b = h('button', { class: 'iconbtn', attrs: { 'aria-label': label, title: label, type: 'button' } })
  b.append(svg)
  return b
}

export const ICONS = {
  back: 'M15 18l-6-6 6-6',
  home: 'M3 11l9-8 9 8M5 10v10h14V10',
  external: 'M14 4h6v6M20 4l-9 9M18 14v6H4V6h6',
}

export const statusKind = (status: string) =>
  status === 'active' ? 'live' : status === 'settled' ? 'up' : status === 'cancelled' ? 'down' : status === 'reconciling' ? 'pending' : ''

export function statBox(labelText: string, value: string, sub?: string) {
  return h('div', { class: 'stat' },
    h('p', { class: 'label', text: labelText }),
    h('div', { class: 'v money', text: value }),
    sub ? h('div', { class: 'small muted money', text: sub }) : null
  )
}
