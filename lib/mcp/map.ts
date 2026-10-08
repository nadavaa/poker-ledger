// Database rows in, tool answers out. Pure: no Supabase, no Next, no React.
//
// This file decides nothing about who may see what — RLS already did that
// before a row got here. What it does decide is shape: which fields an agent
// gets, in what words, and which fields are deliberately left on the floor
// (phone numbers, claim codes, invite codes). Anything not copied below is
// not exposed.

import { computeStats, runningBalance, type GameResult } from '../stats'
import { fromZonedInput, playedAt, DEFAULT_TIME_ZONE } from '../time'
import { seatLabel, seatNote } from '../seats'
import { resolveDisplayName } from '../names'
import { settlementRole } from '../settlements'
import { resolveVenmoHandle, venmoLink } from '../venmo'
import { money, moment, momentOrNull, type Money, type Moment } from './format'

const tzOf = (tz: string | null | undefined) => tz || DEFAULT_TIME_ZONE

// ---------------------------------------------------------------- dates

/**
 * "2026-09-01".."2026-09-30" as a half-open instant range in the group's
 * zone, so a game played at 11pm on the 30th is in September. Either end may
 * be omitted.
 */
export function dayRange(
  from: string | undefined,
  to: string | undefined,
  timeZone: string
): { fromIso: string | null; toIso: string | null } {
  const check = (d: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || Number.isNaN(Date.parse(d))) {
      throw new Error(`Dates look like 2026-09-30. Got "${d}".`)
    }
  }
  let fromIso: string | null = null
  let toIso: string | null = null
  if (from) {
    check(from)
    fromIso = fromZonedInput(`${from}T00:00`, timeZone)
  }
  if (to) {
    check(to)
    const next = new Date(Date.parse(`${to}T00:00:00Z`) + 86_400_000)
    toIso = fromZonedInput(`${next.toISOString().slice(0, 10)}T00:00`, timeZone)
  }
  return { fromIso, toIso }
}

export function inRange(
  instant: string,
  range: { fromIso: string | null; toIso: string | null }
): boolean {
  const t = Date.parse(instant)
  if (range.fromIso && t < Date.parse(range.fromIso)) return false
  if (range.toIso && t >= Date.parse(range.toIso)) return false
  return true
}

// --------------------------------------------------------------- groups

export type GroupRow = {
  id: string
  name: string
  timezone: string | null
  role: 'owner' | 'admin' | 'member'
}

export function mapGroups(rows: GroupRow[]) {
  return rows.map((g) => ({
    group_id: g.id,
    name: g.name,
    my_role: g.role,
    timezone: tzOf(g.timezone),
  }))
}

// ---------------------------------------------------------------- seats

export function seatsView(taken: number, limit: number) {
  return {
    taken,
    limit,
    // "9/8 · 1 over", never clamped.
    summary: `${seatLabel(taken, limit)} · ${seatNote(taken, limit)}`,
  }
}

export type SignupRow = {
  member_id: string
  status: 'confirmed' | 'waitlist' | 'withdrawn'
  signup_order: number
}

export function myStanding(signups: SignupRow[], myMemberId: string | null) {
  const mine = signups.find((s) => s.member_id === myMemberId)
  if (!mine || mine.status === 'withdrawn') {
    return { i_am: 'not_signed_up' as const, waitlist_position: null }
  }
  if (mine.status === 'confirmed') {
    return { i_am: 'seated' as const, waitlist_position: null }
  }
  return {
    i_am: 'waitlisted' as const,
    waitlist_position: waitlistPosition(signups, mine.member_id),
  }
}

function waitlistPosition(signups: SignupRow[], memberId: string): number {
  const queue = signups
    .filter((s) => s.status === 'waitlist')
    .sort((a, b) => a.signup_order - b.signup_order)
  return queue.findIndex((s) => s.member_id === memberId) + 1
}

// ---------------------------------------------------------------- games

export type GameRow = {
  id: string
  name: string | null
  scheduled_at: string
  started_at: string | null
  settled_at: string | null
  location: string | null
  seat_limit: number
  status: 'scheduled' | 'active' | 'reconciling' | 'settled' | 'cancelled'
  admin_member_id: string
}

