// The Poker Ledger view. One page, several screens, laid out as the app lays
// them out: your groups, a group's games, members and stats, one game, what
// you owe, your results. Moving between them is the page calling the same read
// tools an agent would, through the host, as you. Nothing here reaches the
// database, and the only thing it loads from the network is pictures.
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
  limitGames,
  membersView,
  parseResult,
  safeOrigin,
  SCREEN_OF_TOOL,
  sideOfZero,
  splitGames,
  statsView,
  stepOf,
  type GameCardView,
  type GameListItem,
  type Parsed,
  type Person,
  type ScreenKind,
  type Standing,
} from '@/lib/mcp/ui/shape'
import { formatCents } from '@/lib/money'
import { h, mount } from '../shared/dom'
import { startApp } from '../shared/host'
import { drawChart, pointWords } from './chart'
import { avatar, hostOf, label, liveTag, pictureProblems, reportPictureProblem, signed, statBox, stateBanner, tone } from './ui'

/**
 * Paint light whatever Claude's theme is, so it looks like the app by default.
 * Set to 'host' to follow Claude's light and dark instead; both palettes are
 * in styles.css.
 */
const THEME: 'light' | 'host' = 'light'

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
/** Groups whose full history is showing. Everyone starts on the latest few. */
const allHistory = new Set<string>()
let afterMount: (() => void) | null = null

const app = startApp('Poker Ledger', (result) => {
  const parsed = parseResult(result)
  const tool = (app.getHostContext() as { toolInfo?: { tool?: { name?: string } } } | undefined)?.toolInfo?.tool?.name
  const kind = parsed.ok ? kindOf(tool, parsed.data) : tool ? (SCREEN_OF_TOOL[tool] ?? null) : null
  void begin(kind, parsed)
}, (args) => {
  lastArgs = args
}, THEME === 'light' ? 'light' : undefined)

const top = () => stack[stack.length - 1]

// If the host blocks a picture, say which address and which rule, and what
// policy it set. Without this a blocked picture is a silent circle of initials.
document.addEventListener('securitypolicyviolation', (e) => {
  reportPictureProblem(`${e.effectiveDirective} blocked ${hostOf(e.blockedURI)}`, e.originalPolicy)
})
pictureProblems.listener = () => paintProblems()

function paintProblems() {
  document.getElementById('picture-problems')?.remove()
  if (!pictureProblems.list.length) return
  const policy = pictureProblems.policy ? ` Policy: ${pictureProblems.policy.slice(0, 320)}` : ''
  root.append(h('p', {
    class: 'small muted', attrs: { id: 'picture-problems', style: 'margin:12px 0 0;overflow-wrap:anywhere' },
    text: `Pictures not shown: ${pictureProblems.list.slice(0, 4).join('; ')}.${policy}`,
  }))
}

function kindOf(tool: string | undefined, data: Record<string, unknown>): ScreenKind | null {
  if (tool && SCREEN_OF_TOOL[tool]) return SCREEN_OF_TOOL[tool]
  if (Array.isArray(data.groups)) return 'groups'
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
  stats: (g: string) => `stats:${g}`,
  game: (id: string) => `game:${id}`,
  balances: 'balances',
  debt: 'debt',
}

/** Fetch once. A failure is kept too, so a screen shows it with a Try again
 *  button rather than asking the server again on every redraw. */
async function load(key: string, tool: string, args: Record<string, unknown>, force = false) {
  if (!force && cache.has(key)) return cache.get(key)!
  const parsed = parseResult(await call(tool, args))
  cache.set(key, parsed)
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
      // games and stats: both about one group, whose id the tool was given.
      if (!gid) gid = await groupIdByName(groupName)
      // show_group can be asked to open on Members, which it passes as its tab.
      const tab: Tab = kind === 'games' ? (lastArgs.tab === 'members' ? 'members' : 'games') : 'stats'
      if (gid) cache.set(kind === 'games' ? keyOf.games(gid) : keyOf.stats(gid), parsed)
      stack.push({ s: 'group', id: gid, name: groupName, tab })
    }
  }
  render()
}

