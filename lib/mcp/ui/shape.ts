// What the widgets draw, worked out from the text a tool already returns.
//
// The widgets get their data only from tool results, so this reads the same
// JSON an agent reads and turns it into the few things a screen needs. Every
// number and every time string is passed through from the server; nothing is
// recomputed here, so there is no second copy of the money or time rules.
//
// Pure, like the rest of lib/: no Supabase, no Next, no React, no DOM.

type Money = { cents: number; display: string }
type Moment = { iso: string; local: string; timezone: string }

export type ToolResultLike = {
  isError?: boolean
  content?: { type: string; text?: string }[]
}

export type Parsed =
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; message: string }

const UNREADABLE = 'Poker Ledger sent something this view could not read.'

/** The tool's text result as an object, or the sentence to show instead. */
export function parseResult(result: ToolResultLike | null | undefined): Parsed {
  const text = result?.content?.find((c) => c.type === 'text')?.text
  if (result?.isError) return { ok: false, message: text || UNREADABLE }
  if (!text) return { ok: false, message: UNREADABLE }
  try {
    const data: unknown = JSON.parse(text)
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      return { ok: true, data: data as Record<string, unknown> }
    }
  } catch {
    // fall through
  }
  return { ok: false, message: UNREADABLE }
}

const isMoney = (v: unknown): v is Money =>
  !!v &&
  typeof v === 'object' &&
  Number.isInteger((v as Money).cents) &&
  typeof (v as Money).display === 'string'

// ---------------------------------------------------------------- stats

export type StatsPoint = {
  gameId: string
  date: string
  net: Money
  running: Money
}

export type StatsView =
  | { kind: 'empty'; message: string }
  | {
      kind: 'chart'
      group: string
      lifetime: Money
      games: number
      /** Whole percent, for display. */
      winRatePercent: number
      streak: { kind: 'win' | 'loss' | 'none'; length: number; words: string }
      points: StatsPoint[]
      average: Money | null
      boughtIn: Money | null
      wins: number
      losses: number
      best: { net: Money; date: string } | null
      worst: { net: Money; date: string } | null
      longestWin: number
      longestLoss: number
    }

export function streakWords(kind: 'win' | 'loss' | 'none', length: number): string {
  if (kind === 'none' || length <= 0) return 'No streak'
  return `${length} ${kind === 'win' ? 'win' : 'loss'}${length === 1 ? '' : kind === 'win' ? 's' : 'es'} in a row`
}

export function statsView(data: Record<string, unknown>): StatsView {
  const perGame = Array.isArray(data.per_game) ? data.per_game : []
  if (!data.games_played || perGame.length === 0) {
    return {
      kind: 'empty',
      message:
        typeof data.message === 'string' ? data.message : 'No settled games yet.',
    }
  }

  const points: StatsPoint[] = []
  for (const p of perGame as Record<string, unknown>[]) {
    const played = p.played_at as Moment | undefined
    if (!isMoney(p.net) || !isMoney(p.running_net) || !played) continue
    points.push({
      gameId: String(p.game_id),
      date: played.local,
      net: p.net,
      running: p.running_net,
    })
  }

  const s = data.current_streak as { kind?: string; length?: number } | undefined
  const kind = s?.kind === 'win' || s?.kind === 'loss' ? s.kind : 'none'
  const length = typeof s?.length === 'number' ? s.length : 0

  return {
    kind: 'chart',
    group: typeof data.group === 'string' ? data.group : '',
    lifetime: isMoney(data.lifetime_net)
      ? data.lifetime_net
      : (points.at(-1)?.running ?? { cents: 0, display: '$0' }),
    games: Number(data.games_played),
    winRatePercent: Math.round(Number(data.win_rate ?? 0) * 100),
    streak: { kind, length, words: streakWords(kind, length) },
    points,
    average: isMoney(data.average_net_per_game) ? data.average_net_per_game : null,
    boughtIn: isMoney(data.total_bought_in) ? data.total_bought_in : null,
    wins: Number(data.wins ?? 0),
    losses: Number(data.losses ?? 0),
    best: extreme(data.biggest_win),
    worst: extreme(data.biggest_loss),
    longestWin: Number(data.longest_win_streak ?? 0),
    longestLoss: Number(data.longest_loss_streak ?? 0),
  }
}

