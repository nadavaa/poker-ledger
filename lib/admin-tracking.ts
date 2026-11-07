// The "what changed" numbers on /admin, worked out from the two detail lists
// (admin_users_detail, admin_groups_detail). Pure, so every window can be
// tested against a fixed clock. Spec: docs/GROWTH.md, section 1.

import { describeSource } from './signup-source'

export type AdminUser = {
  display_name: string
  created_at: string
  signup_source: string | null
  groups: number
  outside_groups: number
  first_outside_at: string | null
  games: number
  last_game: string | null
}

export type AdminGroup = {
  name: string
  created_at: string
  outside: boolean
  members: number
  claimed: number
  settled: number
  started: string[]
  last_game: string | null
}

export type Change = { now: number; before: number; delta: number }

export type Changes = {
  days: number
  signups: Change
  groupsCreated: Change
  outsideUsers: Change
  activeGroups: Change
}

export type GroupStatus = 'new' | 'active' | 'quiet'

const DAY = 24 * 60 * 60 * 1000

const t = (iso: string) => new Date(iso).getTime()

function change(now: number, before: number): Change {
  return { now, before, delta: now - before }
}

function inWindow(iso: string, from: number, to: number) {
  const x = t(iso)
  return x > from && x <= to
}

/**
 * One window, against the window just before it. Sign-ups, new groups and
 * active groups are counts in each window; outside users is a running total,
 * compared with what it was when the window opened.
 */
export function changesFor(
  users: AdminUser[],
  groups: AdminGroup[],
  days: number,
  nowMs: number
): Changes {
  const start = nowMs - days * DAY
  const prev = start - days * DAY
  const count = <T>(xs: T[], f: (x: T) => boolean) => xs.filter(f).length

  const outsideBy = (at: number) =>
    count(users, (u) => u.first_outside_at !== null && t(u.first_outside_at) <= at)
  const activeIn = (from: number, to: number) =>
    count(groups, (g) => g.started.some((s) => inWindow(s, from, to)))

  return {
    days,
    signups: change(
      count(users, (u) => inWindow(u.created_at, start, nowMs)),
      count(users, (u) => inWindow(u.created_at, prev, start))
    ),
    groupsCreated: change(
      count(groups, (g) => inWindow(g.created_at, start, nowMs)),
      count(groups, (g) => inWindow(g.created_at, prev, start))
    ),
    outsideUsers: change(outsideBy(nowMs), outsideBy(start)),
    activeGroups: change(activeIn(start, nowMs), activeIn(prev, start)),
  }
}

/**
 * new: created in the last 14 days. active: a game started in the last 30.
 * quiet: neither.
 */
export function groupStatus(g: AdminGroup, nowMs: number): GroupStatus {
  if (t(g.created_at) > nowMs - 14 * DAY) return 'new'
  if (g.started.some((s) => t(s) > nowMs - 30 * DAY)) return 'active'
  return 'quiet'
}

/** Had a game in the 30 days before last, none in the last 30. */
export function goneQuiet(groups: AdminGroup[], nowMs: number): number {
  const a = nowMs - 30 * DAY
  const b = nowMs - 60 * DAY
  return groups.filter(
    (g) =>
      g.started.some((s) => inWindow(s, b, a)) &&
      !g.started.some((s) => inWindow(s, a, nowMs))
  ).length
}

export function gamesInLast(g: AdminGroup, days: number, nowMs: number): number {
  return g.started.filter((s) => inWindow(s, nowMs - days * DAY, nowMs)).length
}

/** Sign-ups in the last `days`, by source, most first. */
export function sourceCounts(
  users: AdminUser[],
  days: number,
  nowMs: number
): { source: string; count: number }[] {
  const tally = new Map<string, number>()
  for (const u of users) {
    if (!inWindow(u.created_at, nowMs - days * DAY, nowMs)) continue
    const key = describeSource(u.signup_source)
    tally.set(key, (tally.get(key) ?? 0) + 1)
  }
  return [...tally.entries()]
    .map(([source, n]) => ({ source, count: n }))
    .sort((x, y) => y.count - x.count || x.source.localeCompare(y.source))
}

/** "+3", "−2", "0": a real minus sign, and no plus on zero. */
export function formatDelta(delta: number): string {
  if (delta > 0) return `+${delta}`
  if (delta < 0) return `−${Math.abs(delta)}`
  return '0'
}
