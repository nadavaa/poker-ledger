import type { McpServer } from '@modelcontextprotocol/server'
import { z } from 'zod'
import { handleProblem, normalizeHandle } from '../../venmo'
import { parseUsPhone } from '../../payment'
import { friendlyDbError } from '../errors'
import { enforceRate } from './gate'
import { runTool, ToolError } from './run'

/** "ending 4567". The whole number is never put in an answer. */
export function lastFour(e164: string | null): string | null {
  if (!e164) return null
  const digits = e164.replace(/\D/g, '')
  return digits.length >= 4 ? `ending ${digits.slice(-4)}` : null
}

export function registerPaymentHandleTool(server: McpServer) {
  server.registerTool(
    'update_payment_handle',
    {
      title: 'Update my Venmo or Zelle details',
      description:
        'Use this when the user wants to set or change how they get paid: their Venmo ' +
        'handle, their Zelle phone number, or both. Same rules as Settings: a Venmo ' +
        'handle is accepted with or without the @ and saved without it, and the phone ' +
        'must be a 10-digit US number. Leave a field out to keep what is saved; pass ' +
        'an empty string to remove it. It saves immediately, with no confirmation ' +
        'step, and the answer says what was saved so you can tell the user. For ' +
        'privacy the answer shows only the last four digits of a phone number: do not ' +
        'repeat the full number back. It changes only the user\'s own details.',
      inputSchema: z.object({
        venmo: z.string().max(60).optional().describe('Venmo handle, with or without @. Empty string removes it.'),
        zelle_phone: z.string().max(30).optional().describe('10-digit US phone for Zelle. Empty string removes it.'),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    (args, ctx) =>
      runTool('update_payment_handle', ctx, async (tool) => {
        tool.setPhase('commit')
        await enforceRate(tool.db, 'commit')

        if (args.venmo === undefined && args.zelle_phone === undefined) {
          throw new ToolError('Give a venmo handle, a zelle_phone, or both.')
        }

        // The same validation Settings runs.
        const problem = args.venmo === undefined ? null : handleProblem(args.venmo)
        if (problem) throw new ToolError(problem)
        const phone =
          args.zelle_phone === undefined ? null : parseUsPhone(args.zelle_phone)
        if (phone && !phone.valid) {
          throw new ToolError(
            'That is not a valid US phone number. Use 10 digits, like (212) 555-0123.'
          )
        }

        // set_my_payment_details replaces all three fields at once, so what
        // the user did not mention has to be read and sent back unchanged.
        // The existing phone is held only to be sent back; it is not returned.
        const { data: current, error: readError } = await tool.db
          .rpc('my_payment_details')
          .maybeSingle()
        if (readError) throw new ToolError(friendlyDbError(readError))

        const venmo =
          args.venmo === undefined
            ? (current?.venmo_handle ?? null)
            : normalizeHandle(args.venmo)
        const zelle =
          phone === null ? (current?.phone_number ?? null) : phone.value

        const { error } = await tool.db.rpc('set_my_payment_details', {
          p_venmo_handle: venmo,
          p_phone: zelle,
          p_preferred: current?.preferred_payment_method ?? null,
        })
        if (error) throw new ToolError(friendlyDbError(error))

        return {
          saved: true,
          venmo: venmo,
          zelle: lastFour(zelle),
          message:
            [
              args.venmo !== undefined &&
                (venmo ? `Venmo saved as ${venmo}.` : 'Venmo removed.'),
              args.zelle_phone !== undefined &&
                (zelle ? `Zelle saved, ${lastFour(zelle)}.` : 'Zelle removed.'),
            ]
              .filter(Boolean)
              .join(' '),
        }
      })
  )
}
