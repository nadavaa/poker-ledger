import { describe, expect, it } from 'vitest'
import { registerTools } from '../server'
import { html } from './generated/app'
import { appOrigin } from './origin'
import { APP_URI, appPage, pictureDomains } from './register'

// A recording stand-in for the MCP server: what gets registered, not what runs.
function record() {
  const tools = new Map<string, { _meta?: Record<string, unknown>; description?: string; inputSchema?: unknown }>()
  const resources = new Map<string, { config: Record<string, unknown>; read: (u: URL) => Promise<unknown> }>()
  const server = {
    registerTool: (name: string, config: { _meta?: Record<string, unknown>; description?: string; inputSchema?: unknown }) => {
      tools.set(name, config)
      return {}
    },
    registerResource: (_n: string, uri: string, config: Record<string, unknown>, read: (u: URL) => Promise<unknown>) => {
      resources.set(uri, { config, read })
      return {}
    },
  }
  return { server, tools, resources }
}

describe('view registration', () => {
  const { server, tools, resources } = record()
  registerTools(server as never)

  // Each lookup has a twin that draws the screen: same data, bound to the page.
  const PAIRS: [string, string][] = [
    ['list_my_groups', 'show_groups'],
    ['list_games', 'show_group'],
    ['get_game', 'show_game'],
    ['get_my_stats', 'show_my_stats'],
    ['get_my_balances', 'show_balances'],
    ['get_outstanding_debt', 'show_outstanding_debt'],
  ]

  it('binds the page to the display tools, and only to them', () => {
    const linked = [...tools].filter(([, c]) => c._meta?.ui).map(([n]) => n).sort()
    expect(linked).toEqual(PAIRS.map(([, show]) => show).sort())
    for (const [, show] of PAIRS) {
      expect(tools.get(show)!._meta).toMatchObject({ ui: { resourceUri: APP_URI } })
    }
  })

  it('keeps every data tool free of the page, so a lookup never draws a screen', () => {
    for (const [data] of PAIRS) {
      expect(tools.has(data), data).toBe(true)
      expect(tools.get(data)!._meta?.ui, data).toBeUndefined()
      expect(JSON.stringify(tools.get(data)!._meta ?? {}), data).not.toMatch(/resourceUri|outputTemplate/)
    }
    expect(tools.get('list_group_members')!._meta?.ui).toBeUndefined()
    expect(tools.get('get_whatsapp_summary')!._meta?.ui).toBeUndefined()
  })

  it('tells the model which to use: data tools say they draw nothing, display tools say once', () => {
    for (const [data, show] of PAIRS) {
      expect(tools.get(data)!.description, data).toMatch(/^Returns data only, no UI\./)
      expect(tools.get(data)!.description, data).toMatch(/combining, counting, comparing or filtering/)
      expect(tools.get(show)!.description, show).toMatch(/at most once per answer/i)
      expect(tools.get(show)!.description, show).toMatch(/Do not use for intermediate lookups/)
      expect(tools.get(show)!.description, show).toContain(data)
    }
    expect(tools.get('list_group_members')!.description).toMatch(/^Returns data only, no UI\./)
  })

  it('lets the group screen be opened on its Members tab, and on nothing else', () => {
    const schema = (tools.get('show_group') as unknown as { inputSchema: { safeParse: (v: unknown) => { success: boolean } } }).inputSchema
    const group = '8b1f0000-0000-4000-8000-0000000000aa'
    expect(schema.safeParse({ group_id: group }).success).toBe(true)
    expect(schema.safeParse({ group_id: group, tab: 'members' }).success).toBe(true)
    expect(schema.safeParse({ group_id: group, tab: 'games' }).success).toBe(true)
    expect(schema.safeParse({ group_id: group, tab: 'stats' }).success).toBe(false)
    expect(tools.get('show_group')!.description).toMatch(/tab "members"/)
  })

  it('never links a tool that changes something', () => {
    for (const n of ['join_game', 'withdraw_from_game', 'create_game', 'edit_game', 'add_player',
      'seat_from_waitlist', 'cancel_game', 'close_out_transfer', 'mark_transfer_paid',
      'confirm_transfer_received', 'update_payment_handle']) {
      expect(tools.get(n)!._meta?.ui, n).toBeUndefined()
    }
  })

  it('does not hide any tool from the model', () => {
    for (const [, c] of tools) {
      expect(JSON.stringify(c._meta ?? {})).not.toContain('visibility')
    }
  })

  it('serves the view as an MCP App page that may load pictures and nothing else', async () => {
    const r = resources.get(APP_URI)!
    expect(r.config.mimeType).toBe('text/html;profile=mcp-app')
    const out = (await r.read(new URL(APP_URI))) as {
      contents: { mimeType: string; text: string; _meta: { ui: Record<string, unknown> } }[]
    }
    expect(out.contents[0].mimeType).toBe('text/html;profile=mcp-app')
    expect(out.contents[0].text.startsWith('<!doctype html>')).toBe(true)
    // Pictures only: no requests, frames or base address of its own.
    const csp = out.contents[0]._meta.ui.csp as Record<string, string[]>
    expect(Object.keys(csp)).toEqual(['resourceDomains'])
  })

  it('allows pictures from this project\u2019s storage and Google\u2019s picture host, and no one else', () => {
    expect(pictureDomains({ NEXT_PUBLIC_SUPABASE_URL: 'https://proj.supabase.co/' })).toEqual([
      'https://proj.supabase.co',
      'https://*.googleusercontent.com',
    ])
    expect(pictureDomains({})).toEqual(['https://*.googleusercontent.com'])
    expect(pictureDomains({ NEXT_PUBLIC_SUPABASE_URL: 'not a url' })).toEqual(['https://*.googleusercontent.com'])
  })
})

describe('where "Open in Poker Ledger" goes', () => {
  it('is production only on production, and a preview points at itself', () => {
    expect(appOrigin({ VERCEL_ENV: 'production' })).toBe('https://www.kevespoker.com')
    expect(appOrigin({ VERCEL_ENV: 'preview', VERCEL_BRANCH_URL: 'x-git-b.vercel.app' })).toBe('https://x-git-b.vercel.app')
    expect(appOrigin({ VERCEL_URL: 'x-123.vercel.app' })).toBe('https://x-123.vercel.app')
    expect(appOrigin({})).toBe('http://localhost:3000')
  })

  it('is written into the page, and nothing else changes', () => {
    expect(html).toContain('__APP_ORIGIN__')
    const page = appPage('https://x.app')
    expect(page).toContain('content="https://x.app"')
    expect(page).not.toContain('__APP_ORIGIN__')
    expect(page.length).toBeLessThan(html.length + 100)
  })
})

describe('the bundle', () => {
  it('is one self-contained file within budget', () => {
    expect(html).not.toMatch(/<script[^>]+src=/i)
    expect(html).not.toMatch(/<link[^>]+href=/i)
    expect(html).not.toMatch(/@import|url\(\s*['"]?https?:/i)
    // Raw size; the SDK's schema library is most of it.
    expect(html.length).toBeLessThan(300 * 1024)
  })

  it('names no web address beyond the SDK’s inert schema ids', () => {
    const allowed = [
      'http://json-schema.org/',
      'https://json-schema.org/',
      'http://www.w3.org/2000/svg',
      'https://github.com/cfworker',
    ]
    const found = html.match(/https?:\/\/[A-Za-z0-9._/#-]+/g) ?? []
    for (const url of found) {
      expect(allowed.some((a) => url.startsWith(a)), url).toBe(true)
    }
    expect(html).not.toContain('kevespoker')
    expect(html).not.toContain('supabase')
  })
})