export function gameListItem(args: {
  game: GameRow
  timezone: string | null
  signups: SignupRow[]
  /** Confirmed players who cashed out and left, whose seat is free again. */
  leftTable: number
  myMemberId: string | null
}) {
  const { game, signups, leftTable, myMemberId } = args
  const tz = tzOf(args.timezone)
  const confirmed = signups.filter((s) => s.status === 'confirmed').length
  return {
    game_id: game.id,
    name: game.name,
    played_at: moment(
      playedAt({ startedAt: game.started_at, scheduledAt: game.scheduled_at }),
      tz
    ),
    status: game.status,
    location: game.location,
    seats: seatsView(Math.max(0, confirmed - leftTable), game.seat_limit),
    ...myStanding(signups, myMemberId),
  }
}

export type TotalsRow = {
  member_id: string
  display_name: string
  buyin_cents: number
  cashout_cents: number | null
  adjustment_cents: number
  net_cents: number
}

export type PersonRow = {
  member_id: string
  /** group_members.display_name, a snapshot. */
  display_name: string
  /** profiles.display_name, the living value, when the member is claimed. */
  profile_name?: string | null
}

export type SettlementRow = {
  id: string
  game_id?: string
  from_member_id: string
  to_member_id: string
  amount_cents: number
  status: 'pending' | 'paid' | 'confirmed' | 'deferred'
  kind: 'poker' | 'food'
  paid_at?: string | null
  confirmed_at?: string | null
}

const nameOf = (people: Map<string, string>, id: string) =>
  people.get(id) ?? 'Unknown'

export function nameMap(people: PersonRow[]): Map<string, string> {
  return new Map(
    people.map((p) => [
      p.member_id,
      resolveDisplayName(p.display_name, p.profile_name),
    ])
  )
}

const STATUS_WORDS: Record<SettlementRow['status'], string> = {
  pending: 'not paid yet',
  paid: 'marked paid, waiting for the payee to confirm',
  confirmed: 'confirmed received',
  deferred: 'deferred',
}

/** Confirmed and waitlisted players in the order a game shows them. */
export function orderedSignups<T extends { status: string; signup_order: number }>(signups: T[]) {
  const byOrder = (a: T, b: T) => a.signup_order - b.signup_order
  return {
    confirmed: signups.filter((s) => s.status === 'confirmed').sort(byOrder),
    waitlisted: signups.filter((s) => s.status === 'waitlist').sort(byOrder),
  }
}

/** A settled game lists the biggest winner first; before that, as stored. */
export function orderedTotals<T extends { net_cents: number }>(totals: T[], settled: boolean) {
  return [...totals].sort((a, b) => (settled ? b.net_cents - a.net_cents : 0))
}

