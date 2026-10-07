// The Poker Ledger view. One page, several screens, the way the app is laid
// out: your groups, a group's games, members and stats, one game, what you
// owe, your results. Moving between them is the page calling the same read
// tools an agent would, through the host, as you. Nothing here reaches the
// database, and nothing is loaded from the network.
//
// The one thing it can change is your own seat, on a scheduled game, in two
// steps: a call with no token returns a preview and changes nothing, and your
// click on Confirm is the yes that sends the token back.

import './styles.css'
import {
  appLink,
  balancesView,
  contextLine,
  debtView,
  gameCardView,
  gamesView,
  groupsView,
  membersView,
  parseResult,
  safeOrigin,
  SCREEN_OF_TOOL,
  sideOfZero,
  standingWords,
  statsView,
  stepOf,
  type GameCardView,
  type Parsed,
  type Person,
  type ScreenKind,
  type Standing,
} from '@/lib/mcp/ui/shape'
import { formatCents } from '@/lib/money'
import { h, mount } from '../shared/dom'
import { startApp } from '../shared/host'
import { drawChart, pointWords } from './chart'
import { avatar, chip, ICONS, icon, label, money, signed, statBox, statusKind, tone } from './ui'

type Tab = 'games' | 'members' | 'stats'
type Route =
  | { s: 'groups' }
  | { s: 'group'; id: string; name: string; tab: Tab }
  | { s: 'game'; id: string }
  | { s: 'balances' }
  | { s: 'debt' }

type Card = Extract<GameCardView, { kind: 'card' }>
type Phase =
  | { kind: 'idle' }
  | { kind: 'working'; label: string }
  | { kind: 'confirm'; action: 'join' | 'withdraw'; text: string; token: string }

const root = document.getElementById('root')!
const origin = safeOrigin(document.querySelector('meta[name="app-origin"]')?.getAttribute('content'))

const stack: Route[] = []
const cache = new Map<string, Parsed>()
const inflight = new Set<string>()
let phase: Phase = { kind: 'idle' }
let note: { text: string; detail?: string | null; error?: boolean } | null = null
let lastArgs: Record<string, unknown> = {}
let resizer: ResizeObserver | null = null
let contextFor = ''

const app = startApp('Poker Ledger', (result) => {
  const parsed = parseResult(result)
  const tool = (app.getHostContext() as { toolInfo?: { tool?: { name?: string } } } | undefined)?.toolInfo?.tool?.name
  const kind = parsed.ok ? kindOf(tool, parsed.data) : tool ? (SCREEN_OF_TOOL[tool] ?? null) : null
  void begin(kind, parsed)
}, (args) => {
  lastArgs = args
})

const top = () => stack[stack.length - 1]

function kindOf(tool: string | undefined, data: Record<string, unknown>): ScreenKind | null {
  if (tool && SCREEN_OF_TOOL[tool]) return SCREEN_OF_TOOL[tool]
  if (Array.isArray(data.groups)) return 'groups'
  if (Array.isArray(data.members)) return 'members'
  if ('per_game' in data) return 'stats'
  if ('i_owe' in data) return 'debt'
  if (typeof data.game_id === 'string' && 'roster' in data) return 'game'
  if ('total_net' in data) return 'balances'
  if (Array.isArray(data.games)) return 'games'
  return null
}

// ----------------------------------------------------------------- data

async function call(name: string, args: Record<string, unknown>) {
  try {
    return await app.callServerTool({ name, arguments: args })
  } catch {
    return {
      isError: true,
      content: [{ type: 'text' as const, text: 'Could not reach Poker Ledger. Check your connection and try again.' }],
    }
  }
}

const keyOf = {
  groups: 'groups',
  games: (g: string) => `games:${g}`,
  members: (g: string) => `members:${g}`,
  stats: (g: string) => `stats:${g}`,
  game: (id: string) => `game:${id}`,
  balances: 'balances',
  debt: 'debt',
}

