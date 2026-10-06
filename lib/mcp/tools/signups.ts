import type { McpServer } from '@modelcontextprotocol/server'
import { z } from 'zod'
import { joinNotice, type JoinOutcome } from '../../game-join'
import { formatTime } from '../../time'
import { friendlyDbError, NOTHING_CHANGED } from '../errors'
import { planJoinAction, planWithdrawAction } from '../plan'
import { loadGameContext } from './game-context'
import { ToolError } from './run'
import { runWriteTool } from './write'

const TOKEN = z
  .string()
  .optional()
  .describe(
    'Leave out on the first call. Pass the confirmation_token from the preview only after the user has said yes.'
  )

export function registerSignupTools(server: McpServer) {
  server.registerTool(
    'join_game',
    {
      title: 'Join a game',
      description:
        'Use this when the user asks to sign up for a game, or to join its waitlist. ' +
        'It works only for games in groups the user already belongs to. This changes ' +
        'who is seated, so it takes two calls. First call with just game_id: it ' +
        'changes nothing and returns a preview and a confirmation_token. Show the ' +
        'preview to the user and wait for an explicit yes. Only then call again with ' +
        'the same game_id plus confirmation_token. Never confirm on the user\'s ' +
        'behalf. The outcome follows the game link: seated if there is room, ' +
        'waitlisted with a position if the game is full, queued for the admin to seat ' +
        'if the game is already running, and refused if it is settled, cancelled or ' +
        'being counted. If the user is already signed up it says so and changes ' +
        'nothing, so repeating it is safe. It cannot add anyone else, and it cannot ' +
        'seat someone over the limit.',
      inputSchema: z.object({ game_id: z.uuid(), confirmation_token: TOKEN }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    (args, ctx) =>
      runWriteTool({
        name: 'join_game',
        ctx,
        args: { game_id: args.game_id },
        token: args.confirmation_token,
        plan: async ({ db, userId }) => {
          const g = await loadGameContext(db, userId, args.game_id)
          const plan = planJoinAction({
            game: g.facts,
            signups: g.signups,
            leftTable: g.leftTable,
            myMemberId: g.myMemberId,
          })
          return plan.kind === 'refuse'
            ? { kind: 'refuse', reason: plan.reason }
            : { kind: plan.kind, text: plan.text }
        },
        afterCommit: async ({ db }, result) => {
          // Only a signup that now exists is worth a label; "already" and
          // "over" changed nothing.
          if (!['confirmed', 'waitlisted', 'needs_approval'].includes(String(result.outcome))) return
          const { error } = await db.rpc('record_agent_action', {
            p_action: 'joined',
            p_game_id: args.game_id,
          })
          if (error) throw error
        },
        commit: async ({ db, userId }) => {
          const g = await loadGameContext(db, userId, args.game_id)
          // The same function the shared game link calls. Safe to reach only
          // because plan() has already proved the game is in one of this
          // user's groups; on its own it would add them to the group.
          const { data, error } = await db
            .rpc('join_game_by_link', { p_game_id: args.game_id })
            .maybeSingle()
          if (error || !data) throw new ToolError(friendlyDbError(error))

          const outcome = data.outcome as JoinOutcome
          const notice = joinNotice(outcome, {
            groupName: data.group_name,
            when: formatTime(data.scheduled_at, g.facts.timezone, 'when'),
            position: data.waitlist_position,
          })
          return {
            outcome,
            waitlist_position: data.waitlist_position,
            message:
              notice?.title ??
              (outcome === 'over'
                ? 'That game is no longer open to new players.'
                : 'You are already signed up.'),
            detail: notice?.detail ?? null,
          }
        },
      })
  )

  server.registerTool(
    'withdraw_from_game',
    {
      title: 'Withdraw from a game',
      description:
        'Use this when the user asks to drop out of a game they signed up for, or to ' +
        'leave its waitlist. This gives up a seat, so it takes two calls. First call ' +
        'with just game_id: it changes nothing and returns a preview and a ' +
        'confirmation_token. Show the preview to the user and wait for an explicit ' +
        'yes. Only then call again with the same game_id plus confirmation_token. ' +
        'Never confirm on the user\'s behalf. When a seat opens, the next person on the ' +
        'waitlist moves up automatically; signing up again later puts the user at the ' +
        'back of the line. It follows the database: allowed while the game is ' +
        'scheduled, or running if the user has no buy-in in the pot yet, and refused ' +
        'once their money is in or the game is being counted or over. If the user is ' +
        'not signed up it says so and changes nothing.',
      inputSchema: z.object({ game_id: z.uuid(), confirmation_token: TOKEN }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    (args, ctx) =>
      runWriteTool({
        name: 'withdraw_from_game',
        ctx,
        args: { game_id: args.game_id },
        token: args.confirmation_token,
        plan: async ({ db, userId }) => {
          const g = await loadGameContext(db, userId, args.game_id)
          // The database's own answer, not a copy of its rule.
          const allowed = g.myMemberId
            ? ((await db.rpc('can_withdraw_from_game', {
                gid: g.gameId,
                mid: g.myMemberId,
              })).data ?? false)
            : false
          return planWithdrawAction({
            game: g.facts,
            signups: g.signups,
            myMemberId: g.myMemberId,
            databaseAllows: allowed,
          })
        },
        afterCommit: async ({ db }) => {
          const { error } = await db.rpc('record_agent_action', {
            p_action: 'withdrew',
            p_game_id: args.game_id,
          })
          if (error) throw error
        },
        commit: async ({ db, userId }) => {
          const g = await loadGameContext(db, userId, args.game_id)
          if (!g.myMemberId) throw new ToolError(NOTHING_CHANGED)

          // What the Withdraw button does: set the signup to withdrawn. A
          // trigger frees the seat and promotes the waitlist; a policy
          // refuses it once the player's money is in the pot. RLS filters
          // rather than raises, so count the rows.
          const { data, error } = await db
            .from('game_signups')
            .update({ status: 'withdrawn' })
            .eq('game_id', g.gameId)
            .eq('member_id', g.myMemberId)
            .neq('status', 'withdrawn')
            .select('id')
          if (error) throw new ToolError(friendlyDbError(error))
          if (!data || data.length === 0) throw new ToolError(NOTHING_CHANGED)

          return {
            outcome: 'withdrawn',
            message: `You have withdrawn from ${g.facts.name ?? 'the game'} — ${g.facts.groupName}.`,
          }
        },
      })
  )
}
