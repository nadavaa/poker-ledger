import type { McpServer } from '@modelcontextprotocol/server'
import { registerAppTool } from '@modelcontextprotocol/ext-apps/server'
import { z } from 'zod'
import { playedAt, DEFAULT_TIME_ZONE } from '../../time'
import {
  dayRange,
  gameDetail,
  gameListItem,
  inRange,
  orderedSignups,
  orderedTotals,
  type SignupRow,
} from '../map'
import { loadGroup, myMemberId } from './common'
import { gameListFacts, personAvatar } from '../ui/meta'
import { appUi } from '../ui/register'
import { must, runTool, ToolError } from './run'

const STATUSES = ['scheduled', 'active', 'reconciling', 'settled', 'cancelled'] as const

const LIST_LIMIT = 50

export function registerGameTools(server: McpServer) {
  registerAppTool(
    server,
    'list_games',
    {
      _meta: appUi,
      title: 'List games in a group',
      description:
        'Use this to find games: upcoming ones to sign up for, recent ones ' +
        'to look at, or a game_id for get_game. Returns up to 50 games in ' +
        'one group, newest first. Each has its date (the night it was ' +
        'played, or the scheduled time if it has not started), status ' +
        '(scheduled, active, reconciling, settled, cancelled), seats like ' +
        '"9/8 · 1 over", and whether the user is seated, waitlisted (with ' +
        'their position) or not signed up. Optional filters: status, and ' +
        'from/to as YYYY-MM-DD in the group\'s timezone, both inclusive. ' +
        'It shows no money; use get_game for results. It cannot sign the ' +
        'user up or change a game.',
      inputSchema: z.object({
        group_id: z.uuid().describe('From list_my_groups.'),
        status: z.enum(STATUSES).optional(),
        from: z.string().optional().describe('YYYY-MM-DD, inclusive.'),
        to: z.string().optional().describe('YYYY-MM-DD, inclusive.'),
      }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    (args, ctx) =>
      runTool('list_games', ctx, async ({ db, userId, setUi }) => {
        const group = await loadGroup(db, args.group_id)
        const tz = group.timezone || DEFAULT_TIME_ZONE
        const range = parseRange(args.from, args.to, tz)
        const me = await myMemberId(db, group.id, userId)

        let query = db
          .from('games')
          .select(
            'id, name, scheduled_at, started_at, settled_at, location, seat_limit, status, admin_member_id'
          )
          .eq('group_id', group.id)
          .order('scheduled_at', { ascending: false })
          .limit(500)
        if (args.status) query = query.eq('status', args.status)
        const all = must(await query)

        // A game is dated by when it was played, which is not a column, so
        // the range is applied here rather than in the query.
        const games = all
          .filter((g) =>
            inRange(
              playedAt({ startedAt: g.started_at, scheduledAt: g.scheduled_at }),
              range
            )
          )
          .sort((a, b) =>
            playedAt({ startedAt: b.started_at, scheduledAt: b.scheduled_at }).localeCompare(
              playedAt({ startedAt: a.started_at, scheduledAt: a.scheduled_at })
            )
          )
        const shown = games.slice(0, LIST_LIMIT)
        const ids = shown.map((g) => g.id)

        const [signups, left] = ids.length
          ? await Promise.all([
              db
                .from('game_signups')
                .select('game_id, member_id, status, signup_order')
                .in('game_id', ids),
              db
                .from('cashouts')
                .select('game_id')
                .in('game_id', ids)
                .eq('left_table', true),
            ]).then(([s, l]) => [must(s), must(l)] as const)
          : [[], []]

        const signupsBy = new Map<string, SignupRow[]>()
        for (const s of signups) {
          const list = signupsBy.get(s.game_id) ?? []
          list.push(s)
          signupsBy.set(s.game_id, list)
        }
        const leftBy = new Map<string, number>()
        for (const l of left) leftBy.set(l.game_id, (leftBy.get(l.game_id) ?? 0) + 1)

        // The list shows who played and the pot for a finished game, and my own
        // result for a settled one. Visible to the group already; the view only.
        const finished = shown.filter((g) => g.status !== 'scheduled' && g.status !== 'active')
        const totals = finished.length
          ? must(
              await db
                .from('game_player_totals')
                .select('game_id, member_id, buyin_cents, net_cents')
                .in('game_id', finished.map((g) => g.id))
            )
          : []
        setUi({ games: gameListFacts({ games: shown, totals, myMemberId: me }) })

        return {
          group: group.name,
          timezone: tz,
          games: shown.map((game) =>
            gameListItem({
              game,
              timezone: tz,
              signups: signupsBy.get(game.id) ?? [],
              leftTable: leftBy.get(game.id) ?? 0,
              myMemberId: me,
            })
          ),
          ...(games.length > shown.length
            ? {
                note: `Showing the newest ${LIST_LIMIT} of ${games.length} games. Narrow with from/to or status.`,
              }
            : {}),
        }
      })
  )

  registerAppTool(
    server,
    'get_game',
    {
      _meta: appUi,
      title: 'Get one game',
      description:
        'Use this for the details of one game: who is seated and on the ' +
        'waitlist, and, once it has started, the pot. Once settled it also ' +
        'has each player\'s buy-in, cash-out and net, and the settlement ' +
        'transfers the user is allowed to see (their own, or all of them ' +
        'if they ran the game), with poker and food as separate lines. A ' +
        'scheduled game has no money at all. It does not list individual ' +
        'buy-ins as they happen, phone numbers, or invite links, and it ' +
        'cannot change anything. Get game_ids from list_games.',
      inputSchema: z.object({ game_id: z.uuid() }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    (args, ctx) =>
      runTool('get_game', ctx, async ({ db, userId, setUi }) => {
        const { data: game } = await db
          .from('games')
          .select(
            'id, group_id, name, scheduled_at, started_at, settled_at, location, seat_limit, status, admin_member_id, groups(name, timezone)'
          )
          .eq('id', args.game_id)
          .maybeSingle()
        if (!game) {
          throw new ToolError(
            'Game not found, or it is not in one of your groups. Call list_games for valid game_ids.'
          )
        }

        const [signups, people, totals, settlements, left] = await Promise.all([
          db
            .from('game_signups')
            .select('member_id, status, signup_order')
            .eq('game_id', game.id),
          db
            .from('group_members')
            .select('id, display_name, profile_id, profiles(display_name, avatar_url)')
            .eq('group_id', game.group_id),
          db
            .from('game_player_totals')
            .select(
              'member_id, display_name, buyin_cents, cashout_cents, adjustment_cents, net_cents'
            )
            .eq('game_id', game.id),
          // RLS returns only the rows this user is party to, or all of
          // them for the game admin.
          db
            .from('settlements')
            .select('id, from_member_id, to_member_id, amount_cents, status, kind')
            .eq('game_id', game.id)
            .order('amount_cents', { ascending: false }),
          db
            .from('cashouts')
            .select('member_id')
            .eq('game_id', game.id)
            .eq('left_table', true),
        ])

        const members = must(people)
        const leftIds = new Set(must(left).map((c) => c.member_id))

        const signupRows = must(signups).map((s) => ({
          ...s,
          left_table: leftIds.has(s.member_id),
        }))
        // Pictures in the same order the text lists the people.
        const face = new Map(
          members.map((m) => [m.id, { avatar: personAvatar(m.profiles?.avatar_url) }])
        )
        const faceOf = (id: string) => face.get(id) ?? { avatar: null }
        const ordered = orderedSignups(signupRows)
        setUi({
          roster: ordered.confirmed.map((s) => faceOf(s.member_id)),
          waitlist: ordered.waitlisted.map((s) => faceOf(s.member_id)),
          players: orderedTotals(must(totals), game.status === 'settled').map((t) => faceOf(t.member_id)),
        })

        return gameDetail({
          game,
          timezone: game.groups?.timezone ?? null,
          groupName: game.groups?.name ?? '',
          signups: signupRows,
          people: members.map((m) => ({
            member_id: m.id,
            display_name: m.display_name,
            profile_name: m.profiles?.display_name ?? null,
          })),
          totals: must(totals),
          settlements: must(settlements),
          myMemberId: members.find((m) => m.profile_id === userId)?.id ?? null,
        })
      })
  )
}

function parseRange(from: string | undefined, to: string | undefined, tz: string) {
  try {
    return dayRange(from, to, tz)
  } catch (e) {
    throw new ToolError(e instanceof Error ? e.message : 'Bad date.')
  }
}
