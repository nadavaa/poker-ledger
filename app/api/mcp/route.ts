import { createMcpHandler, withMcpAuth } from 'mcp-handler'
import { verifyToken } from '@/lib/mcp/auth'
import { SERVER_INFO, registerTools } from '@/lib/mcp/server'

// The MCP endpoint. Stateless Streamable HTTP, one request at a time, each
// one authenticated by its own bearer token. See docs/MCP.md.

const handler = createMcpHandler(registerTools, {
  serverInfo: SERVER_INFO,
  instructions:
    'Poker Ledger tracks home poker cash games. Everything here is read-only ' +
    'and limited to what the signed-in user can see in the app. Start with ' +
    'list_my_groups to get a group_id.',
})

// A missing or invalid token is a 401 whose WWW-Authenticate header points
// at the protected-resource metadata, which is how a client finds the
// Supabase authorization server.
const authed = withMcpAuth(handler, verifyToken, {
  required: true,
  resourceMetadataPath: '/.well-known/oauth-protected-resource/api/mcp',
})

export { authed as GET, authed as POST }