async function load(key: string, tool: string, args: Record<string, unknown>, force = false) {
  if (!force && cache.has(key)) return cache.get(key)!
  const parsed = parseResult(await call(tool, args))
  if (parsed.ok) cache.set(key, parsed)
  return parsed
}

/** The first result becomes the first screen. Later screens fetch their own. */
async function begin(kind: ScreenKind | null, parsed: Parsed) {
  stack.length = 0
  if (!parsed.ok || !kind) {
    stack.push({ s: 'groups' })
    cache.set('groups', parsed.ok ? { ok: false, message: 'That did not look like something this view can show.' } : parsed)
    render()
    return
  }
  const d = parsed.data
  const groupName = typeof d.group === 'string' ? d.group : ''
  let gid = typeof lastArgs.group_id === 'string' ? lastArgs.group_id : ''
  switch (kind) {
    case 'groups':
      cache.set('groups', parsed)
      stack.push({ s: 'groups' })
      break
    case 'game':
      cache.set(keyOf.game(String(d.game_id)), parsed)
      stack.push({ s: 'game', id: String(d.game_id) })
      break
    case 'balances':
      cache.set('balances', parsed)
      stack.push({ s: 'balances' })
      break
    case 'debt':
      cache.set('debt', parsed)
      stack.push({ s: 'debt' })
      break
    default: {
      // games, stats, members: all about one group, whose id the tool was given.
      if (!gid) gid = await groupIdByName(groupName)
      const tab: Tab = kind === 'games' ? 'games' : kind === 'members' ? 'members' : 'stats'
      if (gid) cache.set(kind === 'games' ? keyOf.games(gid) : kind === 'members' ? keyOf.members(gid) : keyOf.stats(gid), parsed)
      stack.push({ s: 'group', id: gid, name: groupName, tab })
    }
  }
  render()
}

async function groupIdByName(name: string): Promise<string> {
  if (!name) return ''
  const r = await load('groups', 'list_my_groups', {})
  if (!r.ok) return ''
  const hits = groupsView(r.data).filter((g) => g.name === name)
  return hits.length === 1 ? hits[0].id : ''
}

// ------------------------------------------------------------ navigation

function go(route: Route) {
  stack.push(route)
  phase = { kind: 'idle' }
  note = null
  render()
}
function back() {
  if (stack.length > 1) stack.pop()
  phase = { kind: 'idle' }
  note = null
  render()
}
function home() {
  stack.length = 0
  stack.push({ s: 'groups' })
  phase = { kind: 'idle' }
  note = null
  render()
}
async function openOnWeb(url: string | null) {
  if (!url) return
  const r = await app.openLink({ url }).catch(() => ({ isError: true }))
  if (r.isError) {
    note = { text: 'Could not open Poker Ledger from here. Open it in your browser.', error: true }
    render()
  }
}

// ----------------------------------------------------------------- shell

function titleOf(r: Route): string {
  switch (r.s) {
    case 'groups': return 'Poker Ledger'
    case 'group': return r.name || 'Group'
    case 'balances': return 'My results'
    case 'debt': return 'Owed'
    case 'game': {
      const c = cache.get(keyOf.game(r.id))
      const v = c?.ok ? gameCardView(c.data) : null
      return v?.title ?? 'Game'
    }
  }
}

function shell(r: Route, body: Node[], webUrl: string | null) {
  return [
    h('header', { class: 'head' },
      stack.length > 1 ? withClick(icon(ICONS.back, 'Back'), back) : null,
      h('h1', { text: titleOf(r) }),
      r.s !== 'groups' ? withClick(icon(ICONS.home, 'All groups'), home) : null
    ),
    h('div', { class: 'stack fade' }, ...body),
    webUrl
      ? h('div', { class: 'footer' },
          h('button', { class: 'btn ghost', attrs: { type: 'button' }, on: { click: () => void openOnWeb(webUrl) } }, 'Open in Poker Ledger ↗'))
      : null,
    note && r.s !== 'game'
      ? h('div', { class: `note${note.error ? ' err' : ''}`, attrs: { role: 'status' } }, note.text)
      : null,
  ]
}