function extreme(raw: unknown): { net: Money; date: string } | null {
  const g = raw as { net?: unknown; played_at?: Moment } | null
  return g && isMoney(g.net) && g.played_at ? { net: g.net, date: g.played_at.local } : null
}

/** One word for a point, so above or below zero never rests on colour. */
export function sideOfZero(cents: number): 'up' | 'down' | 'even' {
  return cents > 0 ? 'up' : cents < 0 ? 'down' : 'even'
}

// ------------------------------------------------------------ game card

export type Standing =
  | { kind: 'seated' }
  | { kind: 'waitlisted'; position: number }
  | { kind: 'none' }

export type Person = { name: string; isMe: boolean; position?: number }

export type GameMoney = {
  pot: Money
  note: string
  players: {
    name: string
    isMe: boolean
    boughtIn: Money
    cashedOut: Money | null
    net: Money | null
  }[]
}

export type GameTransfer = {
  kind: string
  from: string
  to: string
  amount: Money
  statusWords: string
  myPart: string
}

export type GameCardView =
  | {
      kind: 'card'
      gameId: string
      title: string
      group: string
      when: string
      timezone: string
      location: string | null
      seats: string
      roster: Person[]
      waitlist: Person[]
      standing: Standing
      /** Which action the button offers. */
      action: 'join' | 'withdraw'
    }
  | {
      kind: 'summary'
      gameId: string
      title: string
      group: string
      status: string
      when: string
      seats: string
      location: string | null
      /** Only once the game has started; a scheduled game has none. */
      money: GameMoney | null
      transfers: GameTransfer[]
    }

export function gameCardView(data: Record<string, unknown>): GameCardView | null {
  if (typeof data.game_id !== 'string') return null
  const sched = data.scheduled_at as Moment | undefined
  const played = (data.played_at as Moment | undefined) ?? sched
  const seats = (data.seats as { summary?: string } | undefined)?.summary ?? ''
  const group = typeof data.group === 'string' ? data.group : ''
  const title =
    typeof data.name === 'string' && data.name ? data.name : group || 'Game'
  const status = String(data.status ?? '')

  if (status !== 'scheduled') {
    return {
      kind: 'summary',
      gameId: data.game_id,
      title,
      group,
      status,
      when: played?.local ?? '',
      seats,
      location: typeof data.location === 'string' && data.location ? data.location : null,
      money: moneyOf(data.money),
      transfers: transfersOf(data.settlements),
    }
  }

  const people = (list: unknown): Person[] =>
    (Array.isArray(list) ? list : []).map((p: Record<string, unknown>) => ({
      name: String(p.name ?? ''),
      isMe: p.is_me === true,
      ...(typeof p.position === 'number' ? { position: p.position } : {}),
    }))
  const roster = people(data.roster)
  const waitlist = people(data.waitlist)

  const myWait = waitlist.find((p) => p.isMe)
  const standing: Standing = roster.some((p) => p.isMe)
    ? { kind: 'seated' }
    : myWait
      ? { kind: 'waitlisted', position: myWait.position ?? 0 }
      : { kind: 'none' }

  return {
    kind: 'card',
    gameId: data.game_id,
    title,
    group,
    when: sched?.local ?? '',
    timezone: sched?.timezone ?? '',
    location: typeof data.location === 'string' && data.location ? data.location : null,
    seats,
    roster,
    waitlist,
    standing,
    action: standing.kind === 'none' ? 'join' : 'withdraw',
  }
}

function moneyOf(raw: unknown): GameMoney | null {
  const m = raw as Record<string, unknown> | null
  if (!m || !isMoney(m.pot) || !Array.isArray(m.players)) return null
  return {
    pot: m.pot,
    note: typeof m.note === 'string' ? m.note : '',
    players: (m.players as Record<string, unknown>[]).map((p) => ({
      name: String(p.name ?? ''),
      isMe: p.is_me === true,
      boughtIn: isMoney(p.bought_in) ? p.bought_in : { cents: 0, display: '$0' },
      cashedOut: isMoney(p.cashed_out) ? p.cashed_out : null,
      net: isMoney(p.net) ? p.net : null,
    })),
  }
}