export function gameDetail(args: {
  game: GameRow
  timezone: string | null
  groupName: string
  signups: (SignupRow & { left_table?: boolean })[]
  people: PersonRow[]
  totals: TotalsRow[]
  settlements: SettlementRow[]
  myMemberId: string | null
}) {
  const { game, signups, totals, settlements, myMemberId } = args
  const tz = tzOf(args.timezone)
  const names = nameMap(args.people)

  const { confirmed, waitlisted } = orderedSignups(signups)
  const left = confirmed.filter((s) => s.left_table).length

  const roster = confirmed.map((s) => ({
    name: nameOf(names, s.member_id),
    is_me: s.member_id === myMemberId,
    cashed_out_and_left: !!s.left_table,
  }))
  const waitlist = waitlisted
    .map((s, i) => ({
      position: i + 1,
      name: nameOf(names, s.member_id),
      is_me: s.member_id === myMemberId,
    }))

  // A scheduled game is a plan, not money. Nothing below this line is built
  // for it, so there is nothing to leak.
  let moneyView: null | {
    pot: Money
    players: {
      name: string
      is_me: boolean
      bought_in: Money
      cashed_out?: Money | null
      adjustment?: Money
      net?: Money
    }[]
    note: string
  } = null

  if (game.status !== 'scheduled') {
    const settled = game.status === 'settled'
    moneyView = {
      pot: money(totals.reduce((sum, t) => sum + t.buyin_cents, 0)),
      players: orderedTotals(totals, settled)
        .map((t) => ({
          name: nameOf(names, t.member_id),
          is_me: t.member_id === myMemberId,
          bought_in: money(t.buyin_cents),
          // Counts and nets are the reconciliation's business until the
          // game is settled.
          ...(settled
            ? {
                cashed_out:
                  t.cashout_cents === null ? null : money(t.cashout_cents),
                adjustment: money(t.adjustment_cents),
                net: money(t.net_cents),
              }
            : {}),
        })),
      note: settled
        ? 'Final results.'
        : 'Game not settled yet: buy-in totals only, no results.',
    }
  }

  const mySettlements =
    game.status === 'settled'
      ? settlements.map((s) => {
          const role = settlementRole(
            { fromMemberId: s.from_member_id, toMemberId: s.to_member_id },
            myMemberId
          )
          return {
            // A transfer I am part of is one I can act on, and so is any
            // transfer in a game I run (to close one out).
            ...(role !== 'bystander' || game.admin_member_id === myMemberId
              ? { transfer_id: s.id }
              : {}),
            kind: s.kind,
            from: nameOf(names, s.from_member_id),
            to: nameOf(names, s.to_member_id),
            amount: money(s.amount_cents),
            status: s.status,
            status_words: STATUS_WORDS[s.status],
            my_part: role,
          }
        })
      : null

  return {
    game_id: game.id,
    group: args.groupName,
    name: game.name,
    status: game.status,
    location: game.location,
    played_at: moment(
      playedAt({ startedAt: game.started_at, scheduledAt: game.scheduled_at }),
      tz
    ),
    scheduled_at: moment(game.scheduled_at, tz),
    settled_at: momentOrNull(game.settled_at, tz),
    game_admin: nameOf(names, game.admin_member_id),
    i_am_game_admin: game.admin_member_id === myMemberId,
    seats: seatsView(Math.max(0, confirmed.length - left), game.seat_limit),
    roster,
    waitlist,
    money: moneyView,
    settlements: mySettlements,
  }
}

// ---------------------------------------------------------------- stats

export type StatsGameRow = {
  game_id: string
  played_at: string
  net_cents: number
  buyin_cents: number
}

export function mapStats(rows: StatsGameRow[], timezone: string | null) {
  const tz = tzOf(timezone)
  const results: GameResult[] = rows.map((r) => ({
    gameId: r.game_id,
    playedAt: r.played_at,
    netCents: r.net_cents,
    buyinCents: r.buyin_cents,
  }))
  const stats = computeStats(results)
  if (!stats) {
    return {
      games_played: 0,
      message: 'No settled games in that range.',
      per_game: [],
    }
  }
  const game = (r: GameResult) => ({
    game_id: r.gameId,
    played_at: moment(r.playedAt, tz, 'day'),
    net: money(r.netCents),
  })
  return {
    games_played: stats.gamesPlayed,
    lifetime_net: money(stats.totalNetCents),
    average_net_per_game: money(stats.averageNetCents),
    total_bought_in: money(stats.totalBoughtInCents),
    wins: stats.wins,
    losses: stats.losses,
    break_evens: stats.breakEvens,
    win_rate: Math.round(stats.winRate * 1000) / 1000,
    // The stats module returns the best and worst game whatever they were,
    // so with three losses "best" is a loss. Say so as null, not as a win.
    biggest_win: stats.best.netCents > 0 ? game(stats.best) : null,
    biggest_loss: stats.worst.netCents < 0 ? game(stats.worst) : null,
    current_streak: stats.currentStreak,
    longest_win_streak: stats.longestWinStreak,
    longest_loss_streak: stats.longestLossStreak,
    // Oldest first, with the running total, so "am I up this year?" and
    // "what was my worst month?" can be answered without another call.
    per_game: runningBalance(results).map((p) => {
      const r = results.find((x) => x.gameId === p.gameId)!
      return {
        ...game(r),
        bought_in: money(r.buyinCents),
        running_net: money(p.balanceCents),
      }
    }),
  }
}

// ------------------------------------------------------------- balances

export type BalanceGameRow = {
  game_id: string
  game_name: string | null
  group_name: string
  timezone: string | null
  played_at: string
  buyin_cents: number
  cashout_cents: number | null
  adjustment_cents: number
  net_cents: number
}