function withClick<T extends HTMLElement>(el: T, fn: () => void): T {
  el.addEventListener('click', fn)
  return el
}

function loading(text = 'Loading…') {
  return h('p', { class: 'muted', text })
}

function failed(message: string, retry: () => void) {
  return h('div', { class: 'stack-sm' },
    h('div', { class: 'note err', text: message, attrs: { role: 'status' } }),
    h('button', { class: 'btn', attrs: { type: 'button' }, on: { click: retry } }, 'Try again'))
}

/** Show a screen's data, fetching it first if it is not here yet. */
function withData(key: string, fetcher: () => Promise<Parsed>, show: (d: Record<string, unknown>) => Node[]): Node[] {
  const got = cache.get(key)
  if (got) {
    return got.ok ? show(got.data) : [failed(got.message, () => { cache.delete(key); render() })]
  }
  if (!inflight.has(key)) {
    inflight.add(key)
    void fetcher().then((r) => {
      inflight.delete(key)
      if (!r.ok) cache.set(key, r)
      render()
    })
  }
  return [loading()]
}

function render() {
  resizer?.disconnect()
  resizer = null
  const r = top()
  if (!r) return
  let nodes: Node[]
  let web: string | null = origin
  switch (r.s) {
    case 'groups':
      nodes = groupsScreen()
      break
    case 'group':
      nodes = groupScreen(r)
      web = appLink(origin, { group: r.id })
      break
    case 'game':
      nodes = gameScreen(r)
      web = appLink(origin, { game: r.id })
      break
    case 'balances':
      nodes = balancesScreen()
      break
    case 'debt':
      nodes = debtScreen()
      break
  }
  mount(root, ...shell(r, nodes, web))
  afterMount?.()
  afterMount = null
}
let afterMount: (() => void) | null = null

// ----------------------------------------------------------------- groups

function groupsScreen(): Node[] {
  return withData('groups', () => load('groups', 'list_my_groups', {}), (d) => {
    const groups = groupsView(d)
    if (groups.length === 0) {
      return [h('div', { class: 'card stack-sm' },
        h('strong', { text: 'No groups yet' }),
        h('p', { class: 'muted', text: 'A group is the crew you play with. Create or join one in Poker Ledger, then it shows up here.' }))]
    }
    // Lifetime and member counts arrive a moment after the list, so the
    // list itself is never waiting on them.
    for (const g of groups.slice(0, 8)) {
      void load(keyOf.stats(g.id), 'get_my_stats', { group_id: g.id }).then(rerenderIfHome)
      void load(keyOf.members(g.id), 'list_group_members', { group_id: g.id }).then(rerenderIfHome)
    }
    return [
      label('Your groups'),
      ...groups.map((g) => {
        const stats = cache.get(keyOf.stats(g.id))
        const sv = stats?.ok ? statsView(stats.data) : null
        const mem = cache.get(keyOf.members(g.id))
        const count = mem?.ok ? membersView(mem.data).members.length : null
        return h('button', {
          class: 'card row', attrs: { type: 'button' },
          on: { click: () => go({ s: 'group', id: g.id, name: g.name, tab: 'games' }) },
        },
          avatar(g.name, g.id, true),
          h('div', { class: 'grow' },
            h('div', { class: 'trunc', text: g.name, attrs: { style: 'font-weight:500' } }),
            h('div', { class: 'small muted money', text: count === null ? g.role : `${count} ${count === 1 ? 'member' : 'members'} · ${g.role}` })),
          sv && sv.kind === 'chart'
            ? h('div', { class: 'right' },
                h('div', { class: `money-display ${tone(sv.lifetime.cents)}`, text: signed(sv.lifetime), attrs: { style: 'font-size:22px' } }),
                h('div', { class: 'label', text: 'lifetime' }))
            : null)
      }),
      label('You'),
      h('button', { class: 'item', attrs: { type: 'button' }, on: { click: () => go({ s: 'debt' }) } },
        h('span', { text: 'What you owe and are owed' }), h('span', { class: 'muted', text: '›' })),
      h('button', { class: 'item', attrs: { type: 'button' }, on: { click: () => go({ s: 'balances' }) } },
        h('span', { text: 'My results, game by game' }), h('span', { class: 'muted', text: '›' })),
    ]
  })
}

