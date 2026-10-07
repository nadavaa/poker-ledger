import type { McpServer } from '@modelcontextprotocol/server'
import { z } from 'zod'
import { resolveDisplayName } from '../../names'
import { settlementRole } from '../../settlements'
import { DEFAULT_TIME_ZONE, formatTime } from '../../time'
import {
  localToInstant,
  planAddPlayer,
  planCancelGame,
  planCloseOut,
  planCreateGame,
  planEditGame,
  planSeatFromWaitlist,
} from '../admin-plan'
import { friendlyDbError, NOTHING_CHANGED } from '../errors'
import { moment } from '../format'
import type { SignupRow } from '../map'
import { label } from '../plan'
import { loadGameContext } from './game-context'
import { loadGroup, myMemberId } from './common'
import { must, ToolError, type Db } from './run'
import { runWriteTool } from './write'

const TOKEN = z
  .string()
  .optional()
  .describe(
    'Leave out on the first call. Pass the confirmation_token from the preview only after the user has said yes.'
  )

const ADMIN_NOTE =
  'This is a game-admin action: it only works for the person running the game, and ' +
  'being a group owner does not change that. If the user is not the game admin, say ' +
  'so; do not try another way. '

const TWO_STEP =
  'It changes things other players see, so it takes two calls. First call without ' +
  'confirmation_token: it changes nothing and returns a preview and a ' +
  'confirmation_token. Show the preview to the user exactly as written and wait for ' +
  'an explicit yes. Only then call again with the same arguments plus the token. ' +
  'Never confirm on the user\'s behalf. '

const annotate = (destructive: boolean, idempotent: boolean) => ({
  readOnlyHint: false,
  destructiveHint: destructive,
  idempotentHint: idempotent,
  openWorldHint: false,
})

/** Is the caller the one game admin? Asked of the database, not worked out here. */
async function asksIsAdmin(db: Db, gameId: string): Promise<boolean> {
  const { data } = await db.rpc('can_admin_game', { g: gameId })
  return data === true
}

async function memberNames(db: Db, groupId: string) {
  const rows = must(
    await db
      .from('group_members')
      .select('id, display_name, is_active, profiles(display_name)')
      .eq('group_id', groupId)
  )
  return rows.map((m) => ({
    id: m.id,
    active: m.is_active,
    name: resolveDisplayName(m.display_name, m.profiles?.display_name),
  }))
}

const seatsTakenOf = (signups: SignupRow[], leftTable: number) =>
  Math.max(0, signups.filter((s) => s.status === 'confirmed').length - leftTable)

const waitlistCountOf = (signups: SignupRow[]) =>
  signups.filter((s) => s.status === 'waitlist').length

