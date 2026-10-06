import { playedAt } from '../../time'
import { must, ToolError, type Db } from './run'

/**
 * A group the user belongs to. RLS hides every other group, so "not found"
 * and "not yours" are the same answer — and say so.
 */
export async function loadGroup(db: Db, groupId: string) {
  const { data } = await db
    .from('groups')
    .select('id, name, timezone')
    .eq('id', groupId)
    .maybeSingle()
  if (!data) {
    throw new ToolError(
      'Group not found, or you are not a member. Call list_my_groups for valid group_ids.'
    )
  }
  return data
}

/** The user's own member row in a group: the id everything else keys on. */
export async function myMemberId(
  db: Db,
  groupId: string,
  userId: string
): Promise<string | null> {
  const rows = must(
    await db
      .from('group_members')
      .select('id')
      .eq('group_id', groupId)
      .eq('profile_id', userId)
      .limit(1)
  )
  return rows[0]?.id ?? null
}

export type SettledResult = {
  game_id: string
  game_name: string | null
  group_id: string
  group_name: string
  timezone: string | null
  played_at: string
  buyin_cents: number
  cashout_cents: number | null
  adjustment_cents: number
  net_cents: number
}

/**
 * The user's own line in every settled game, in one group or all of them.
 * Unsettled games are left out: a game in progress would read as a loss the
 * size of the buy-ins.
 *
 * The member ids are the user's own rows in their groups. That is a
 * convenience filter to get "mine" — what is visible at all is still RLS.
 */
export async function mySettledResults(
  db: Db,
  userId: string,
  groupId?: string
): Promise<SettledResult[]> {
  let membersQuery = db
    .from('group_members')
    .select('id, group_id')
    .eq('profile_id', userId)
  if (groupId) membersQuery = membersQuery.eq('group_id', groupId)
  const mine = must(await membersQuery)
  if (mine.length === 0) return []

  const [totals, games] = await Promise.all([
    db
      .from('game_player_totals')
      .select(
        'game_id, member_id, buyin_cents, cashout_cents, adjustment_cents, net_cents'
      )
      .in(
        'member_id',
        mine.map((m) => m.id)
      ),
    db
      .from('games')
      .select(
        'id, name, group_id, scheduled_at, started_at, groups(name, timezone)'
      )
      .eq('status', 'settled')
      .in(
        'group_id',
        mine.map((m) => m.group_id)
      )
      .limit(2000),
  ])

  const byGame = new Map(must(games).map((g) => [g.id, g]))
  return must(totals).flatMap((t) => {
    const g = byGame.get(t.game_id)
    if (!g) return []
    return [
      {
        game_id: g.id,
        game_name: g.name,
        group_id: g.group_id,
        group_name: g.groups?.name ?? '',
        timezone: g.groups?.timezone ?? null,
        played_at: playedAt({
          startedAt: g.started_at,
          scheduledAt: g.scheduled_at,
        }),
        buyin_cents: t.buyin_cents,
        cashout_cents: t.cashout_cents,
        adjustment_cents: t.adjustment_cents,
        net_cents: t.net_cents,
      },
    ]
  })
}