function rerenderIfHome() {
  if (top()?.s === 'groups') render()
}

// ------------------------------------------------------------------ group

function groupScreen(r: Extract<Route, { s: 'group' }>): Node[] {
  const tabs: [Tab, string][] = [['games', 'Games'], ['members', 'Members'], ['stats', 'My Stats']]
  const idx = tabs.findIndex(([t]) => t === r.tab)
  const bar = h('nav', { class: 'tabs', attrs: { 'aria-label': 'Group sections' } },
    h('span', { class: 'pill', attrs: { 'aria-hidden': 'true', style: `transform:translateX(${idx * 100}%)` } }),
    ...tabs.map(([t, text]) =>
      h('button', {
        attrs: { type: 'button', ...(t === r.tab ? { 'aria-current': 'true' } : {}) },
        text,
        on: { click: () => { r.tab = t; phase = { kind: 'idle' }; note = null; render() } },
      })))
  if (!r.id) {
    return [bar, h('p', { class: 'muted', text: 'Open this group from All groups to see its games, members and stats.' })]
  }
  const body =
    r.tab === 'games' ? gamesTab(r)
    : r.tab === 'members' ? membersTab(r)
    : statsTab(r)
  return [bar, ...body]
}

function standingChip(s: Standing) {
  return s.kind === 'seated' ? chip('✓ Seated', 'up')
    : s.kind === 'waitlisted' ? chip(`Waitlist #${s.position}`, 'pending')
    : null
}

function gamesTab(r: Extract<Route, { s: 'group' }>): Node[] {
  return withData(keyOf.games(r.id), () => load(keyOf.games(r.id), 'list_games', { group_id: r.id }), (d) => {
    const v = gamesView(d)
    if (v.games.length === 0) return [h('p', { class: 'muted', text: 'No games yet.' })]
    return [
      ...v.games.map((g) =>
        h('button', { class: 'item', attrs: { type: 'button' }, on: { click: () => go({ s: 'game', id: g.id }) } },
          h('div', { class: 'grow stack-sm', attrs: { style: 'gap:2px' } },
            h('div', { class: 'row', attrs: { style: 'gap:6px;flex-wrap:wrap' } },
              h('strong', { class: 'wrap', text: g.title }),
              chip(g.status, statusKind(g.status)),
              standingChip(g.standing)),
            g.title !== g.when ? h('div', { class: 'small muted', text: g.when }) : null,
            g.location ? h('div', { class: 'small muted wrap', text: g.location }) : null,
            h('div', { class: 'small money', text: g.seats })),
          h('span', { class: 'muted', text: '›' }))),
      v.note ? h('p', { class: 'small muted', text: v.note }) : null,
    ].filter(Boolean) as Node[]
  })
}

function membersTab(r: Extract<Route, { s: 'group' }>): Node[] {
  return withData(keyOf.members(r.id), () => load(keyOf.members(r.id), 'list_group_members', { group_id: r.id }), (d) => {
    const v = membersView(d)
    return [
      h('div', { class: 'label-row' }, label('Members'), h('span', { class: 'small muted money', text: String(v.members.length) })),
      ...v.members.map((m) => h('div', { class: 'item', attrs: { style: 'justify-content:flex-start' } }, avatar(m.name, m.id), h('span', { class: 'wrap', text: m.name }))),
    ]
  })
}

