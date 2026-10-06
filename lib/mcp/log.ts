// One line per tool call so adoption can be measured: who, which tool, did it
// work, how long. Never arguments, never amounts, never error text.
//
// Written as the user, through log_mcp_call(). The service role is not
// involved, and a failure to log never fails a tool call.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../supabase/types'

export async function recordToolCall(
  _supabase: SupabaseClient<Database>,
  _call: { tool: string; ok: boolean; latencyMs: number }
): Promise<void> {
  // Wired up once the log_mcp_call migration is applied.
}
