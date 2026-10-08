import type { McpServer } from '@modelcontextprotocol/server'
import { z } from 'zod'
import { resolveDisplayName } from '../../names'
import { settledGameSummary } from '../../summary'
import { DEFAULT_TIME_ZONE, formatTime, playedAt } from '../../time'
import { personAvatar } from '../ui/meta'
import { loadGroup } from './common'
import { must, runTool, ToolError } from './run'

export function registerRosterTools(server: McpServer) {
  server.registerTool(
    'list_group_members',
    {
      title: 'List a group\'s members',
      description:
        'Use this to turn a name into a member_id, for example before add_player or ' +
        'seat_from_waitlist ("add Dean"). Returns the active members of one group as ' +
        'member_id and name, and nothing else: no emails, phone numbers, payment ' +
        'handles, roles or claim status. Names are as the group sees them. It cannot ' +
        'add, remove or change anyone.',
      inputSchema: z.object({ group_id: z.uuid().describe('From list_my_groups.') }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    (args, ctx) =>
      runTool('list_group_members', ctx, async ({ db, userId, setUi }) => {
        const group = await loadGroup(db, args.group_id)
        const rows = must(
          await db
            .from('group_members')
            .select('id, display_name, profile_id, profiles(display_name, avatar_url)')
            .eq('group_id', group.id)
            .eq('is_active', true)
        )
        // Name, picture and "is this me" together, so sorting them keeps them
        // together; the text result gets only the name and the id.
        const members = rows
          .map((m) => ({
            member_id: m.id,
            name: resolveDisplayName(m.display_name, m.profiles?.display_name),
            avatar: personAvatar(m.profiles?.avatar_url),
            isMe: m.profile_id === userId,
          }))
          .sort((a, b) => a.name.localeCompare(b.name))
        setUi({ members: members.map((m) => ({ avatar: m.avatar, isMe: m.isMe })) })
        return {
          group: group.name,
          members: members.map((m) => ({ member_id: m.member_id, name: m.name })),
        }
      })
  )

  server.registerTool(
    'get_whatsapp_summary',
    {
      title: 'WhatsApp summary of a settled game',
      description:
        'Use this when the game admin wants the results as plain text to paste into the ' +
        'group chat. It returns exactly what the app\'s "Copy summary for WhatsApp" ' +
        'button copies: title, pot, each player\'s result with the winner first, and ' +
        'the payments with which are settled. Only for the game admin, and only for a ' +
        'settled game with payments. It changes nothing and needs no confirmation: ' +
        'show the text as it is, and do not post it anywhere yourself.',
      inputSchema: z.object({ game_id: z.uuid() }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    (args, ctx) =>
      runTool('get_whatsapp_summary', ctx, async ({ db }) => {
        const { data: game } = await db
          .from('games')
          .select('id, group_id, name, scheduled_at, started_at, status, groups(timezone)')
          .eq('id', args.game_id)
          .maybeSingle()
        if (!game) {
          throw new ToolError(
            'Game not found, or it is not in one of your groups. Call list_games for valid game_ids.'
          )
        }

        // The button is the admin's: a player sees only their own transfers,
        // so a summary built from what they can read would be wrong.
        const admin = (await db.rpc('can_admin_game', { g: game.id })).data === true
        if (!admin) throw new ToolError('Only the game admin can get the summary.')
        if (game.status !== 'settled') {
          throw new ToolError('The summary is for a settled game. This one is not settled yet.')
        }

        const [totals, settlements, members] = await Promise.all([
          db
            .from('game_player_totals')
            .select('member_id, display_name, buyin_cents, net_cents')
            .eq('game_id', game.id),
          db
            .from('settlements')
            .select('from_member_id, to_member_id, amount_cents, status')
            .eq('game_id', game.id)
            .order('amount_cents', { ascending: false }),
          // Active members, resolved to their current names: the same list
          // the game screen builds its names from.
          db
            .from('group_members')
            .select('id, display_name, profiles(display_name)')
            .eq('group_id', game.group_id)
            .eq('is_active', true),
        ])
        const transfers = must(settlements)
        if (transfers.length === 0) {
          throw new ToolError('This game has no payments to summarise.')
        }

        const tz = game.groups?.timezone ?? DEFAULT_TIME_ZONE
        const names = new Map(
          must(members).map((m) => [
            m.id,
            resolveDisplayName(m.display_name, m.profiles?.display_name),
          ])
        )
        return {
          summary: settledGameSummary({
            title:
              game.name ??
              formatTime(
                playedAt({ startedAt: game.started_at, scheduledAt: game.scheduled_at }),
                tz,
                'day'
              ),
            rows: must(totals).map((t) => ({
              name: t.display_name,
              buyinCents: t.buyin_cents,
              netCents: t.net_cents,
            })),
            transfers: transfers.map((t) => ({
              fromMemberId: t.from_member_id,
              toMemberId: t.to_member_id,
              amountCents: t.amount_cents,
              status: t.status,
            })),
            names,
          }),
        }
      })
  )
}