function statsTab(r: Extract<Route, { s: 'group' }>): Node[] {
  return withData(keyOf.stats(r.id), () => load(keyOf.stats(r.id), 'get_my_stats', { group_id: r.id }), (d) => {
    const v = statsView(d)
    if (v.kind === 'empty') {
      return [h('div', { class: 'card', attrs: { style: 'text-align:center' } }, h('p', { class: 'muted', text: 'No settled games yet. Your stats show up once a game you played in has been counted and settled.' }))]
    }
    const tip = h('div', { class: 'tip', attrs: { role: 'status', hidden: '' } })
    const frame = h('div', { class: 'frame' }, tip)
    const paint = () => {
      frame.querySelector('svg')?.remove()
      frame.append(
        drawChart(v.points, frame.clientWidth || 320, {
          onPoint: (i, px, py) => {
            if (i === null) { tip.hidden = true; return }
            const p = v.points[i]
            const n = sideOfZero(p.net.cents)
            tip.replaceChildren(
              h('strong', { text: p.date }),
              h('div', { text: n === 'even' ? 'Broke even' : `${n === 'up' ? '▲ Won' : '▼ Lost'} ${formatCents(Math.abs(p.net.cents))}` }),
              h('div', { class: 'muted', text: `Balance ${p.running.display}` }))
            tip.hidden = false
            const flip = px > frame.clientWidth / 2
            tip.style.left = flip ? '' : `${px + 10}px`
            tip.style.right = flip ? `${frame.clientWidth - px + 10}px` : ''
            tip.style.top = `${Math.max(0, py - 24)}px`
          },
        })
      )
    }
    afterMount = () => {
      paint()
      let w = frame.clientWidth
      resizer = new ResizeObserver(() => {
        if (Math.abs(frame.clientWidth - w) > 1) { w = frame.clientWidth; paint() }
      })
      resizer.observe(frame)
    }
    const winRate = `${v.winRatePercent}% (${v.wins}/${v.games})`
    return [
      h('div', { class: 'card hero' },
        h('p', { class: 'label', text: 'Total net' }),
        h('div', { class: `n money-display ${tone(v.lifetime.cents)}`, text: signed(v.lifetime) }),
        h('p', { class: 'small muted', text: `over ${v.games} ${v.games === 1 ? 'game' : 'games'}` })),
      h('div', { class: 'card stack-sm' },
        label('Running balance'), frame,
        h('p', { class: 'small muted', text: 'Tap or hover a point for that game.' })),
      h('div', { class: 'stats-grid' },
        statBox('Average per game', v.average?.display ?? '—'),
        statBox('Win rate', winRate),
        statBox('Best game', v.best?.net.display ?? '—', v.best?.date),
        statBox('Worst game', v.worst?.net.display ?? '—', v.worst?.date),
        statBox('Current streak', v.streak.words),
        statBox('Total bought in', v.boughtIn?.display ?? '—'),
        statBox('Longest win streak', String(v.longestWin)),
        statBox('Longest lose streak', String(v.longestLoss))),
      h('ul', { class: 'sr-only' }, ...v.points.map((p) => h('li', { text: pointWords(p) }))),
    ]
  })
}

// ------------------------------------------------------------------- game

const toolFor = (a: 'join' | 'withdraw') => (a === 'join' ? 'join_game' : 'withdraw_from_game')

function gameScreen(r: Extract<Route, { s: 'game' }>): Node[] {
  const key = keyOf.game(r.id)
  return withData(key, () => load(key, 'get_game', { game_id: r.id }), (d) => {
    const v = gameCardView(d)
    if (!v) return [failed('That did not look like a game.', () => { cache.delete(key); render() })]
    tellModelAbout(v)
    return v.kind === 'card' ? scheduledGame(v) : startedGame(v)
  })
}