function transfersOf(raw: unknown): GameTransfer[] {
  return (Array.isArray(raw) ? raw : []).flatMap((t: Record<string, unknown>) =>
    isMoney(t.amount)
      ? [
          {
            kind: String(t.kind ?? 'poker'),
            from: String(t.from ?? ''),
            to: String(t.to ?? ''),
            amount: t.amount,
            statusWords: String(t.status_words ?? ''),
            myPart: String(t.my_part ?? ''),
          },
        ]
      : []
  )
}

export function standingWords(s: Standing): string {
  switch (s.kind) {
    case 'seated':
      return "You're seated"
    case 'waitlisted':
      return `You're on the waitlist, #${s.position}`
    case 'none':
      return "You're not signed up"
  }
}

// ------------------------------------------------------- join / withdraw

export type Step =
  | { kind: 'preview'; text: string; token: string }
  | { kind: 'done'; message: string; detail: string | null }
  | { kind: 'unchanged'; message: string }
  | { kind: 'refused'; message: string }

/** What a join or withdraw call came back with, in the three ways it can. */
export function stepOf(result: ToolResultLike): Step {
  const parsed = parseResult(result)
  if (!parsed.ok) return { kind: 'refused', message: parsed.message }
  const d = parsed.data
  if (d.needs_confirmation === true) {
    if (typeof d.preview === 'string' && typeof d.confirmation_token === 'string') {
      return { kind: 'preview', text: d.preview, token: d.confirmation_token }
    }
    return { kind: 'refused', message: UNREADABLE }
  }
  const message = typeof d.message === 'string' ? d.message : ''
  if (d.changed === true) {
    return {
      kind: 'done',
      message: message || 'Done.',
      detail: typeof d.detail === 'string' ? d.detail : null,
    }
  }
  // "Already signed up" and its kind: nothing changed, and that is the answer.
  return { kind: 'unchanged', message: message || 'Nothing changed.' }
}

/** One line for the model, so the conversation knows what the click did. */
export function contextLine(args: {
  action: 'join' | 'withdraw'
  title: string
  group: string
  message: string
  seats: string
}): string {
  const verb = args.action === 'join' ? 'joined' : 'withdrew from'
  const where = args.group && args.group !== args.title ? `${args.title} (${args.group})` : args.title
  return `The user ${verb} ${where} from the game card and confirmed it themselves. Result: ${args.message} Seats now: ${args.seats}.`
}

// ------------------------------------------------------- the app's screens
//
// The same tool results, shaped for the screens a player moves between:
// groups, a group's games and members, what I owe, what I ended with.

export type GroupItem = { id: string; name: string; role: string; timezone: string }

export function groupsView(data: Record<string, unknown>): GroupItem[] {
  return (Array.isArray(data.groups) ? data.groups : []).flatMap(
    (g: Record<string, unknown>) =>
      typeof g.group_id === 'string'
        ? [{ id: g.group_id, name: String(g.name ?? ''), role: String(g.my_role ?? ''), timezone: String(g.timezone ?? '') }]
        : []
  )
}

export type GameListItem = {
  id: string
  title: string
  when: string
  status: string
  location: string | null
  seats: string
  standing: Standing
}

export function gamesView(data: Record<string, unknown>): {
  group: string
  games: GameListItem[]
  note: string | null
} {
  const games = (Array.isArray(data.games) ? data.games : []).flatMap(
    (g: Record<string, unknown>): GameListItem[] => {
      if (typeof g.game_id !== 'string') return []
      const when = (g.played_at as Moment | undefined)?.local ?? ''
      const iAm = g.i_am
      const pos = typeof g.waitlist_position === 'number' ? g.waitlist_position : 0
      return [
        {
          id: g.game_id,
          title: typeof g.name === 'string' && g.name ? g.name : when,
          when,
          status: String(g.status ?? ''),
          location: typeof g.location === 'string' && g.location ? g.location : null,
          seats: (g.seats as { summary?: string } | undefined)?.summary ?? '',
          standing:
            iAm === 'seated'
              ? { kind: 'seated' }
              : iAm === 'waitlisted'
                ? { kind: 'waitlisted', position: pos }
                : { kind: 'none' },
        },
      ]
    }
  )
  return {
    group: typeof data.group === 'string' ? data.group : '',
    games,
    note: typeof data.note === 'string' ? data.note : null,
  }
}

