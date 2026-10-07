import { describe, expect, it } from 'vitest'
import { registerTools } from '../server'
import { html as gameCardHtml } from './generated/game-card'
import { html as statsHtml } from './generated/stats'
import { GAME_CARD_URI, STATS_URI } from './register'

// A recording stand-in for the MCP server: what gets registered, not what runs.
function record() {
  const tools = new Map<string, { _meta?: Record<string, unknown> }>()
  const resources = new Map<string, { config: Record<string, unknown>; read: (u: URL) => Promise<unknown> }>()
  const server = {
    registerTool: (name: string, config: { _meta?: Record<string, unknown> }) => {
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

describe('widget registration', () => {
  const { server, tools, resources } = record()
  registerTools(server as never)

  it('links the stats and game views from exactly the two tools', () => {
    const linked = [...tools].filter(([, c]) => c._meta?.ui)
    expect(linked.map(([n]) => n).sort()).toEqual(['get_game', 'get_my_stats'])
    expect(tools.get('get_my_stats')!._meta).toMatchObject({ ui: { resourceUri: STATS_URI } })
    expect(tools.get('get_game')!._meta).toMatchObject({ ui: { resourceUri: GAME_CARD_URI } })
  })

  it('does not hide any tool from the model', () => {
    for (const [, c] of tools) {
      expect(JSON.stringify(c._meta ?? {})).not.toContain('visibility')
    }
  })

  it('serves each view as an MCP App page with no network allowance', async () => {
    for (const uri of [STATS_URI, GAME_CARD_URI]) {
      const r = resources.get(uri)!
      expect(r.config.mimeType).toBe('text/html;profile=mcp-app')
      const out = (await r.read(new URL(uri))) as {
        contents: { mimeType: string; text: string; _meta: { ui: Record<string, unknown> } }[]
      }
      expect(out.contents[0].mimeType).toBe('text/html;profile=mcp-app')
      expect(out.contents[0].text.startsWith('<!doctype html>')).toBe(true)
      // No csp means the host denies every outbound request.
      expect(out.contents[0]._meta.ui).not.toHaveProperty('csp')
    }
  })
})

describe.each([
  ['stats', statsHtml],
  ['game-card', gameCardHtml],
])('%s bundle', (_name, html) => {
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