/** One line, so the chat knows what is on screen. No reply is triggered. */
function tellModelAbout(v: GameCardView) {
  if (contextFor === v.gameId) return
  contextFor = v.gameId
  const where = v.group && v.group !== v.title ? `${v.title} (${v.group})` : v.title
  app.updateModelContext({
    content: [{ type: 'text', text: `The user is looking at the game ${where}, game_id ${v.gameId}, in the Poker Ledger view.` }],
  }).catch(() => {})
}

function people(list: Person[], numbered: boolean) {
  return h('ul', { class: 'people' },
    ...list.map((p) =>
      h('li', { class: p.isMe ? 'me' : '' },
        numbered && p.position ? h('span', { class: 'muted', text: `${p.position}.` }) : null,
        h('span', { text: p.name }),
        p.isMe ? h('span', { class: 'you', text: 'you' }) : null)))
}

function scheduledGame(card: Card): Node[] {
  const mark = card.standing.kind === 'seated' ? '✓ ' : card.standing.kind === 'waitlisted' ? '… ' : '○ '
  return [
    h('div', { class: 'card stack-sm' },
      h('div', { class: 'row', attrs: { style: 'gap:8px;flex-wrap:wrap' } }, h('strong', { class: 'wrap', attrs: { style: 'font-size:17px' }, text: card.title }), chip('scheduled')),
      card.group && card.group !== card.title ? h('div', { class: 'muted', text: card.group }) : null,
      h('div', { class: 'row', attrs: { style: 'gap:8px;flex-wrap:wrap' } },
        h('span', { text: card.when }),
        card.timezone ? h('span', { class: 'small muted', text: card.timezone.replace('_', ' ') }) : null),
      card.location ? h('div', { class: 'wrap', text: card.location }) : null,
      h('div', { class: 'money', attrs: { style: 'font-weight:700' }, text: card.seats }),
      h('div', {}, h('span', { class: `status ${card.standing.kind}`, text: `${mark}${standingWords(card.standing)}` }))),
    ...actions(card),
    h('section', { class: 'stack-sm' },
      h('div', { class: 'label-row' }, label('Confirmed'), h('span', { class: 'small muted money', text: card.seats })),
      card.roster.length ? people(card.roster, false) : h('p', { class: 'muted', text: 'Nobody yet.' })),
    card.waitlist.length
      ? h('section', { class: 'stack-sm' }, label(`Waitlist (${card.waitlist.length})`), people(card.waitlist, true))
      : null,
  ].filter(Boolean) as Node[]
}

function actions(card: Card): Node[] {
  const out: Node[] = []
  if (phase.kind === 'working') {
    out.push(h('button', { class: 'btn', text: phase.label, attrs: { disabled: '' } }))
  } else if (phase.kind === 'confirm') {
    const p = phase
    out.push(h('div', { class: 'confirm stack-sm' },
      h('p', { text: p.text }),
      h('div', { class: 'btns' },
        h('button', { class: 'btn primary', attrs: { type: 'button' }, text: 'Confirm', on: { click: () => void confirm(card, p) } }),
        h('button', { class: 'btn', attrs: { type: 'button' }, text: 'Cancel', on: { click: () => { phase = { kind: 'idle' }; note = null; render() } } })),
      h('p', { class: 'small muted', text: 'Nothing has changed yet.' })))
  } else {
    const join = card.action === 'join'
    out.push(h('button', {
      class: join ? 'btn primary' : 'btn', attrs: { type: 'button' },
      text: join ? (card.seats.includes('over') || card.seats.includes('full') ? 'Join the waitlist' : 'Join game') : 'Withdraw',
      on: { click: () => void start(card) },
    }))
  }
  if (note) {
    out.push(h('div', { class: `note${note.error ? ' err' : ''}`, attrs: { role: 'status' } },
      h('div', { text: note.text }),
      note.detail ? h('div', { class: 'small muted', text: note.detail }) : null))
  }
  return out
}

