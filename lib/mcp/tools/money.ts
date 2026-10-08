import type { McpServer } from '@modelcontextprotocol/server'
import { registerAppTool } from '@modelcontextprotocol/ext-apps/server'
import { z } from 'zod'
import { DEFAULT_TIME_ZONE } from '../../time'
import {
  dayRange,
  inRange,
  mapBalances,
  mapOutstandingDebt,
  mapStats,
  nameMap,
  type DebtGameInfo,
  type SettlementRow,
} from '../map'
import { loadGroup, mySettledResults } from './common'
import { appUi } from '../ui/register'
import { must, runTool, ToolError } from './run'

export function registerMoneyTools(server: McpServer) {
  registerAppTool(
    server,
    'get_my_stats',
    {
      _meta: appUi,
      title: 'My stats in a group',
      description:
        'Use this for questions about how the user has done in one group: ' +
        'lifetime net, games played, wins and losses, biggest win and ' +
        'loss, current streak, and a per-game list (oldest first, with a ' +
        'running total) so you can answer custom questions such as "am I ' +
        'up this year?" or "what was my worst month?". Counts settled ' +
        'games only, dated by the night they were played. Optional from/to ' +
        '(YYYY-MM-DD, inclusive, in the group\'s timezone) narrow the ' +
        'range. It covers only the user, never other players, and cannot ' +
        'change anything.',
      inputSchema: z.object({
        group_id: z.uuid().describe('From list_my_groups.'),
        from: z.string().optional().describe('YYYY-MM-DD, inclusive.'),
        to: z.string().optional().describe('YYYY-MM-DD, inclusive.'),
      }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    (args, ctx) =>
      runTool('get_my_stats', ctx, async ({ db, userId }) => {
        const group = await loadGroup(db, args.group_id)
        const tz = group.timezone || DEFAULT_TIME_ZONE
        let range
        try {
          range = dayRange(args.from, args.to, tz)
        } catch (e) {
          throw new ToolError(e instanceof Error ? e.message : 'Bad date.')
        }
        const results = (await mySettledResults(db, userId, group.id)).filter(
          (r) => inRange(r.played_at, range)
        )
        return {
          group: group.name,
          timezone: tz,
          ...mapStats(
            results.map((r) => ({
              game_id: r.game_id,
              played_at: r.played_at,
              net_cents: r.net_cents,
              buyin_cents: r.buyin_cents,
            })),
            tz
          ),
        }
      })
  )

  registerAppTool(
    server,
    'get_my_balances',
    {
      _meta: appUi,
      title: 'What I ended each game with',
      description:
        'Use this to answer "how did I do in each game?" or "what have I ' +
        'won or lost overall?". Returns, for every settled game, what the ' +
        'user bought in, cashed out, any discrepancy adjustment, and the ' +
        'net result, newest first, plus a total. Omit group_id to cover ' +
        'all groups. This is results, not payments: for who still has to ' +
        'pay whom, and Venmo links, use get_outstanding_debt. It cannot ' +
        'change anything.',
      inputSchema: z.object({
        group_id: z.uuid().optional().describe('From list_my_groups.'),
      }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    (args, ctx) =>
      runTool('get_my_balances', ctx, async ({ db, userId }) => {
        if (args.group_id) await loadGroup(db, args.group_id)
        const rows = await mySettledResults(db, userId, args.group_id)
        return mapBalances(rows)
      })
  )

  registerAppTool(
    server,
    'get_outstanding_debt',
    {
      _meta: appUi,
      title: 'What I owe and am owed',
      description:
        'Use this for "who do I still need to pay?" or "who owes me?". ' +
        'Returns settled-game transfers not yet confirmed as received: ' +
        'what the user owes (with a Venmo link for each, and the payee\'s ' +
        'handle) and what they are owed. Poker and food are separate ' +
        'lines and separate totals, never netted against each other or ' +
        'against what is owed the other way. Each has a handshake status: ' +
        'pending, paid (the payer marked it, the payee has not confirmed) ' +
        'or deferred. Omit group_id to cover all groups. It cannot mark ' +
        'anything paid or confirmed, and no money moves through Poker ' +
        'Ledger: the user pays on Venmo themselves.',
      inputSchema: z.object({
        group_id: z.uuid().optional().describe('From list_my_groups.'),
      }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    (args, ctx) =>
      runTool('get_outstanding_debt', ctx, async ({ db, userId }) => {
        if (args.group_id) await loadGroup(db, args.group_id)

        let mineQuery = db
          .from('group_members')
          .select('id, group_id')
          .eq('profile_id', userId)
        if (args.group_id) mineQuery = mineQuery.eq('group_id', args.group_id)
        const mine = must(await mineQuery)
        const myIds = mine.map((m) => m.id)
        const empty = mapOutstandingDebt({
          settlements: [],
          gameInfo: new Map(),
          people: new Map(),
          myMemberIdForGame: () => null,
          payments: [],
        })
        if (myIds.length === 0) return empty

        const idList = myIds.join(',')
        const settlements = must(
          await db
            .from('settlements')
            .select(
              'id, game_id, from_member_id, to_member_id, amount_cents, status, kind'
            )
            .neq('status', 'confirmed')
            .or(`from_member_id.in.(${idList}),to_member_id.in.(${idList})`)
        ) as SettlementRow[]
        if (settlements.length === 0) return empty

        const gameIds = [...new Set(settlements.map((s) => s.game_id!))]
        const memberIds = [
          ...new Set(
            settlements.flatMap((s) => [s.from_member_id, s.to_member_id])
          ),
        ]

        const [games, people] = await Promise.all([
          db
            .from('games')
            .select(
              'id, name, group_id, scheduled_at, started_at, groups(name, timezone)'
            )
            .in('id', gameIds),
          db
            .from('group_members')
            .select('id, display_name, profiles(display_name)')
            .in('id', memberIds),
        ])

        const gameRows = must(games)
        const gameInfo = new Map<string, DebtGameInfo>(
          gameRows.map((g) => [
            g.id,
            {
              game_name: g.name,
              group_name: g.groups?.name ?? '',
              timezone: g.groups?.timezone ?? null,
              played_at: g.started_at ?? g.scheduled_at,
            },
          ])
        )
        const myMemberByGroup = new Map(mine.map((m) => [m.group_id, m.id]))
        const groupOfGame = new Map(gameRows.map((g) => [g.id, g.group_id]))

        // Where to send the money. The database function also returns phone
        // numbers, and this phase does not expose them: only the two Venmo
        // fields are kept, here and again in the mapper.
        const payments = (
          await Promise.all(
            gameIds.map((id) =>
              db.rpc('game_payment_details', { p_game_id: id })
            )
          )
        ).flatMap((r) =>
          (r.data ?? []).map((p) => ({
            settlement_id: p.settlement_id,
            member_venmo: p.member_venmo,
            profile_venmo: p.profile_venmo,
          }))
        )

        return mapOutstandingDebt({
          settlements,
          gameInfo,
          people: nameMap(
            must(people).map((m) => ({
              member_id: m.id,
              display_name: m.display_name,
              profile_name: m.profiles?.display_name ?? null,
            }))
          ),
          myMemberIdForGame: (gameId) =>
            myMemberByGroup.get(groupOfGame.get(gameId) ?? '') ?? null,
          payments,
        })
      })
  )
}
