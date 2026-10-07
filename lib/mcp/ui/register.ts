import type { McpServer } from '@modelcontextprotocol/server'
import { registerAppResource, RESOURCE_MIME_TYPE } from '@modelcontextprotocol/ext-apps/server'
import { html as gameCardHtml } from './generated/game-card'
import { html as statsHtml } from './generated/stats'

// The two interactive views. Each tool keeps returning exactly the text it
// always did; a host that understands MCP Apps also fetches the page named in
// the tool's _meta and draws it beside the result. A host that does not simply
// never asks for it.

export const STATS_URI = 'ui://poker-ledger/stats.html'
export const GAME_CARD_URI = 'ui://poker-ledger/game-card.html'

/** The tool's side of the link. The shape the spec defines. */
export const statsUi = { ui: { resourceUri: STATS_URI } }
export const gameCardUi = { ui: { resourceUri: GAME_CARD_URI } }

// No `csp` on purpose: with none, the host blocks every network request from
// the page. The views get their data from tool results and call tools through
// the host; they load nothing and hold no secrets.
const META = { ui: { prefersBorder: false } }

export function registerWidgets(server: McpServer) {
  for (const [name, uri, html] of [
    ['My stats view', STATS_URI, statsHtml],
    ['Game card view', GAME_CARD_URI, gameCardHtml],
  ] as const) {
    registerAppResource(
      server,
      name,
      uri,
      { mimeType: RESOURCE_MIME_TYPE, _meta: META },
      async () => ({
        contents: [{ uri, mimeType: RESOURCE_MIME_TYPE, text: html, _meta: META }],
      })
    )
  }
}
