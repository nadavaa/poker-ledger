import { describe, expect, it } from 'vitest'
import {
  changesFor,
  formatDelta,
  gamesInLast,
  goneQuiet,
  groupStatus,
  sourceCounts,
  type AdminGroup,
  type AdminUser,
} from './admin-tracking'

const NOW = Date.parse('2026-11-06T12:00:00Z')
const daysAgo = (d: number) => new Date(NOW - d * 86_400_000).toISOString()

function user(p: Partial<AdminUser>): AdminUser {
  return {
    display_name: 'x',
    created_at: daysAgo(100),
    signup_source: null,
    groups: 1,
    outside_groups: 0,
    first_outside_at: null,
    games: 0,
    last_game: null,
    ...p,
  }
}

function group(p: Partial<AdminGroup>): AdminGroup {
  return {
    name: 'g',
    created_at: daysAgo(100),
    outside: false,
    members: 1,
    claimed: 1,
    settled: 0,
    started: [],
    last_game: null,
    ...p,
  }
}

describe('changesFor', () => {
  const users = [
    user({ created_at: daysAgo(2) }),
    user({ created_at: daysAgo(3), first_outside_at: daysAgo(3) }),
    user({ created_at: daysAgo(10) }),
    user({ created_at: daysAgo(40), first_outside_at: daysAgo(20) }),
  ]
  const groups = [
    group({ created_at: daysAgo(1), started: [daysAgo(1)] }),
    group({ created_at: daysAgo(9), started: [daysAgo(9)] }),
    group({ started: [daysAgo(2), daysAgo(8)] }),
  ]

  it('counts sign-ups and new groups in this window and the one before', () => {
    const c = changesFor(users, groups, 7, NOW)
    expect(c.signups).toEqual({ now: 2, before: 1, delta: 1 })
    expect(c.groupsCreated).toEqual({ now: 1, before: 1, delta: 0 })
  })

  it('treats outside users as a running total', () => {
    expect(changesFor(users, groups, 7, NOW).outsideUsers).toEqual({
      now: 2,
      before: 1,
      delta: 1,
    })
    expect(changesFor(users, groups, 30, NOW).outsideUsers).toEqual({
      now: 2,
      before: 0,
      delta: 2,
    })
  })

  it('counts a group as active once per window, however many games', () => {
    const c = changesFor(users, groups, 7, NOW)
    expect(c.activeGroups).toEqual({ now: 2, before: 2, delta: 0 })
  })

  it('is all zeros on empty data', () => {
    const c = changesFor([], [], 30, NOW)
    expect(c.signups.now + c.outsideUsers.now + c.activeGroups.now).toBe(0)
  })
})

describe('groupStatus', () => {
  it('new beats active for a group under two weeks old', () => {
    expect(groupStatus(group({ created_at: daysAgo(3), started: [daysAgo(1)] }), NOW)).toBe('new')
  })
  it('active with a game in the last 30 days', () => {
    expect(groupStatus(group({ started: [daysAgo(29)] }), NOW)).toBe('active')
  })
  it('quiet otherwise', () => {
    expect(groupStatus(group({ started: [daysAgo(31)] }), NOW)).toBe('quiet')
    expect(groupStatus(group({}), NOW)).toBe('quiet')
  })
})

describe('goneQuiet', () => {
  it('counts groups that played 30-60 days ago and not since', () => {
    const gs = [
      group({ started: [daysAgo(45)] }),
      group({ started: [daysAgo(45), daysAgo(5)] }),
      group({ started: [daysAgo(90)] }),
    ]
    expect(goneQuiet(gs, NOW)).toBe(1)
  })
})

describe('gamesInLast', () => {
  it('counts starts inside the window only', () => {
    expect(gamesInLast(group({ started: [daysAgo(1), daysAgo(29), daysAgo(31)] }), 30, NOW)).toBe(2)
  })
})

describe('sourceCounts', () => {
  it('tallies recent sign-ups by readable source, most first', () => {
    const us = [
      user({ created_at: daysAgo(1), signup_source: 'ref:reddit' }),
      user({ created_at: daysAgo(2), signup_source: 'ref:reddit' }),
      user({ created_at: daysAgo(3), signup_source: 'web:google.com' }),
      user({ created_at: daysAgo(40), signup_source: 'ref:reddit' }),
    ]
    expect(sourceCounts(us, 30, NOW)).toEqual([
      { source: 'reddit', count: 2 },
      { source: 'google.com', count: 1 },
    ])
  })
})

describe('formatDelta', () => {
  it('signs non-zero changes', () => {
    expect(formatDelta(3)).toBe('+3')
    expect(formatDelta(-2)).toBe('−2')
    expect(formatDelta(0)).toBe('0')
  })
})