export function registerAdminTools(server: McpServer) {
  // ------------------------------------------------------------ create_game
  server.registerTool(
    'create_game',
    {
      title: 'Create a game',
      description:
        'Use this when the user wants to schedule a new game in one of their groups. ' +
        'date is YYYY-MM-DD and time is 24-hour HH:MM, both as the group will see them ' +
        '(read in the group\'s own timezone, not the user\'s). Seat limit, buy-in and chip ' +
        'ratio come from the group\'s settings, as in the app. The user becomes the game ' +
        'admin and, unless playing is false, takes a seat. ' +
        TWO_STEP +
        'The preview shows the date and time as the group will see them and the ' +
        'numbers it will use. Starting the game, buy-ins and settling are not available here.',
      inputSchema: z.object({
        group_id: z.uuid().describe('From list_my_groups.'),
        date: z.string().describe('YYYY-MM-DD, in the group\'s timezone.'),
        time: z.string().describe('24-hour HH:MM, in the group\'s timezone, like 20:00.'),
        location: z.string().max(200).optional(),
        name: z.string().max(80).optional(),
        seat_limit: z.number().int().min(2).max(30).optional().describe('Overrides the group default.'),
        playing: z.boolean().optional().describe('Take a seat yourself. Defaults to true.'),
        confirmation_token: TOKEN,
      }),
      annotations: annotate(false, false),
    },
    (args, ctx) =>
      runWriteTool({
        name: 'create_game',
        ctx,
        args: {
          group_id: args.group_id,
          date: args.date,
          time: args.time,
          location: args.location,
          name: args.name,
          seat_limit: args.seat_limit,
          playing: args.playing,
        },
        token: args.confirmation_token,
        plan: async ({ db }) => {
          const { data: group } = await db
            .from('groups')
            .select('id, name, timezone, default_seat_limit, default_buyin_cents, chips_per_dollar')
            .eq('id', args.group_id)
            .maybeSingle()
          if (!group) await loadGroup(db, args.group_id) // the standard "not a member" answer
          if (!group) throw new ToolError('Group not found.')

          const tz = group.timezone || DEFAULT_TIME_ZONE
          // A game already at exactly that time is worth a warning.
          let sameTimeGame: string | null = null
          const when = localToInstant(args.date, args.time, tz)
          if (when.ok) {
            const { data: same } = await db
              .from('games')
              .select('name, scheduled_at')
              .eq('group_id', group.id)
              .eq('scheduled_at', when.iso)
              .neq('status', 'cancelled')
              .limit(1)
            if (same && same.length > 0) sameTimeGame = same[0].name ?? 'unnamed'
          }

          const plan = planCreateGame({
            groupName: group.name,
            timezone: tz,
            date: args.date,
            time: args.time,
            name: args.name,
            location: args.location,
            defaults: {
              seatLimit: group.default_seat_limit,
              buyinCents: group.default_buyin_cents,
              chipsPerDollar: group.chips_per_dollar,
            },
            seatLimit: args.seat_limit,
            playing: args.playing ?? true,
            sameTimeGame,
            now: new Date(),
          })
          if (plan.kind !== 'confirm') return plan
          return { kind: 'confirm', text: plan.text, bind: plan.bind, data: plan.values }
        },
        commit: async ({ db }, v) => {
          // The new-game form's own call. The numbers are the ones the user
          // was shown, so the game's snapshot is what they approved even if
          // the group's defaults moved in between.
          const { data: gameId, error } = await db.rpc('create_game', {
            p_scheduled_at: v.scheduledAt,
            p_group_id: args.group_id,
            p_new_group_name: null,
            p_name: args.name ?? '',
            p_location: args.location ?? '',
            p_seat_limit: v.seatLimit,
            p_buyin_cents: v.buyinCents,
            p_chips_per_dollar: v.chipsPerDollar,
            p_playing: args.playing ?? true,
          })
          if (error || !gameId) throw new ToolError(friendlyDbError(error))
          const { data: g } = await db
            .from('groups')
            .select('timezone')
            .eq('id', args.group_id)
            .maybeSingle()
          return {
            game_id: gameId as string,
            scheduled_at: moment(v.scheduledAt, g?.timezone || DEFAULT_TIME_ZONE),
            message: 'Game created. You are the game admin.',
          }
        },
        afterCommit: async ({ db }, r) => {
          const { error } = await db.rpc('record_agent_action', {
            p_action: 'created_game',
            p_game_id: r.game_id,
          })
          if (error) throw error
        },
      })
  )

  // -------------------------------------------------------------- edit_game
  server.registerTool(
    'edit_game',
    {
      title: 'Edit a game',
      description:
        'Use this to change a game\'s date or time, location, name or seat limit. ' +
        ADMIN_NOTE +
        'Leave a field out to keep it; an empty string clears the name or location. ' +
        'Date and time are read in the group\'s timezone; give just one to move only that ' +
        'part. The date, time and seat limit can only change while the game is scheduled; ' +
        'once it has started only the name and location can. Raising the seat limit seats ' +
        'waitlisted players in order; lowering it below the number already confirmed is ' +
        'refused, and nobody is ever demoted. ' +
        TWO_STEP,
      inputSchema: z.object({
        game_id: z.uuid(),
        date: z.string().optional().describe('YYYY-MM-DD, in the group\'s timezone.'),
        time: z.string().optional().describe('24-hour HH:MM, in the group\'s timezone.'),
        location: z.string().max(200).optional(),
        name: z.string().max(80).optional(),
        seat_limit: z.number().int().min(1).max(30).optional(),
        confirmation_token: TOKEN,
      }),
      annotations: annotate(false, true),
    },
    (args, ctx) =>
      runWriteTool({
        name: 'edit_game',
        ctx,
        args: {
          game_id: args.game_id,
          date: args.date,
          time: args.time,
          location: args.location,
          name: args.name,
          seat_limit: args.seat_limit,
        },
        token: args.confirmation_token,
        plan: async ({ db, userId }) => {
          const g = await loadGameContext(db, userId, args.game_id)
          const plan = planEditGame({
            isAdmin: await asksIsAdmin(db, g.gameId),
            status: g.facts.status,
            timezone: g.facts.timezone,
            current: {
              scheduledAt: g.facts.scheduledAt,
              name: g.facts.name,
              location: g.location,
              seatLimit: g.facts.seatLimit,
            },
            confirmedCount: seatsTakenOf(g.signups, g.leftTable),
            waitlistCount: waitlistCountOf(g.signups),
            edits: {
              date: args.date,
              time: args.time,
              name: args.name,
              location: args.location,
              seatLimit: args.seat_limit,
            },
          })
          if (plan.kind !== 'confirm') return plan
          return { kind: 'confirm', text: plan.text, bind: plan.bind, data: plan.payload }
        },
        commit: async ({ db }, payload) => {
          // What the edit form does: update the changed columns. The trigger
          // on games decides what may change and when.
          const { data, error } = await db
            .from('games')
            .update(payload)
            .eq('id', args.game_id)
            .select('id')
          if (error) throw new ToolError(friendlyDbError(error))
          if (!data || data.length === 0) throw new ToolError(NOTHING_CHANGED)
          return { game_id: args.game_id, message: 'Game updated.' }
        },
        afterCommit: async ({ db }) => {
          const { error } = await db.rpc('record_agent_action', {
            p_action: 'edited_game',
            p_game_id: args.game_id,
          })
          if (error) throw error
        },
      })
  )

  // ------------------------------------------------------------- add_player
  server.registerTool(
    'add_player',
    {
      title: 'Add a player to a game',
      description:
        'Use this to put someone into a game: an existing group member (member_id from ' +
        'list_group_members) or a guest by name, who becomes a new member exactly as in the ' +
        'app. ' +
        ADMIN_NOTE +
        'It follows the app\'s seating: a seat if there is room, otherwise the waitlist. ' +
        'It never takes the table over its limit (seat_from_waitlist does that, after ' +
        'asking). A guest name that matches an existing member is refused with that ' +
        'member\'s id, so use member_id for them. ' +
        TWO_STEP,
      inputSchema: z.object({
        game_id: z.uuid(),
        member_id: z.uuid().optional().describe('From list_group_members.'),
        guest_name: z.string().max(80).optional().describe('A new guest. Not for existing members.'),
        confirmation_token: TOKEN,
      }),
      annotations: annotate(false, true),
    },
    (args, ctx) =>
      runWriteTool({
        name: 'add_player',
        ctx,
        args: {
          game_id: args.game_id,
          member_id: args.member_id,
          guest_name: args.guest_name?.trim() || undefined,
        },
        token: args.confirmation_token,
        plan: async ({ db, userId }) => {
          const g = await loadGameContext(db, userId, args.game_id)
          const people = await memberNames(db, g.groupId)
          const picked = args.member_id ? people.find((p) => p.id === args.member_id) : undefined
          const sg = args.member_id
            ? g.signups.find((s) => s.member_id === args.member_id)
            : undefined
          const waiting = g.signups
            .filter((s) => s.status === 'waitlist')
            .sort((a, b) => a.signup_order - b.signup_order)
          const plan = planAddPlayer({
            isAdmin: await asksIsAdmin(db, g.gameId),
            status: g.facts.status,
            gameLabel: label(g.facts),
            seatLimit: g.facts.seatLimit,
            seatsTaken: seatsTakenOf(g.signups, g.leftTable),
            waitlistCount: waiting.length,
            memberRequested: !!args.member_id,
            member: picked
              ? {
                  id: picked.id,
                  name: picked.name,
                  active: picked.active,
                  signup: sg?.status ?? null,
                  waitlistPosition: sg
                    ? waiting.findIndex((w) => w.member_id === sg.member_id) + 1 || null
                    : null,
                }
              : null,
            guestName: args.guest_name,
            activeMembers: people.filter((p) => p.active).map((p) => ({ id: p.id, name: p.name })),
          })
          return plan
        },
        commit: async ({ db, userId }) => {
          const g = await loadGameContext(db, userId, args.game_id)
          const guest = args.guest_name?.trim()
          const { data, error } = await db.rpc('add_player_to_game', {
            p_game_id: args.game_id,
            p_member_id: args.member_id ?? null,
            p_guest_name: args.member_id ? null : (guest ?? null),
          })
          if (error) throw new ToolError(friendlyDbError(error))

          // The guest's member row was just created: find it, for the label.
          let memberId = args.member_id ?? null
          if (!memberId && guest) {
            const { data: made } = await db
              .from('group_members')
              .select('id')
              .eq('group_id', g.groupId)
              .eq('display_name', guest)
              .order('created_at', { ascending: false })
              .limit(1)
            memberId = made?.[0]?.id ?? null
          }
          return {
            outcome: data === 'confirmed' ? 'seated' : 'waitlisted',
            member_id: memberId,
            message:
              data === 'confirmed' ? 'Added to the table.' : 'Table is full — added to the waitlist.',
          }
        },
        afterCommit: async ({ db }, r) => {
          if (!r.member_id) throw new Error('no member to label')
          const { error } = await db.rpc('record_agent_action', {
            p_action: 'added_player',
            p_game_id: args.game_id,
            p_target_member_id: r.member_id,
          })
          if (error) throw error
        },
      })
  )

  // ------------------------------------------------------ seat_from_waitlist
  server.registerTool(
    'seat_from_waitlist',
    {
      title: 'Seat someone from the waitlist',
      description:
        'Use this to move a waitlisted player into a seat. member_id comes from get_game ' +
        '(the waitlist) or list_group_members. ' +
        ADMIN_NOTE +
        'If the table is full, seating them takes it over the seat limit, which the app ' +
        'only does after asking: the preview then carries the app\'s own question, like ' +
        '"This game is full (8/8). Adding Dean will make it 9 players. Continue?". Show ' +
        'it to the user word for word and only commit after an explicit yes to exactly ' +
        'that. If the table changes before the yes, the confirmation stops working and ' +
        'you must preview again. ' +
        TWO_STEP,
      inputSchema: z.object({
        game_id: z.uuid(),
        member_id: z.uuid(),
        confirmation_token: TOKEN,
      }),
      annotations: annotate(false, true),
    },
    (args, ctx) =>
      runWriteTool({
        name: 'seat_from_waitlist',
        ctx,
        args: { game_id: args.game_id, member_id: args.member_id },
        token: args.confirmation_token,
        plan: async ({ db, userId }) => {
          const g = await loadGameContext(db, userId, args.game_id)
          const people = await memberNames(db, g.groupId)
          const who = people.find((p) => p.id === args.member_id)
          const sg = g.signups.find((s) => s.member_id === args.member_id)
          const plan = planSeatFromWaitlist({
            isAdmin: await asksIsAdmin(db, g.gameId),
            status: g.facts.status,
            gameLabel: label(g.facts),
            seatLimit: g.facts.seatLimit,
            seatsTaken: seatsTakenOf(g.signups, g.leftTable),
            name: who?.name ?? 'That player',
            signup: sg?.status ?? null,
          })
          if (plan.kind !== 'confirm') return plan
          return { kind: 'confirm', text: plan.text, bind: plan.bind, data: plan.bind.overfill }
        },
        commit: async ({ db }, overfill: boolean) => {
          // The waitlist panel's call. Overfill is only on when the user said
          // yes to the full-table question; the binding on the token means a
          // table that changed since then never gets here.
          const { error } = await db.rpc('promote_to_confirmed', {
            p_game_id: args.game_id,
            p_member_id: args.member_id,
            p_allow_overfill: overfill,
          })
          if (error) {
            if (/game is full/i.test(error.message)) {
              throw new ToolError('The table filled up first. Ask for a fresh preview.')
            }
            throw new ToolError(friendlyDbError(error))
          }
          return { member_id: args.member_id, message: overfill ? 'Seated, over the usual limit.' : 'Seated.' }
        },
        afterCommit: async ({ db }) => {
          const { error } = await db.rpc('record_agent_action', {
            p_action: 'seated_player',
            p_game_id: args.game_id,
            p_target_member_id: args.member_id,
          })
          if (error) throw error
        },
      })
  )

  // ------------------------------------------------------------ cancel_game
  server.registerTool(
    'cancel_game',
    {
      title: 'Cancel a game',
      description:
        'Use this to call a game off. It works for the game admin or the group owner. ' +
        'Cancelling keeps the roster, all buy-ins and the audit trail; it only means no ' +
        'settlement will be computed, and it cannot be undone in the app. A settled game ' +
        'cannot be cancelled, and neither can one with unpaid transfers. ' +
        TWO_STEP,
      inputSchema: z.object({ game_id: z.uuid(), confirmation_token: TOKEN }),
      annotations: annotate(true, true),
    },
    (args, ctx) =>
      runWriteTool({
        name: 'cancel_game',
        ctx,
        args: { game_id: args.game_id },
        token: args.confirmation_token,
        plan: async ({ db, userId }) => {
          const g = await loadGameContext(db, userId, args.game_id)
          const isAdmin = await asksIsAdmin(db, g.gameId)
          const isOwner = (await db.rpc('is_group_owner', { gid: g.groupId })).data === true
          const [totals, open] = await Promise.all([
            db
              .from('game_player_totals')
              .select('buyin_cents, buyin_count')
              .eq('game_id', g.gameId),
            // The admin sees every transfer; anyone else only their own, so
            // for an owner who is not the admin the database has the last word.
            db
              .from('settlements')
              .select('id')
              .eq('game_id', g.gameId)
              .in('status', ['pending', 'paid']),
          ])
          const t = must(totals)
          return planCancelGame({
            canCancel: isAdmin || isOwner,
            status: g.facts.status,
            gameLabel: label(g.facts),
            unpaidTransfers: must(open).length,
            buyinCount: t.reduce((n, r) => n + r.buyin_count, 0),
            buyinTotalCents: t.reduce((n, r) => n + r.buyin_cents, 0),
          })
        },
        commit: async ({ db }) => {
          const { error } = await db.rpc('cancel_game', { p_game_id: args.game_id })
          if (error) throw new ToolError(friendlyDbError(error))
          return { game_id: args.game_id, message: 'Game cancelled. The roster and buy-ins are kept.' }
        },
        afterCommit: async ({ db }) => {
          const { error } = await db.rpc('record_agent_action', {
            p_action: 'cancelled_game',
            p_game_id: args.game_id,
          })
          if (error) throw error
        },
      })
  )

  // -------------------------------------------------------- close_out_transfer
  server.registerTool(
    'close_out_transfer',
    {
      title: 'Close out a transfer',
      description:
        'Use this when a payee will not confirm a payment in the app and the game admin ' +
        'needs the debt closed. transfer_id comes from get_game for a game the user runs. ' +
        ADMIN_NOTE +
        'It cannot be used on a transfer the user is part of: the payer cannot close out ' +
        'their own debt, and a payee should use confirm_transfer_received. The transfer ' +
        'will show who closed it out rather than implying the payee confirmed it, and it ' +
        'cannot be undone. Only for settled games. This states that real money was ' +
        'settled, so only commit after the user says it really was or really will not be ' +
        'confirmed. ' +
        TWO_STEP,
      inputSchema: z.object({ transfer_id: z.uuid(), confirmation_token: TOKEN }),
      annotations: annotate(true, true),
    },
    (args, ctx) =>
      runWriteTool({
        name: 'close_out_transfer',
        ctx,
        args: { transfer_id: args.transfer_id },
        token: args.confirmation_token,
        plan: async ({ db, userId }) => {
          const { data: s } = await db
            .from('settlements')
            .select('id, game_id, from_member_id, to_member_id, amount_cents, status, kind')
            .eq('id', args.transfer_id)
            .maybeSingle()
          if (!s) {
            throw new ToolError(
              'Transfer not found, or it is not in a game you run. Call get_game for a game you run to see its transfer_ids.'
            )
          }
          const { data: game } = await db
            .from('games')
            .select('id, group_id, scheduled_at, started_at, groups(timezone)')
            .eq('id', s.game_id)
            .maybeSingle()
          if (!game) throw new ToolError('Transfer not found.')
          const mine = await myMemberId(db, game.group_id, userId)
          const names = await memberNames(db, game.group_id)
          const nameOf = (id: string) => names.find((n) => n.id === id)?.name ?? 'Someone'
          const tz = game.groups?.timezone ?? DEFAULT_TIME_ZONE
          return planCloseOut({
            isGameAdmin: await asksIsAdmin(db, s.game_id),
            role: settlementRole(
              { fromMemberId: s.from_member_id, toMemberId: s.to_member_id },
              mine
            ),
            status: s.status,
            kind: s.kind,
            amountCents: s.amount_cents,
            payerName: nameOf(s.from_member_id),
            payeeName: nameOf(s.to_member_id),
            gameDay: formatTime(game.started_at ?? game.scheduled_at, tz, 'day'),
          })
        },
        commit: async ({ db }) => {
          // The close-out button: the same status update the payee would
          // make. The trigger records who closed it out.
          const { data, error } = await db
            .from('settlements')
            .update({ status: 'confirmed' })
            .eq('id', args.transfer_id)
            .in('status', ['pending', 'paid'])
            .select('id')
          if (error) throw new ToolError(friendlyDbError(error))
          if (!data || data.length === 0) throw new ToolError(NOTHING_CHANGED)
          return {
            transfer_id: args.transfer_id,
            status: 'confirmed',
            message: 'Closed out. It shows as closed out by you, not as confirmed by the payee.',
          }
        },
        afterCommit: async ({ db }) => {
          const { error } = await db.rpc('record_agent_action', {
            p_action: 'closed_out',
            p_settlement_id: args.transfer_id,
          })
          if (error) throw error
        },
      })
  )
}
