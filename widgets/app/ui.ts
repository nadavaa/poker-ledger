// Building blocks that match the app: avatars, money, glyphs, the state banner.
// Everything from the database goes in as text, never as markup (see dom.ts).

import { avatarColor, initials } from '@/lib/avatar'
import { h } from '../shared/dom'

export type Money = { cents: number; display: string }

/**
 * A circle: the picture if there is one, otherwise initials on a colour from
 * the id, as in the app. A picture that does not load falls back to the same.
 */
export function avatar(name: string, id: string | null, url: string | null, size = 32) {
  const el = h('span', {
    class: 'avatar',
    attrs: { style: `width:${size}px;height:${size}px;font-size:${Math.max(11, Math.round(size * 0.4))}px`, 'aria-hidden': 'true' },
  })
  const c = avatarColor(id || name)
  const showInitials = () => {
    el.replaceChildren(initials(name))
    el.style.background = c.background
    el.style.color = c.foreground
  }
  if (url) {
    const img = document.createElement('img')
    img.alt = ''
    img.width = size
    img.height = size
    // A picture host does not need to know which page asked for it.
    img.referrerPolicy = 'no-referrer'
    img.addEventListener('error', showInitials)
    img.src = url
    el.append(img)
  } else {
    showInitials()
  }
  return el
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

const NS = 'http://www.w3.org/2000/svg'
function glyphSvg(d: string) {
  const svg = document.createElementNS(NS, 'svg')
  svg.setAttribute('viewBox', '0 0 12 12')
  svg.setAttribute('class', 'glyph')
  svg.setAttribute('fill', 'none')
  svg.setAttribute('stroke', 'currentColor')
  svg.setAttribute('stroke-width', '2')
  svg.setAttribute('stroke-linecap', 'round')
  svg.setAttribute('stroke-linejoin', 'round')
  svg.setAttribute('aria-hidden', 'true')
  const p = document.createElementNS(NS, 'path')
  p.setAttribute('d', d)
  svg.append(p)
  return svg
}

export type GameState = 'scheduled' | 'active' | 'reconciling' | 'settled' | 'cancelled'

const STATE_WORDS: Record<GameState, string> = {
  scheduled: 'Scheduled',
  active: 'In progress',
  reconciling: 'Counting chips',
  settled: 'Settled',
  cancelled: 'Cancelled',
}

/**
 * The state of a game, as the app shows it: its own colour and its own shape,
 * a hollow ring, a live dot, a square, a check, a slash, so colour never
 * carries it alone.
 */
export function stateBanner(status: string, overdue: boolean, detail: string) {
  const st = (status in STATE_WORDS ? status : 'scheduled') as GameState
  const late = overdue && st === 'scheduled'
  const glyph =
    st === 'active' ? h('span', { class: 'glyph-dot', attrs: { 'aria-hidden': 'true' } })
    : st === 'reconciling' ? h('span', { class: 'glyph-square', attrs: { 'aria-hidden': 'true' } })
    : st === 'settled' ? glyphSvg('M2 6.5 4.8 9.2 10 3.5')
    : st === 'cancelled' ? glyphSvg('M3 3l6 6M9 3l-6 6')
    : h('span', { class: `glyph-ring${late ? ' filled' : ''}`, attrs: { 'aria-hidden': 'true' } })
  return h('div', { class: `banner ${late ? 'overdue' : st}` },
    h('span', { class: 'what' }, glyph, h('span', { text: late ? 'Never started' : STATE_WORDS[st] })),
    h('span', { class: 'detail money', text: detail }))
}

/** The small status mark on a row in "Happening now". */
export function liveTag(status: string) {
  const live = status === 'active'
  return h('span', { class: `livetag ${live ? 'active' : 'scheduled'}` },
    h('span', { class: live ? 'glyph-dot' : 'glyph-ring', attrs: { 'aria-hidden': 'true', style: live ? 'width:8px;height:8px' : 'width:8px;height:8px' } }),
    h('span', { text: live ? 'Live' : 'Scheduled' }))
}

export function statBox(labelText: string, value: string, sub?: string) {
  return h('div', { class: 'stat' },
    h('p', { class: 'label', text: labelText }),
    h('div', { class: 'v money', text: value }),
    sub ? h('div', { class: 'small muted money', text: sub }) : null)
}
