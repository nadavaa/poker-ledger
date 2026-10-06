// One line per tool call so adoption can be measured: who, which tool, did it
// work, how long. Never arguments, never amounts, never error text.
//
// Written as the user, through log_mcp_call(), which stamps their id itself.
// The service role is not involved, and a failure to log never fails a tool
// call.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../supabase/types'

export async function recordToolCall(
  supabase: SupabaseClient<Database>,
  call: {
    tool: string
    ok: boolean
    latencyMs: number
    /** A read, the preview half of a write, or the commit half. */
    phase?: 'read' | 'preview' | 'commit'
  }
): Promise<void> {
  await supabase.rpc('log_mcp_call', {
    p_tool: call.tool,
    p_ok: call.ok,
    p_latency_ms: Math.max(0, Math.round(call.latencyMs)),
    p_phase: call.phase ?? 'read',
  })
}
