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

  it('does not write: no insert, update, delete or upsert on a table', () => {
    for (const file of files) {
      const text = readFileSync(file, 'utf8')
      expect(text, file).not.toMatch(/\.(insert|update|delete|upsert)\(/)
    }
  })

  it('only calls the one write-shaped RPC, the call log', () => {
    const rpcs = files.flatMap((f) =>
      [...readFileSync(f, 'utf8').matchAll(/\.rpc\(\s*'([a-z_]+)'/g)].map(
        (m) => m[1]
      )
    )
    expect(new Set(rpcs)).toEqual(
      new Set(['game_payment_details', 'log_mcp_call'])
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
    })
  })
})
