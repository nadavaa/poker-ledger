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
  }
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
