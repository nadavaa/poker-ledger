import type { McpServer } from '@modelcontextprotocol/server'
import { registerAppResource, RESOURCE_MIME_TYPE } from '@modelcontextprotocol/ext-apps/server'
import { html as appHtml } from './generated/app'
import { appOrigin } from './origin'

// The interactive view. Each linked tool keeps returning exactly the text it
// always did; a host that understands MCP Apps also fetches the page named in
// the tool's _meta and draws it beside the result, opened on that tool's
// screen. A host that does not simply never asks for it.

export const APP_URI = 'ui://poker-ledger/app.html'

/** The tool's side of the link. The shape the spec defines. */
export const appUi = { ui: { resourceUri: APP_URI } }

// No `csp` on purpose: with none, the host blocks every network request from
// the page. The view gets its data from tool results and calls tools through
// the host; it loads nothing and holds no secrets.
const META = { ui: { prefersBorder: false } }

/** The page, told which address "Open in Poker Ledger" should go to. */
export function appPage(origin: string = appOrigin()): string {
  return appHtml.replace('__APP_ORIGIN__', origin)
}

export function registerWidgets(server: McpServer) {
  registerAppResource(
    server,
    'Poker Ledger view',
    APP_URI,
    { mimeType: RESOURCE_MIME_TYPE, _meta: META },
    async () => ({
      contents: [{ uri: APP_URI, mimeType: RESOURCE_MIME_TYPE, text: appPage(), _meta: META }],
    })
  )
}