/** How many games a group's list shows before "Show all". */
export const GAMES_SHOWN = 5

/**
 * The games to draw. The server returns them newest first, so the first few
 * are the most recent. A list only just over the limit is shown whole: a
 * button to reveal one game is more work than the game.
 */
export function limitGames<T>(games: T[], expanded: boolean, limit = GAMES_SHOWN): { shown: T[]; hidden: number } {
  if (expanded || games.length <= limit + 1) return { shown: games, hidden: 0 }
  return { shown: games.slice(0, limit), hidden: games.length - limit }
}

export function membersView(data: Record<string, unknown>): {
  group: string
  members: { id: string; name: string }[]
} {
  return {
    group: typeof data.group === 'string' ? data.group : '',
    members: (Array.isArray(data.members) ? data.members : []).flatMap(
      (m: Record<string, unknown>) =>
        typeof m.member_id === 'string' ? [{ id: m.member_id, name: String(m.name ?? '') }] : []
    ),
  }
}

export type ResultLine = {
  gameId: string
  group: string
  title: string
  when: string
  boughtIn: Money
  cashedOut: Money | null
  net: Money
}

export function balancesView(data: Record<string, unknown>): {
  total: Money | null
  games: ResultLine[]
} {
  const games = (Array.isArray(data.games) ? data.games : []).flatMap(
    (g: Record<string, unknown>): ResultLine[] =>
      typeof g.game_id === 'string' && isMoney(g.bought_in) && isMoney(g.net)
        ? [
            {
              gameId: g.game_id,
              group: String(g.group ?? ''),
              title: typeof g.name === 'string' && g.name ? g.name : (g.played_at as Moment | undefined)?.local ?? '',
              when: (g.played_at as Moment | undefined)?.local ?? '',
              boughtIn: g.bought_in,
              cashedOut: isMoney(g.cashed_out) ? g.cashed_out : null,
              net: g.net,
            },
          ]
        : []
  )
  return { total: isMoney(data.total_net) ? data.total_net : null, games }
}

export type DebtLine = {
  gameId: string
  group: string
  game: string
  when: string
  kind: string
  with: string
  amount: Money
  statusWords: string
}

function debtLines(raw: unknown): DebtLine[] {
  return (Array.isArray(raw) ? raw : []).flatMap((l: Record<string, unknown>): DebtLine[] =>
    isMoney(l.amount)
      ? [
          {
            gameId: String(l.game_id ?? ''),
            group: String(l.group ?? ''),
            game: typeof l.game === 'string' ? l.game : '',
            when: (l.played_at as Moment | null | undefined)?.local ?? '',
            kind: String(l.kind ?? 'poker'),
            with: String(l.with ?? ''),
            amount: l.amount,
            statusWords: String(l.status_words ?? ''),
          },
        ]
      : []
  )
}

/** What I owe and what I am owed. Never netted, and poker never netted with food. */
export function debtView(data: Record<string, unknown>): {
  iOwe: DebtLine[]
  owedToMe: DebtLine[]
} {
  return { iOwe: debtLines(data.i_owe), owedToMe: debtLines(data.owed_to_me) }
}

/** Which screen a tool's result belongs on, from the tool's name. */
export type ScreenKind = 'groups' | 'games' | 'game' | 'stats' | 'balances' | 'debt' | 'members'

export const SCREEN_OF_TOOL: Record<string, ScreenKind> = {
  list_my_groups: 'groups',
  list_games: 'games',
  get_game: 'game',
  get_my_stats: 'stats',
  get_my_balances: 'balances',
  get_outstanding_debt: 'debt',
  list_group_members: 'members',
}

/** Only a web address the host can sensibly open: https, or local for development. */
export function safeOrigin(raw: string | null | undefined): string | null {
  if (!raw) return null
  try {
    const u = new URL(raw)
    const local = u.hostname === 'localhost' || u.hostname === '127.0.0.1'
    if (u.protocol === 'https:' || (local && u.protocol === 'http:')) return u.origin
  } catch {
    // fall through
  }
  return null
}

export function appLink(
  origin: string | null,
  to: { group: string } | { game: string }
): string | null {
  if (!origin) return null
  return 'group' in to
    ? `${origin}/groups/${encodeURIComponent(to.group)}`
    : `${origin}/games/${encodeURIComponent(to.game)}`
}
