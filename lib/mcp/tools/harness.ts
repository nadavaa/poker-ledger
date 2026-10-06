// A fake database and a fake MCP server, so the write tools can be run end to
// end in a test: preview, token, commit, refusal. Test-only.

import { vi } from 'vitest'

export type Result = { data: unknown; error: unknown }

export type FakeConfig = {
  /** Rows a select on each table returns. maybeSingle() takes the first. */
  tables?: Record<string, unknown[] | ((eq: Record<string, unknown>) => unknown[])>
  /** What an update on a table returns (a row per row it changed). */
  updates?: Record<string, Result>
  rpc?: Record<string, (args: Record<string, unknown>) => Result>
}

export function makeFakeDb(config: FakeConfig) {
  const calls: { kind: 'update' | 'rpc'; name: string; args: unknown }[] = []
  const used = new Set<string>()

  const chain = (table: string) => {
    let op: 'select' | 'update' = 'select'
    const eqs: Record<string, unknown> = {}
    const c: Record<string, unknown> = {}
    const self = () => c
    for (const m of ['select', 'neq', 'in', 'order', 'limit', 'or']) {
      c[m] = self
    }
    c.eq = (col: string, value: unknown) => {
      eqs[col] = value
      return c
    }
    c.update = (patch: unknown) => {
      op = 'update'
      calls.push({ kind: 'update', name: table, args: patch })
      return c
    }
    const resolve = (): Result =>
      op === 'update'
        ? (config.updates?.[table] ?? { data: [{ id: 'row' }], error: null })
        : {
            data: (() => {
              const t = config.tables?.[table]
              return typeof t === 'function' ? t(eqs) : (t ?? [])
            })(),
            error: null,
          }
    c.maybeSingle = async () => {
      const r = resolve()
      return { data: Array.isArray(r.data) ? (r.data[0] ?? null) : r.data, error: r.error }
    }
    c.then = (ok: (r: Result) => unknown, bad: (e: unknown) => unknown) =>
      Promise.resolve(resolve()).then(ok, bad)
    return c
  }

  const rpc = (name: string, args: Record<string, unknown> = {}) => {
    calls.push({ kind: 'rpc', name, args })
    let result: Result
    if (name === 'mcp_consume_confirmation') {
      // The real function: true exactly once per token id.
      const jti = String(args.p_jti)
      result = used.has(jti)
        ? { data: false, error: null }
        : (used.add(jti), { data: true, error: null })
    } else if (name === 'mcp_rate_counts') {
      result = { data: [{ commits: 0, previews: 0 }], error: null }
    } else if (config.rpc?.[name]) {
      result = config.rpc[name](args)
    } else {
      result = { data: null, error: null }
    }
    const p = Promise.resolve(result) as Promise<Result> & {
      maybeSingle: () => Promise<Result>
    }
    p.maybeSingle = async () => ({
      data: Array.isArray(result.data) ? (result.data[0] ?? null) : result.data,
      error: result.error,
    })
    return p
  }

  return { db: { from: chain, rpc }, calls }
}

/** A stand-in for server.registerTool that keeps the handlers. */
export function fakeServer() {
  const handlers = new Map<string, (args: never, ctx: never) => Promise<unknown>>()
  const server = {
    registerTool: (name: string, _config: unknown, handler: never) => {
      handlers.set(name, handler)
    },
  }
  return { server: server as never, handlers }
}

export const CTX = { http: { authInfo: { token: 't', extra: { userId: 'u1' } } } } as never

type ToolResult = { isError?: boolean; content: { text: string }[] }

export async function call(
  handlers: Map<string, (args: never, ctx: never) => Promise<unknown>>,
  name: string,
  args: Record<string, unknown>
) {
  const r = (await handlers.get(name)!(args as never, CTX)) as ToolResult
  const text = r.content[0].text
  let json: Record<string, unknown> | null = null
  try {
    json = JSON.parse(text)
  } catch {
    // an error sentence
  }
  return { isError: !!r.isError, text, json }
}

/** Both the auth module and the secret, the two things the tools reach for. */
export function mockAuth(db: unknown) {
  vi.doMock('../auth', () => ({
    callerOf: () => ({ userId: 'u1', token: 't' }),
    userClient: () => db,
  }))
  process.env.MCP_CONFIRM_SECRET = 'test-secret-for-tools'
}