/** First call, no token: the server says what would happen and changes nothing. */
async function start(card: Card) {
  note = null
  phase = { kind: 'working', label: card.action === 'join' ? 'Checking your spot…' : 'Checking…' }
  render()
  const step = stepOf(await call(toolFor(card.action), { game_id: card.gameId }))
  if (step.kind === 'preview') {
    phase = { kind: 'confirm', action: card.action, text: step.text, token: step.token }
  } else {
    phase = { kind: 'idle' }
    note = { text: step.message, error: step.kind === 'refused' }
    // "Already signed up" means the card was out of date; show the truth.
    if (step.kind === 'unchanged') await refreshGame(card.gameId)
  }
  render()
}

/** Second call, with the token the user just approved. */
async function confirm(card: Card, p: Extract<Phase, { kind: 'confirm' }>) {
  phase = { kind: 'working', label: 'Confirming…' }
  render()
  const step = stepOf(await call(toolFor(p.action), { game_id: card.gameId, confirmation_token: p.token }))
  phase = { kind: 'idle' }
  if (step.kind === 'done' || step.kind === 'unchanged') {
    note = { text: step.message, detail: step.kind === 'done' ? step.detail : null }
    await refreshGame(card.gameId)
    const c = cache.get(keyOf.game(card.gameId))
    const v = c?.ok ? gameCardView(c.data) : null
    if (step.kind === 'done' && v?.kind === 'card') {
      app.updateModelContext({
        content: [{
          type: 'text',
          text: contextLine({ action: p.action, title: v.title, group: v.group, message: step.message, seats: v.seats }),
        }],
      }).catch(() => {})
    }
  } else {
    note = { text: step.kind === 'refused' ? step.message : 'Something unexpected happened. Try again.', error: true }
    await refreshGame(card.gameId)
  }
  render()
}

/** The game, and every list that counted it, read again from the server. */
async function refreshGame(id: string) {
  for (const k of [...cache.keys()]) if (k.startsWith('games:')) cache.delete(k)
  const key = keyOf.game(id)
  const parsed = parseResult(await call('get_game', { game_id: id }))
  if (parsed.ok) cache.set(key, parsed)
}

function startedGame(v: Extract<GameCardView, { kind: 'summary' }>): Node[] {
  const settled = v.status === 'settled'
  return [
    h('div', { class: 'card stack-sm' },
      h('div', { class: 'row', attrs: { style: 'gap:8px;flex-wrap:wrap' } }, h('strong', { class: 'wrap', attrs: { style: 'font-size:17px' }, text: v.title }), chip(v.status, statusKind(v.status))),
      v.group && v.group !== v.title ? h('div', { class: 'muted', text: v.group }) : null,
      v.when ? h('div', { text: v.when }) : null,
      v.location ? h('div', { class: 'wrap', text: v.location }) : null,
      v.seats ? h('div', { class: 'small muted money', text: v.seats }) : null),
    v.status === 'cancelled' ? h('div', { class: 'banner', text: 'This game was cancelled.' }) : null,
    v.money
      ? h('section', { class: 'stack-sm' },
          h('div', { class: 'card', attrs: { style: 'text-align:center' } },
            h('p', { class: 'label', text: 'Pot' }),
            h('div', { class: 'money-display', attrs: { style: 'font-size:34px;margin-top:6px' }, text: v.money.pot.display })),
          label(settled ? 'Results' : 'Buy-ins'),
          ...v.money.players.map((p) =>
            h('div', { class: 'item' },
              h('div', { class: 'grow' },
                h('div', { class: 'wrap', attrs: { style: p.isMe ? 'font-weight:700' : '' }, text: p.isMe ? `${p.name} (you)` : p.name }),
                h('div', { class: 'small muted money', text: settled && p.cashedOut ? `in ${p.boughtIn.display} · out ${p.cashedOut.display}` : `in ${p.boughtIn.display}` })),
              p.net ? h('div', { class: 'right' }, money(p.net), h('div', { class: 'small muted', text: p.net.cents > 0 ? 'up' : p.net.cents < 0 ? 'down' : 'even' })) : null)),
          v.money.note ? h('p', { class: 'small muted', text: v.money.note }) : null)
      : null,
    v.transfers.length
      ? h('section', { class: 'stack-sm' },
          label('Who pays whom'),
          ...v.transfers.map((t) =>
            h('div', { class: 'item' },
              h('div', { class: 'grow' },
                h('div', { class: 'wrap', text: `${t.from} → ${t.to}` }),
                h('div', { class: 'small muted', text: `${t.kind === 'food' ? 'Food' : 'Poker'} · ${t.statusWords}` })),
              h('span', { class: 'money', text: t.amount.display }))))
      : null,
    h('p', { class: 'small muted', text: 'Games that have started are run in Poker Ledger.' }),
  ].filter(Boolean) as Node[]
}

