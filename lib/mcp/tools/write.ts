// The shape every confirmed write takes.
//
//   call 1, no token  → read the facts, say what would happen, hand back a
//                       short-lived token. Nothing changes.
//   call 2, token     → check the token, re-read the facts, spend the token,
//                       and do the write through the same path the app uses.
//
// The token is how the server knows the user was shown this exact action. It
// is bound to them, the tool and the arguments, it expires, and the database
// refuses to take it twice. The tool descriptions tell the agent to wait for
// a real yes; this is what makes that more than a request.

import type { ServerContext } from '@modelcontextprotocol/server'
import {
  CONFIRMATION_TTL_MS,
  TOKEN_FAILURE_MESSAGE,
  issueToken,
  verifyToken,
} from '../confirm'
import { consumeConfirmation, enforceRate } from './gate'
import { runTool, ToolError, type ToolContext } from './run'

export type WritePlan =
  | { kind: 'already'; text: string }
  | { kind: 'refuse'; reason: string }
  | { kind: 'confirm'; text: string }

function secret(): string {
  const s = process.env.MCP_CONFIRM_SECRET
  if (!s) {
    // Fail closed: without a signing key there is no way to prove a yes.
    throw new ToolError(
      'Changes through an AI app are not switched on for this server yet.'
    )
  }
  return s
}

export function runWriteTool<R extends Record<string, unknown>>(opts: {
  name: string
  ctx: ServerContext
  /** Exactly the arguments that decide what the action does. Not the token. */
  args: Record<string, unknown>
  token: string | undefined
  plan: (tool: ToolContext) => Promise<WritePlan>
  /** The write itself, through the path the app uses. Throws ToolError. */
  commit: (tool: ToolContext) => Promise<R>
  /** Runs after a successful commit, to record that an agent did it. */
  afterCommit?: (tool: ToolContext, result: R) => Promise<void>
}) {
  return runTool(opts.name, opts.ctx, async (tool) => {
    const committing = !!opts.token
    tool.setPhase(committing ? 'commit' : 'preview')
    await enforceRate(tool.db, committing ? 'commit' : 'preview')

    const key = secret()
    const now = Date.now()

    let verified: { jti: string; expiresAt: number } | null = null
    if (opts.token) {
      const check = verifyToken({
        secret: key,
        token: opts.token,
        userId: tool.userId,
        tool: opts.name,
        args: opts.args,
        now,
      })
      if (!check.ok) throw new ToolError(TOKEN_FAILURE_MESSAGE[check.reason])
      verified = check
    }

    // Facts are read fresh on both calls: what was true at preview may not be
    // true a minute later, and the database decides in the end regardless.
    const plan = await opts.plan(tool)

    if (plan.kind === 'refuse') throw new ToolError(plan.reason)
    if (plan.kind === 'already') {
      return { changed: false, message: plan.text }
    }

    if (!verified) {
      const { token, expiresAt } = issueToken({
        secret: key,
        userId: tool.userId,
        tool: opts.name,
        args: opts.args,
        now,
      })
      return {
        needs_confirmation: true,
        preview: plan.text,
        confirmation_token: token,
        expires_in_seconds: Math.round((expiresAt - now) / 1000),
        next_step:
          'Show the preview to the user exactly as written and wait for an explicit yes. ' +
          `Only then call ${opts.name} again with the same arguments plus confirmation_token. ` +
          'Do not confirm on their behalf, and do not assume it happened.',
      }
    }

    if (!(await consumeConfirmation(tool.db, verified.jti, verified.expiresAt))) {
      throw new ToolError(
        'That confirmation was already used or has expired. Call the tool again without a token to start over.'
      )
    }

    const result = await opts.commit(tool)

    // The write has happened. Labelling it as the agent's is a second call; if
    // that fails, say so rather than pretend, and rather than undo the write.
    let marked = true
    if (opts.afterCommit) {
      try {
        await opts.afterCommit(tool, result)
      } catch {
        try {
          await opts.afterCommit(tool, result)
        } catch {
          marked = false
        }
      }
    }
    return {
      changed: true,
      ...result,
      ...(marked
        ? {}
        : {
            warning:
              'This was done, but it could not be labelled as made through an AI app, so other players will not see that label. Tell the user.',
          }),
    }
  })
}

export { CONFIRMATION_TTL_MS }
