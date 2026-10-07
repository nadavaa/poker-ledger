import type { GameFacts } from '../plan'
import type { SignupRow } from '../map'
import { DEFAULT_TIME_ZONE } from '../../time'
import { must, ToolError, type Db } from './run'

export const NO_SUCH_GAME =
  'Game not found, or it is not in one of your groups. Call list_games for valid game_ids.'

/**
 * Everything a join or a withdrawal needs to know, read as the user.
 *
 * The first query is also the "only games in groups I already belong to"
 * check: row-level security hides every other group's games, so a game that
 * is not mine is simply not found. join_game_by_link would otherwise add a
 * stranger to the group, so nothing is allowed to reach it without this.
 */
export async function loadGameContext(db: Db, userId: string, gameId: string) {
  const { data: game } = await db
    .from('games')
    .select(
      'id, group_id, name, location, scheduled_at, started_at, status, seat_limit, admin_member_id, groups(name, timezone)'
    )
    .eq('id', gameId)
    .maybeSingle()
  if (!game) throw new ToolError(NO_SUCH_GAME)

  const [signups, left, me] = await Promise.all([
    db
      .from('game_signups')
      .select('member_id, status, signup_order')
      .eq('game_id', game.id),
    db
      .from('cashouts')
      .select('member_id')
      .eq('game_id', game.id)
      .eq('left_table', true),
    db
      .from('group_members')
      .select('id')
      .eq('group_id', game.group_id)
      .eq('profile_id', userId)
      .eq('is_active', true)
      .limit(1),
  ])

  return {
    gameId: game.id,
    groupId: game.group_id,
    location: game.location,
    adminMemberId: game.admin_member_id,
    facts: {
      name: game.name,
      groupName: game.groups?.name ?? '',
      timezone: game.groups?.timezone ?? DEFAULT_TIME_ZONE,
      status: game.status,
      scheduledAt: game.scheduled_at,
      startedAt: game.started_at,
      seatLimit: game.seat_limit,
    } satisfies GameFacts,
    signups: must(signups) as SignupRow[],
    leftTable: must(left).length,
    myMemberId: must(me)[0]?.id ?? null,
  }
}
