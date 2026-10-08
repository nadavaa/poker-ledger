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

// The page may load pictures, and nothing else. It has no connect, frame or
// base allowance, so it still cannot make a request of its own: it gets its
// data from tool results and calls tools through the host. Pictures come from
// two places only: this project's public storage, where profile and group
// pictures are kept, and Google's picture host, because a Google sign-in
// hands over a photo address.
const GOOGLE_PICTURES = 'https://*.googleusercontent.com'

export function pictureDomains(env: Record<string, string | undefined> = process.env): string[] {
  const out: string[] = []
  try {
    if (env.NEXT_PUBLIC_SUPABASE_URL) out.push(new URL(env.NEXT_PUBLIC_SUPABASE_URL).origin)
  } catch {
    // no storage address, so no storage pictures
  }
  out.push(GOOGLE_PICTURES)
  return out
}

const meta = () => ({ ui: { prefersBorder: false, csp: { resourceDomains: pictureDomains() } } })

/** The page, told which address "Open in Poker Ledger" should go to. */
export function appPage(origin: string = appOrigin()): string {
  return appHtml.replace('__APP_ORIGIN__', origin)
}

export function registerWidgets(server: McpServer) {
  registerAppResource(
    server,
    'Poker Ledger view',
    APP_URI,
    { mimeType: RESOURCE_MIME_TYPE, _meta: meta() },
    async () => ({
      contents: [{ uri: APP_URI, mimeType: RESOURCE_MIME_TYPE, text: appPage(), _meta: meta() }],
    })
  )
}
