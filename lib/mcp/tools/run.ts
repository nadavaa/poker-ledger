import type { CallToolResult, ServerContext } from '@modelcontextprotocol/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { callerOf, userClient } from '../auth'
import { recordToolCall } from '../log'
import type { Database } from '../../supabase/types'

/** A mistake the agent can act on. Its message is shown as written. */
export class ToolError extends Error {}

export type Db = SupabaseClient<Database>
export type Phase = 'read' | 'preview' | 'commit'

export type ToolContext = {
  db: Db
  userId: string
  /** Writes say which half of the two-step this call turned out to be. */
  setPhase: (phase: Phase) => void
}

/**
 * Every tool goes through here: authenticate, run as the user, time it, log
 * it, and turn any failure into one short sentence.
 *
 * Anything that is not a ToolError is reported generically. A raw database
 * message can name a table or a policy, and it is no more use to an agent
 * than "try again".
 */
export async function runTool(
  name: string,
  ctx: ServerContext,
  fn: (tool: ToolContext) => Promise<unknown>
): Promise<CallToolResult> {
  const started = Date.now()
  let ok = true
  let phase: Phase = 'read'
  let db: Db | null = null
  try {
    const caller = callerOf(ctx.http?.authInfo)
    db = userClient(caller.token)
    const result = await fn({
      db,
      userId: caller.userId,
      setPhase: (p) => {
        phase = p
      },
    })
    return { content: [{ type: 'text', text: JSON.stringify(result) }] }
  } catch (error) {
    ok = false
    const message =
      error instanceof ToolError
        ? error.message
        : 'Poker Ledger could not load that right now. Try again in a moment.'
    return { isError: true, content: [{ type: 'text', text: message }] }
  } finally {
    if (db) {
      await recordToolCall(db, {
        tool: name,
        ok,
        latencyMs: Date.now() - started,
        phase,
      }).catch(() => {})
    }
  }
}

/** Unwrap a Supabase result, or fail the call without leaking the cause. */
export function must<T>(result: { data: T | null; error: unknown }): T {
  if (result.error || result.data === null) {
    throw new Error('database read failed')
  }
  return result.data
}