// -------------------------------------------------------- results and debt

function balancesScreen(): Node[] {
  return withData('balances', () => load('balances', 'get_my_balances', {}), (d) => {
    const v = balancesView(d)
    if (v.games.length === 0) return [h('p', { class: 'muted', text: 'No settled games yet.' })]
    return [
      v.total
        ? h('div', { class: 'card hero' },
            h('p', { class: 'label', text: 'Total net' }),
            h('div', { class: `n money-display ${tone(v.total.cents)}`, text: signed(v.total) }),
            h('p', { class: 'small muted', text: `over ${v.games.length} ${v.games.length === 1 ? 'game' : 'games'}` }))
        : null,
      label('Newest first'),
      ...v.games.map((g) =>
        h('button', { class: 'item', attrs: { type: 'button' }, on: { click: () => go({ s: 'game', id: g.gameId }) } },
          h('div', { class: 'grow' },
            h('div', { class: 'wrap', text: g.title }),
            h('div', { class: 'small muted money', text: `${g.group} · in ${g.boughtIn.display}${g.cashedOut ? ` · out ${g.cashedOut.display}` : ''}` })),
          h('div', { class: 'right' }, money(g.net), h('div', { class: 'small muted', text: g.net.cents > 0 ? 'up' : g.net.cents < 0 ? 'down' : 'even' })))),
    ].filter(Boolean) as Node[]
  })
}

function debtScreen(): Node[] {
  return withData('debt', () => load('debt', 'get_outstanding_debt', {}), (d) => {
    const v = debtView(d)
    const line = (l: ReturnType<typeof debtView>['iOwe'][number], owe: boolean) =>
      h('button', { class: 'item', attrs: { type: 'button' }, on: { click: () => l.gameId && go({ s: 'game', id: l.gameId }) } },
        h('div', { class: 'grow' },
          h('div', { class: 'wrap', text: owe ? `You owe ${l.with}` : `${l.with} owes you` }),
          h('div', { class: 'small muted wrap', text: [l.kind === 'food' ? 'Food' : 'Poker', l.group, l.when, l.statusWords].filter(Boolean).join(' · ') })),
        h('span', { class: `money ${owe ? 'down' : 'up'}`, text: l.amount.display }))
    if (!v.iOwe.length && !v.owedToMe.length) {
      return [h('div', { class: 'card', attrs: { style: 'text-align:center' } }, h('p', { class: 'muted', text: 'All square. Nothing owed either way.' }))]
    }
    return [
      v.iOwe.length ? label('You owe') : null,
      ...v.iOwe.map((l) => line(l, true)),
      v.owedToMe.length ? label('Owed to you') : null,
      ...v.owedToMe.map((l) => line(l, false)),
      h('p', { class: 'small muted', text: 'Paying and confirming are done in Poker Ledger. No money moves through this view.' }),
    ].filter(Boolean) as Node[]
  })
}