async function groupIdByName(name: string): Promise<string> {
  if (!name) return ''
  const r = await load('groups', 'show_groups', {})
  if (!r.ok) return ''
  const hits = groupsView(r.data, r.ui).filter((g) => g.name === name)
  return hits.length === 1 ? hits[0].id : ''
}

// ------------------------------------------------------------ navigation

function reset() {
  phase = { kind: 'idle' }
  note = null
}
function go(route: Route) {
  stack.push(route)
  reset()
  render()
}
function back() {
  if (stack.length > 1) stack.pop()
  reset()
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

const gameView = (id: string) => {
  const c = cache.get(keyOf.game(id))
  return c?.ok ? gameCardView(c.data, c.ui) : null
}

function titleOf(r: Route): string {
  switch (r.s) {
    case 'groups': return 'Poker Ledger'
    case 'group': return r.name || 'Group'
    case 'balances': return 'My results'
    case 'debt': return 'Owed'
    case 'game': return gameView(r.id)?.title ?? 'Game'
  }
}

/** The small link above a title, as in the app: "← All groups", "← the group". */
function wayBack(r: Route): { label: string; run: () => void } | null {
  if (stack.length > 1) {
    const prev = stack[stack.length - 2]
    return { label: prev.s === 'groups' ? 'All groups' : titleOf(prev), run: back }
  }
  if (r.s === 'groups') return null
  if (r.s === 'game') {
    const v = gameView(r.id)
    if (v?.groupId) {
      const id = v.groupId
      return {
        label: v.group || 'Group',
        run: () => {
          stack.splice(0, stack.length, { s: 'groups' }, { s: 'group', id, name: v.group, tab: 'games' })
          reset()
          render()
        },
      }
    }
  }
  return {
    label: 'All groups',
    run: () => {
      stack.splice(0, stack.length, { s: 'groups' })
      reset()
      render()
    },
  }
}

function header(r: Route, sub: string | null) {
  const b = wayBack(r)
  return h('header', { class: 'head' },
    b ? h('button', { class: 'back', attrs: { type: 'button' }, text: `← ${b.label}`, on: { click: b.run } }) : null,
    h('h1', { text: titleOf(r) }),
    sub ? h('p', { class: 'sub', text: sub }) : null)
}

function shell(r: Route, body: Node[], webUrl: string | null, sub: string | null) {
  return [
    header(r, sub),
    h('div', { class: 'stack fade' }, ...body),
    webUrl
      ? h('div', { class: 'footer' },
          h('button', { class: 'btn ghost sm', attrs: { type: 'button' }, on: { click: () => void openOnWeb(webUrl) } }, 'Open in Poker Ledger ↗'))
      : null,
    note && r.s !== 'game'
      ? h('div', { class: `note${note.error ? ' err' : ''}`, attrs: { role: 'status', style: 'margin-top:12px' } }, note.text)
      : null,
  ]
}

function loading(text = 'Loading…') {
  return h('p', { class: 'muted', text })
}

function failed(message: string, retry: () => void) {
  return h('div', { class: 'sect' },
    h('div', { class: 'note err', text: message, attrs: { role: 'status' } }),
    h('button', { class: 'btn block', attrs: { type: 'button' }, on: { click: retry } }, 'Try again'))
}

/** Show a screen's data, fetching it first if it is not here yet. */
function withData(key: string, fetcher: () => Promise<Parsed>, show: (p: Extract<Parsed, { ok: true }>) => Node[]): Node[] {
  const got = cache.get(key)
  if (got) {
    return got.ok ? show(got) : [failed(got.message, () => { cache.delete(key); render() })]
  }
  if (!inflight.has(key)) {
    inflight.add(key)
    void fetcher().then((r) => {
      inflight.delete(key)
      cache.set(key, r)
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
  let sub: string | null = null
  switch (r.s) {
    case 'groups':
      nodes = groupsScreen()
      break
    case 'group':
      nodes = groupScreen(r)
      web = appLink(origin, { group: r.id })
      break
    case 'game': {
      nodes = gameScreen(r)
      web = appLink(origin, { game: r.id })
      const v = gameView(r.id)
      sub = v ? [v.when, v.location].filter(Boolean).join(' · ') : null
      break
    }
    case 'balances':
      nodes = balancesScreen()
      break
    case 'debt':
      nodes = debtScreen()
      break
  }
  mount(root, ...shell(r, nodes, web, sub))
  paintProblems()
  afterMount?.()
  afterMount = null
}

// ----------------------------------------------------------------- groups

function groupsScreen(): Node[] {
  return withData('groups', () => load('groups', 'show_groups', {}), (p) => {
    const groups = groupsView(p.data, p.ui)
    if (groups.length === 0) {
      return [h('div', { class: 'card sect' },
        h('strong', { text: 'Start with a group' }),
        h('p', { class: 'muted', attrs: { style: 'margin:0' }, text: 'A group is the crew you play with. Create or join one in Poker Ledger, then it shows up here.' }))]
    }
    return [
      h('section', { class: 'sect', attrs: { style: 'gap:12px' } },
        label('Your groups'),
        ...groups.map((g) => {
          const count = g.members
          return h('button', {
            class: 'card', attrs: { type: 'button', style: '--py:16px' },
            on: { click: () => go({ s: 'group', id: g.id, name: g.name, tab: 'games' }) },
          },
            h('div', { class: 'row between', attrs: { style: 'gap:12px' } },
              h('div', { class: 'row grow', attrs: { style: 'gap:12px' } },
                avatar(g.name, g.id, g.avatar, 44),
                h('div', { class: 'grow' },
                  h('div', { class: 'trunc', text: g.name, attrs: { style: 'font-size:15.2px;font-weight:500' } }),
                  count === null ? null : h('div', { class: 'small muted money', text: `${count} ${count === 1 ? 'member' : 'members'}` }))),
              g.lifetime
                ? h('div', { class: 'right', attrs: { style: 'display:flex;flex-direction:column;align-items:flex-end' } },
                    h('div', { class: `money-display ${tone(g.lifetime.cents)}`, text: signed(g.lifetime), attrs: { style: 'font-size:24px' } }),
                    h('div', { class: 'label', text: 'lifetime', attrs: { style: 'letter-spacing:0.06em;font-size:11.2px' } }))
                : null))
        })),
      h('section', { class: 'sect' },
        label('You'),
        h('button', { class: 'item', attrs: { type: 'button' }, on: { click: () => go({ s: 'debt' }) } },
          h('span', { text: 'What you owe and are owed' }), h('span', { class: 'muted', text: '›' })),
        h('button', { class: 'item', attrs: { type: 'button' }, on: { click: () => go({ s: 'balances' }) } },
          h('span', { text: 'My results, game by game' }), h('span', { class: 'muted', text: '›' }))),
    ]
  })
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
        on: { click: () => { r.tab = t; reset(); render() } },
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

/** A game in "Happening now": name, when and where, the live tag, and the seats. */
function liveRow(g: GameListItem) {
  return h('button', {
    class: `card${g.status === 'active' ? ' live' : ''}`, attrs: { type: 'button', style: '--py:14px' },
    on: { click: () => go({ s: 'game', id: g.id }) },
  },
    h('div', { class: 'row between', attrs: { style: 'gap:12px' } },
      h('div', { class: 'grow' },
        h('div', { class: 'trunc', text: g.title, attrs: { style: 'font-size:14px;font-weight:500' } }),
        h('div', { class: 'trunc small muted', text: [g.when, g.location].filter(Boolean).join(' · ') })),
      h('div', { class: 'right', attrs: { style: 'display:flex;flex-direction:column;align-items:flex-end;gap:4px' } },
        liveTag(g.status),
        h('span', { class: 'small muted money', text: `${g.seatsTaken}/${g.seatLimit} seats` }))))
}

/** A game in "History": the night, who played and the pot, and my result. */
function historyRow(g: GameListItem) {
  const sub = [g.players === null ? null : `${g.players} ${g.players === 1 ? 'player' : 'players'}`, g.pot ? `${g.pot.display} pot` : null, g.status === 'cancelled' ? 'cancelled' : null]
    .filter(Boolean).join(' · ')
  return h('button', {
    class: 'card', attrs: { type: 'button', style: '--py:14px' },
    on: { click: () => go({ s: 'game', id: g.id }) },
  },
    h('div', { class: 'row between', attrs: { style: 'gap:12px' } },
      h('div', { class: 'grow' },
        h('div', { text: g.day }),
        sub ? h('div', { class: 'trunc small muted money', text: sub }) : null),
      g.status === 'settled' && g.myNet
        ? h('span', { class: `money-display right ${tone(g.myNet.cents)}`, text: signed(g.myNet), attrs: { style: 'font-size:20px' } })
        : null))
}

function gamesTab(r: Extract<Route, { s: 'group' }>): Node[] {
  return withData(keyOf.games(r.id), () => load(keyOf.games(r.id), 'show_group', { group_id: r.id }), (p) => {
    const v = gamesView(p.data, p.ui)
    const { live, past } = splitGames(v.games)
    const expanded = allHistory.has(r.id)
    const { shown, hidden } = limitGames(past, expanded)
    return [
      live.length
        ? h('section', { class: 'sect' }, label('Happening now'), ...live.map(liveRow))
        : null,
      h('section', { class: 'sect' },
        label('History'),
        past.length === 0 ? h('p', { class: 'muted', attrs: { style: 'margin:0' }, text: 'No finished games yet.' }) : null,
        ...shown.map(historyRow),
        hidden > 0
          ? h('button', { class: 'btn block', attrs: { type: 'button' }, text: `Show all ${past.length} games`, on: { click: () => { allHistory.add(r.id); render() } } })
          : expanded && past.length > 6
            ? h('button', { class: 'btn block', attrs: { type: 'button' }, text: 'Show fewer', on: { click: () => { allHistory.delete(r.id); render() } } })
            : null),
      v.note ? h('p', { class: 'small muted', text: v.note }) : null,
    ].filter(Boolean) as Node[]
  })
}

/** The members come with the group screen, so this is the same data as Games. */
function membersTab(r: Extract<Route, { s: 'group' }>): Node[] {
  return withData(keyOf.games(r.id), () => load(keyOf.games(r.id), 'show_group', { group_id: r.id }), (p) => {
    const members = membersView(p.ui)
    return [
      h('section', { class: 'sect' },
        label(`Members (${members.length})`),
        ...members.map((m) =>
          h('div', { class: 'card', attrs: { style: '--py:12px' } },
            h('div', { class: 'row', attrs: { style: 'gap:12px' } },
              avatar(m.name, m.faceId, m.avatar, 40),
              h('div', { class: 'grow trunc', attrs: { style: 'font-weight:500' } },
                h('span', { text: m.name }),
                m.isMe ? h('span', { class: 'muted', text: ' (you)', attrs: { style: 'font-weight:400' } }) : null))))),
    ]
  })
}

function statsTab(r: Extract<Route, { s: 'group' }>): Node[] {
  return withData(keyOf.stats(r.id), () => load(keyOf.stats(r.id), 'show_my_stats', { group_id: r.id }), (p) => {
    const v = statsView(p.data)
    if (v.kind === 'empty') {
      return [h('div', { class: 'card center', attrs: { style: '--py:8px' } }, h('p', { class: 'muted', text: 'No settled games yet. Your stats show up once a game you played in has been counted and settled.' }))]
    }
    const tip = h('div', { class: 'tip', attrs: { role: 'status', hidden: '' } })
    const frame = h('div', { class: 'frame' }, tip)
    const paint = () => {
      frame.querySelector('svg')?.remove()
      frame.append(
        drawChart(v.points, frame.clientWidth || 320, {
          onPoint: (i, px, py) => {
            if (i === null) { tip.hidden = true; return }
            const pt = v.points[i]
            const n = sideOfZero(pt.net.cents)
            tip.replaceChildren(
              h('strong', { text: pt.date }),
              h('div', { text: n === 'even' ? 'Broke even' : `${n === 'up' ? '▲ Won' : '▼ Lost'} ${formatCents(Math.abs(pt.net.cents))}` }),
              h('div', { class: 'muted', text: `Balance ${pt.running.display}` }))
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
    const last = v.points[v.points.length - 1]?.running ?? v.lifetime
    return [
      h('div', { class: 'card center', attrs: { style: '--py:24px' } },
        h('p', { class: 'label', text: 'Total net' }),
        h('div', { class: `money-display ${tone(v.lifetime.cents)}`, text: signed(v.lifetime), attrs: { style: 'font-size:52px;margin:6px 0' } }),
        h('p', { class: 'small muted', attrs: { style: 'margin:0' }, text: `over ${v.games} ${v.games === 1 ? 'game' : 'games'}` })),
      h('div', { class: 'stats-grid' },
        statBox('Average per game', v.average?.display ?? '—'),
        statBox('Win rate', `${v.winRatePercent}% (${v.wins}/${v.games})`),
        statBox('Best game', v.best?.net.display ?? '—', v.best?.date),
        statBox('Worst game', v.worst?.net.display ?? '—', v.worst?.date),
        statBox('Current streak', v.streak.words),
        statBox('Total bought in', v.boughtIn?.display ?? '—'),
        statBox('Longest win streak', String(v.longestWin)),
        statBox('Longest lose streak', String(v.longestLoss))),
      v.points.length > 1
        ? h('div', { class: 'stat', attrs: { style: 'padding:12px' } },
            h('div', { class: 'label-row' },
              label('Running balance'),
              h('span', { class: `money ${tone(last.cents)}`, text: last.display, attrs: { style: 'font-size:14px;font-weight:600' } })),
            frame,
            h('p', { class: 'small muted', attrs: { style: 'margin:4px 0 0' }, text: 'Tap or hover a point for that game.' }))
        : null,
      h('ul', { class: 'sr-only' }, ...v.points.map((pt) => h('li', { text: pointWords(pt) }))),
    ].filter(Boolean) as Node[]
  })
}

// ------------------------------------------------------------------- game

const toolFor = (a: 'join' | 'withdraw') => (a === 'join' ? 'join_game' : 'withdraw_from_game')

function gameScreen(r: Extract<Route, { s: 'game' }>): Node[] {
  const key = keyOf.game(r.id)
  return withData(key, () => load(key, 'show_game', { game_id: r.id }), (p) => {
    const v = gameCardView(p.data, p.ui)
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

const seatLine = (p: Person) => [
  p.name,
  p.isMe ? h('span', { class: 'muted', text: ' (you)' }) : null,
]

function personRow(p: Person) {
  return h('div', { class: 'item' },
    h('span', { class: 'row grow', attrs: { style: 'gap:10px' } },
      avatar(p.name, p.faceId, p.avatar, 32),
      h('span', { class: 'trunc' }, ...seatLine(p))))
}

function standingText(s: Standing): string {
  return s.kind === 'seated' ? 'You’re in' : s.kind === 'waitlisted' ? `Waitlist #${s.position}` : 'Not signed up'
}

function scheduledGame(card: Card): Node[] {
  const detail = card.stakes ? `${card.stakes.buyin.display} = ${card.stakes.chips} chips` : ''
  return [
    stateBanner('scheduled', card.overdue, detail),
    ...statusCard(card),
    h('section', { class: 'sect' },
      h('div', { class: 'label-row' }, label('Confirmed'), h('span', { class: 'small muted money', text: card.seats })),
      ...(card.roster.length ? card.roster.map(personRow) : [h('p', { class: 'muted', attrs: { style: 'margin:0' }, text: 'Nobody yet.' })])),
    card.waitlist.length
      ? h('section', { class: 'sect' },
          label(`Waitlist (${card.waitlist.length})`),
          ...card.waitlist.map((p, i) =>
            h('div', { class: 'card', attrs: { style: '--py:10px' } },
              h('div', { class: 'row between' },
                h('span', {}, ...seatLine(p)),
                h('span', { class: 'num money', text: String(p.position ?? i + 1) })))))
      : null,
  ].filter(Boolean) as Node[]
}

/** "You're in" or "Not signed up", with the one button that fits; the preview and Confirm open under it. */
function statusCard(card: Card): Node[] {
  const out: Node[] = []
  const join = card.action === 'join'
  const button =
    phase.kind === 'working'
      ? h('button', { class: 'btn sm', text: phase.label, attrs: { disabled: '', type: 'button' } })
      : phase.kind === 'confirm'
        ? null
        : h('button', {
            class: `btn sm${join ? ' primary' : ''}`, attrs: { type: 'button' },
            text: join ? (card.seats.includes('over') || card.seats.includes('full') ? 'Join waitlist' : 'I’m in') : 'Withdraw',
            on: { click: () => void start(card) },
          })
  out.push(h('div', { class: 'card', attrs: { style: '--py:12px' } },
    h('div', { class: 'row between' },
      h('span', { text: standingText(card.standing), attrs: { style: 'font-weight:500' } }),
      button)))
  if (phase.kind === 'confirm') {
    const p = phase
    out.push(h('div', { class: 'confirm sect' },
      h('p', { text: p.text }),
      h('div', { class: 'btns' },
        h('button', { class: 'btn primary', attrs: { type: 'button' }, text: 'Confirm', on: { click: () => void confirm(card, p) } }),
        h('button', { class: 'btn', attrs: { type: 'button' }, text: 'Cancel', on: { click: () => { reset(); render() } } })),
      h('p', { class: 'small muted', text: 'Nothing has changed yet.' })))
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
  phase = { kind: 'working', label: 'Checking…' }
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
    const v = gameView(card.gameId)
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
  const parsed = parseResult(await call('show_game', { game_id: id }))
  if (parsed.ok) cache.set(keyOf.game(id), parsed)
}

// "not paid yet" contains "paid", so the waiting state is checked first.
const transferGlyph = (words: string) =>
  /not paid|pending/i.test(words) ? '○'
  : /confirmed|closed/i.test(words) ? '✓'
  : /deferred/i.test(words) ? '»'
  : /paid/i.test(words) ? '◐'
  : '○'

function startedGame(v: Extract<GameCardView, { kind: 'summary' }>): Node[] {
  const settled = v.status === 'settled'
  const m = v.money
  const admin = v.transfers.some((t) => t.myPart === 'bystander')
  return [
    stateBanner(v.status, false, ''),
    m && settled
      ? h('div', { class: 'stat', attrs: { style: 'display:flex;align-items:flex-end;justify-content:space-between;gap:12px;padding:14px 16px' } },
          h('span', { class: 'label', text: 'Total pot' }),
          h('span', { class: 'money-display', text: m.pot.display, attrs: { style: 'font-size:36px' } }))
      : null,
    m && settled
      ? h('section', { class: 'sect' },
          label('Results'),
          h('div', { class: 'scroll-x' },
            h('table', { class: 'results' },
              h('thead', {}, h('tr', {},
                h('th', { text: 'Player' }), h('th', { class: 'r', text: 'In' }), h('th', { class: 'r', text: 'Out' }), h('th', { class: 'r', text: 'Net' }))),
              h('tbody', {}, ...m.players.map((p) =>
                h('tr', {},
                  h('td', {}, p.name, p.isMe ? h('span', { class: 'muted', text: ' (you)' }) : null),
                  h('td', { class: 'r money muted', text: p.boughtIn.display }),
                  h('td', { class: 'r money muted', text: p.cashedOut ? p.cashedOut.display : '—' }),
                  h('td', { class: `r net money-display ${p.net ? tone(p.net.cents) : ''}`, text: p.net ? signed(p.net) : '—' })))))))
      : m
        ? h('section', { class: 'sect' },
            label(`Confirmed (${m.players.length})`),
            ...m.players.map((p) =>
              h('div', { class: 'item' },
                h('span', { class: 'row grow', attrs: { style: 'gap:10px' } },
                  avatar(p.name, p.faceId, p.avatar, 32),
                  h('span', { class: 'trunc' }, ...seatLine(p))),
                h('span', { class: 'small muted money', text: `in ${p.boughtIn.display}` }))),
            h('div', { class: 'row between' }, h('span', { class: 'small muted', text: 'Pot' }), h('span', { class: 'money', text: m.pot.display })))
        : null,
    v.transfers.length
      ? h('section', { class: 'sect' },
          label(admin ? 'Who pays who' : 'Your settlements'),
          ...v.transfers.map((t) =>
            h('div', { class: 'card', attrs: { style: '--py:12px' } },
              h('div', { class: 'row between', attrs: { style: 'gap:12px' } },
                h('div', { class: 'grow' },
                  h('div', { class: 'wrap', text: `${t.from} → ${t.to}`, attrs: { style: 'font-size:16px' } }),
                  h('div', { class: 'small muted', text: `${transferGlyph(t.statusWords)} ${t.kind === 'food' ? 'Food' : 'Poker'} · ${t.statusWords}` })),
                h('span', { class: 'money right', text: t.amount.display, attrs: { style: 'font-size:16px;font-weight:600' } })))))
      : null,
    h('p', { class: 'small muted', attrs: { style: 'margin:0' }, text: 'Games that have started are run in Poker Ledger.' }),
  ].filter(Boolean) as Node[]
}

// -------------------------------------------------------- results and debt

function balancesScreen(): Node[] {
  return withData('balances', () => load('balances', 'show_balances', {}), (p) => {
    const v = balancesView(p.data)
    if (v.games.length === 0) return [h('p', { class: 'muted', text: 'No settled games yet.' })]
    return [
      v.total
        ? h('div', { class: 'card center', attrs: { style: '--py:24px' } },
            h('p', { class: 'label', text: 'Total net' }),
            h('div', { class: `money-display ${tone(v.total.cents)}`, text: signed(v.total), attrs: { style: 'font-size:52px;margin:6px 0' } }),
            h('p', { class: 'small muted', attrs: { style: 'margin:0' }, text: `over ${v.games.length} ${v.games.length === 1 ? 'game' : 'games'}` }))
        : null,
      h('section', { class: 'sect' },
        label('Newest first'),
        ...v.games.map((g) =>
          h('button', { class: 'card', attrs: { type: 'button', style: '--py:14px' }, on: { click: () => go({ s: 'game', id: g.gameId }) } },
            h('div', { class: 'row between', attrs: { style: 'gap:12px' } },
              h('div', { class: 'grow' },
                h('div', { class: 'wrap', text: g.title }),
                h('div', { class: 'small muted money', text: `${g.group} · in ${g.boughtIn.display}${g.cashedOut ? ` · out ${g.cashedOut.display}` : ''}` })),
              h('span', { class: `money-display right ${tone(g.net.cents)}`, text: signed(g.net), attrs: { style: 'font-size:20px' } }))))),
    ].filter(Boolean) as Node[]
  })
}

function debtScreen(): Node[] {
  return withData('debt', () => load('debt', 'show_outstanding_debt', {}), (p) => {
    const v = debtView(p.data)
    const line = (l: ReturnType<typeof debtView>['iOwe'][number], owe: boolean) =>
      h('button', { class: 'card', attrs: { type: 'button', style: '--py:12px' }, on: { click: () => l.gameId && go({ s: 'game', id: l.gameId }) } },
        h('div', { class: 'row between', attrs: { style: 'gap:12px' } },
          h('div', { class: 'grow' },
            h('div', { class: 'wrap', text: owe ? `You owe ${l.with}` : `${l.with} owes you` }),
            h('div', { class: 'small muted wrap', text: [l.kind === 'food' ? 'Food' : 'Poker', l.group, l.when, l.statusWords].filter(Boolean).join(' · ') })),
          h('span', { class: `money right ${owe ? 'down' : 'up'}`, text: l.amount.display, attrs: { style: 'font-weight:600' } })))
    if (!v.iOwe.length && !v.owedToMe.length) {
      return [h('div', { class: 'card center' }, h('p', { class: 'muted', attrs: { style: 'margin:0' }, text: 'All square. Nothing owed either way.' }))]
    }
    return [
      v.iOwe.length ? h('section', { class: 'sect' }, label('You owe'), ...v.iOwe.map((l) => line(l, true))) : null,
      v.owedToMe.length ? h('section', { class: 'sect' }, label('Owed to you'), ...v.owedToMe.map((l) => line(l, false))) : null,
      h('p', { class: 'small muted', attrs: { style: 'margin:0' }, text: 'Paying and confirming are done in Poker Ledger. No money moves through this view.' }),
    ].filter(Boolean) as Node[]
  })
}