/** What I ended each settled game with. Poker only; food is a debt line. */
export function mapBalances(rows: BalanceGameRow[]) {
  const ordered = [...rows].sort((a, b) => b.played_at.localeCompare(a.played_at))
  return {
    games: ordered.map((r) => ({
      game_id: r.game_id,
      group: r.group_name,
      name: r.game_name,
      played_at: moment(r.played_at, tzOf(r.timezone)),
      bought_in: money(r.buyin_cents),
      cashed_out: r.cashout_cents === null ? null : money(r.cashout_cents),
      adjustment: money(r.adjustment_cents),
      net: money(r.net_cents),
    })),
    total_net: money(ordered.reduce((sum, r) => sum + r.net_cents, 0)),
  }
}

// ----------------------------------------------------------------- debt

export type DebtGameInfo = {
  game_name: string | null
  group_name: string
  timezone: string | null
  played_at: string
}

export type PaymentDetailRow = {
  settlement_id: string
  member_venmo: string | null
  profile_venmo: string | null
  // member_phone, profile_phone and preferred also come back from the
  // database function. They are not in this type on purpose: phone numbers
  // are not part of this phase, so nothing here can copy one.
}

export function mapOutstandingDebt(args: {
  settlements: SettlementRow[]
  gameInfo: Map<string, DebtGameInfo>
  people: Map<string, string>
  /** group id by game id, then my member id in that group. */
  myMemberIdForGame: (gameId: string) => string | null
  payments: PaymentDetailRow[]
}) {
  const pay = new Map(args.payments.map((p) => [p.settlement_id, p]))

  type Line = ReturnType<typeof line>
  const line = (s: SettlementRow, direction: 'i_owe' | 'owed_to_me') => {
    const info = args.gameInfo.get(s.game_id ?? '')
    const tz = tzOf(info?.timezone)
    const other = direction === 'i_owe' ? s.to_member_id : s.from_member_id
    const detail = pay.get(s.id)
    const handle = detail
      ? resolveVenmoHandle(detail.member_venmo, detail.profile_venmo)
      : null
    return {
      // The id the payment tools take.
      transfer_id: s.id,
      game_id: s.game_id,
      group: info?.group_name ?? null,
      game: info?.game_name ?? null,
      played_at: info ? moment(info.played_at, tz, 'day') : null,
      kind: s.kind,
      with: nameOf(args.people, other),
      amount: money(s.amount_cents),
      status: s.status,
      status_words: STATUS_WORDS[s.status],
      // Only a payer is sent to pay; the payee is told who owes them.
      ...(direction === 'i_owe'
        ? {
            venmo_handle: handle,
            venmo_link: handle
              ? venmoLink(handle, s.amount_cents).web
              : null,
            ...(handle
              ? {}
              : { payment_note: 'They have not added a Venmo handle.' }),
          }
        : {}),
    }
  }

  const iOwe: Line[] = []
  const owedToMe: Line[] = []
  for (const s of args.settlements) {
    if (s.status === 'confirmed') continue
    const mine = args.myMemberIdForGame(s.game_id ?? '')
    const role = settlementRole(
      { fromMemberId: s.from_member_id, toMemberId: s.to_member_id },
      mine
    )
    if (role === 'payer') iOwe.push(line(s, 'i_owe'))
    else if (role === 'payee') owedToMe.push(line(s, 'owed_to_me'))
    // A bystander is the game admin looking at someone else's debt. That is
    // not mine to owe or be owed, so it is not in this answer.
  }

  const sum = (lines: Line[], kind: 'poker' | 'food') =>
    money(
      lines.filter((l) => l.kind === kind).reduce((n, l) => n + l.amount.cents, 0)
    )

  return {
    // Poker and food are never netted, and I owe and am owed are never netted.
    totals: {
      i_owe: { poker: sum(iOwe, 'poker'), food: sum(iOwe, 'food') },
      owed_to_me: { poker: sum(owedToMe, 'poker'), food: sum(owedToMe, 'food') },
    },
    i_owe: iOwe,
    owed_to_me: owedToMe,
  }
}

export type { Money, Moment }
