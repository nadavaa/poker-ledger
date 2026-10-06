import type { McpServer } from '@modelcontextprotocol/server'
import { z } from 'zod'
import { settlementRole } from '../../settlements'
import { resolveDisplayName } from '../../names'
import { DEFAULT_TIME_ZONE, formatTime } from '../../time'
import { friendlyDbError, NOTHING_CHANGED } from '../errors'
import { planConfirmReceived, planMarkPaid, type TransferFacts } from '../plan'
import { ToolError, type Db } from './run'
import { runWriteTool } from './write'

const TOKEN = z
  .string()
  .optional()
  .describe(
    'Leave out on the first call. Pass the confirmation_token from the preview only after the user has said yes.'
  )

const NO_SUCH_TRANSFER =
  'Transfer not found, or it is not yours to act on. Call get_outstanding_debt for valid transfer_ids.'

/** One transfer, as the user sees it, with their side of it worked out. */
async function loadTransfer(db: Db, userId: string, transferId: string) {
  // Row-level security returns a transfer only to its two parties and the
  // game admin, so a transfer between other people is simply not found.
  const { data: s } = await db
    .from('settlements')
    .select('id, game_id, from_member_id, to_member_id, amount_cents, status, kind')
    .eq('id', transferId)
    .maybeSingle()
  if (!s) throw new ToolError(NO_SUCH_TRANSFER)

  const { data: game } = await db
    .from('games')
    .select('id, group_id, scheduled_at, started_at, groups(timezone)')
    .eq('id', s.game_id)
    .maybeSingle()
  if (!game) throw new ToolError(NO_SUCH_TRANSFER)

  const { data: mine } = await db
    .from('group_members')
    .select('id')
    .eq('group_id', game.group_id)
    .eq('profile_id', userId)
    .limit(1)
  const myMemberId = mine?.[0]?.id ?? null

  const role = settlementRole(
    { fromMemberId: s.from_member_id, toMemberId: s.to_member_id },
    myMemberId
  )
  const otherId = role === 'payee' ? s.from_member_id : s.to_member_id
  const { data: other } = await db
    .from('group_members')
    .select('display_name, profiles(display_name)')
    .eq('id', otherId)
    .maybeSingle()

  const tz = game.groups?.timezone ?? DEFAULT_TIME_ZONE
  const facts: TransferFacts = {
    kind: s.kind,
    amountCents: s.amount_cents,
    status: s.status,
    counterparty: resolveDisplayName(
      other?.display_name,
      other?.profiles?.display_name
    ),
    gameDay: formatTime(game.started_at ?? game.scheduled_at, tz, 'day'),
    role,
  }
  return { id: s.id, facts }
}

export function registerTransferTools(server: McpServer) {
  server.registerTool(
    'mark_transfer_paid',
    {
      title: 'Mark a transfer as paid',
      description:
        'Use this only when the user says they have paid someone what they owe from a ' +
        'settled game. It records the payer\'s half of the payment handshake; the ' +
        'person being paid then confirms receipt. transfer_id comes from ' +
        'get_outstanding_debt. This states that real money moved, so it takes two ' +
        'calls. First call with just transfer_id: it changes nothing and returns a ' +
        'preview and a confirmation_token. Show the preview to the user and wait for ' +
        'an explicit yes that they sent the money. Only then call again with the same ' +
        'transfer_id plus confirmation_token. Never confirm on the user\'s behalf, and ' +
        'never infer that a payment happened. Only the person who owes the transfer ' +
        'can use it. It does not send any money: Poker Ledger moves none.',
      inputSchema: z.object({ transfer_id: z.uuid(), confirmation_token: TOKEN }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    (args, ctx) =>
      runWriteTool({
        name: 'mark_transfer_paid',
        ctx,
        args: { transfer_id: args.transfer_id },
        token: args.confirmation_token,
        afterCommit: async ({ db }) => {
          const { error } = await db.rpc('record_agent_action', {
            p_action: 'marked_paid',
            p_settlement_id: args.transfer_id,
          })
          if (error) throw error
        },
        plan: async ({ db, userId }) =>
          planMarkPaid((await loadTransfer(db, userId, args.transfer_id)).facts),
        commit: async ({ db }) => {
          // What the Paid button does. The handshake trigger allows only the
          // payer, only from pending; the condition makes it atomic.
          const { data, error } = await db
            .from('settlements')
            .update({ status: 'paid' })
            .eq('id', args.transfer_id)
            .eq('status', 'pending')
            .select('id')
          if (error) throw new ToolError(friendlyDbError(error))
          if (!data || data.length === 0) throw new ToolError(NOTHING_CHANGED)
          return {
            transfer_id: args.transfer_id,
            status: 'paid',
            message:
              'Marked as paid. It stays open until the person you paid confirms they received it.',
          }
        },
      })
  )

  server.registerTool(
    'confirm_transfer_received',
    {
      title: 'Confirm a transfer was received',
      description:
        'Use this only when the user says they have actually received money they were ' +
        'owed from a settled game. It records the payee\'s half of the handshake and ' +
        'closes the debt. This cannot be undone, and it states that real money ' +
        'arrived, so it takes two calls. First call with just transfer_id: it changes ' +
        'nothing and returns a preview and a confirmation_token. Show the preview to ' +
        'the user and wait for an explicit yes that the money arrived. Only then call ' +
        'again with the same transfer_id plus confirmation_token. Never confirm on ' +
        'the user\'s behalf, and never infer that a payment arrived, even if the payer ' +
        'marked it paid. Like the app, it works whether or not the payer marked it ' +
        'paid first. Only the person being paid can use it. transfer_id comes from ' +
        'get_outstanding_debt.',
      inputSchema: z.object({ transfer_id: z.uuid(), confirmation_token: TOKEN }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    (args, ctx) =>
      runWriteTool({
        name: 'confirm_transfer_received',
        ctx,
        args: { transfer_id: args.transfer_id },
        token: args.confirmation_token,
        afterCommit: async ({ db }) => {
          const { error } = await db.rpc('record_agent_action', {
            p_action: 'confirmed_received',
            p_settlement_id: args.transfer_id,
          })
          if (error) throw error
        },
        plan: async ({ db, userId }) =>
          planConfirmReceived((await loadTransfer(db, userId, args.transfer_id)).facts),
        commit: async ({ db }) => {
          // What the Confirm button does. The trigger allows the payee, from
          // pending or paid, and stamps who confirmed and when.
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
            message: 'Confirmed. That debt is closed.',
          }
        },
      })
  )
}
