import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { recordToolCall } from './log'

// The two promises in the MCP brief that no unit test of behaviour can keep:
// the agent's code path never holds the service-role key, and the call log
// never carries arguments.

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sources(path)
    return /\.(ts|tsx)$/.test(name) && !name.endsWith('.test.ts') ? [path] : []
  })
}

describe('the MCP code path', () => {
  const files = [
    ...sources('lib/mcp'),
    ...sources('app/api/mcp'),
    ...sources('app/oauth'),
    ...sources('app/.well-known'),
  ]

  it('finds the files it is meant to guard', () => {
    expect(files.length).toBeGreaterThan(8)
  })

  it('never touches the service role or the admin client', () => {
    for (const file of files) {
      const text = readFileSync(file, 'utf8')
      expect(text, file).not.toMatch(/SERVICE_ROLE|SUPABASE_SECRET_KEY/)
      expect(text, file).not.toMatch(/createAdminClient|supabase\/admin/)
    }
  })

  it('writes only where it is meant to', () => {
    // The player actions go through the same table updates the UI makes
    // (withdraw, mark paid, confirm). Nothing inserts, deletes or upserts, and
    // no other table is touched.
    const writes = new Set<string>()
    for (const file of files) {
      const text = readFileSync(file, 'utf8')
      for (const m of text.matchAll(
        /\.from\('([a-z_]+)'\)[\s\S]{0,400}?\.(insert|update|delete|upsert)\(/g
      )) {
        writes.add(`${m[1]}.${m[2]}`)
      }
    }
    expect([...writes].sort()).toEqual(['game_signups.update', 'settlements.update'])
  })

  it('calls only the database functions it is meant to', () => {
    const rpcs = files.flatMap((f) =>
      [...readFileSync(f, 'utf8').matchAll(/\.rpc\(\s*'([a-z_]+)'/g)].map(
        (m) => m[1]
      )
    )
    expect(new Set(rpcs)).toEqual(
      new Set([
        // reads
        'game_payment_details',
        // the same functions the app calls for these actions
        'join_game_by_link',
        'can_withdraw_from_game',
        'set_my_payment_details',
        'my_payment_details',
        // bookkeeping
        'log_mcp_call',
        'mcp_consume_confirmation',
        'mcp_rate_counts',
        'record_agent_action',
      ])
    )
  })
})

describe('recordToolCall', () => {
  it('sends the tool, the outcome and the latency, and nothing else', async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null })
    await recordToolCall({ rpc } as never, {
      tool: 'get_game',
      ok: false,
      latencyMs: 12.7,
    })
    expect(rpc).toHaveBeenCalledWith('log_mcp_call', {
      p_tool: 'get_game',
      p_ok: false,
      p_latency_ms: 13,
      p_phase: 'read',
    })
  })

  it('records whether it was a preview or a commit, and still nothing else', async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null })
    await recordToolCall({ rpc } as never, {
      tool: 'mark_transfer_paid',
      ok: true,
      latencyMs: 4,
      phase: 'commit',
    })
    expect(Object.keys(rpc.mock.calls[0][1]).sort()).toEqual([
      'p_latency_ms',
      'p_ok',
      'p_phase',
      'p_tool',
    ])
  })
})
