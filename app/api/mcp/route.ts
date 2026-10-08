import { createMcpHandler, withMcpAuth } from 'mcp-handler'
import { verifyToken } from '@/lib/mcp/auth'
import { SERVER_INFO, registerTools } from '@/lib/mcp/server'

// The MCP endpoint. Stateless Streamable HTTP, one request at a time, each
// one authenticated by its own bearer token. See docs/MCP.md.

const handler = createMcpHandler(registerTools, {
  serverInfo: SERVER_INFO,
  instructions:
    'Poker Ledger tracks home poker cash games. Everything runs as the signed-in ' +
    'user, with exactly the access they have in the app. ' +
    'READ tools (list_my_groups, list_group_members, list_games, get_game, get_my_stats, ' +
    'get_my_balances, get_outstanding_debt, get_whatsapp_summary) change nothing and return ' +
    'data only: use them for lookups and for any answer you work out by combining, counting, ' +
    'comparing or filtering. Start with list_my_groups to get a group_id. ' +
    'DISPLAY tools (show_groups, show_group, show_game, show_my_stats, show_balances, ' +
    'show_outstanding_debt) return the same data and draw the app screen. Use one only when the ' +
    'user asks to see that screen or when that single screen is the whole answer, at most once ' +
    'per answer, and never for an intermediate lookup. ' +
    'WRITE tools change real things: a seat, a game, a payment. Every one except ' +
    'update_payment_handle works in two steps. Call it with no confirmation_token and it ' +
    'changes nothing: it returns a preview and a token. Show the preview to the user ' +
    'exactly as written and wait for an explicit yes. Only then call again with the same ' +
    'arguments and the token. Never confirm on the user\'s behalf, never reuse a token, ' +
    'and never assume a payment happened. ' +
    'Player tools (join_game, withdraw_from_game, mark_transfer_paid, ' +
    'confirm_transfer_received, update_payment_handle) act for the user themselves. ' +
    'Admin tools (create_game, edit_game, add_player, seat_from_waitlist, cancel_game, ' +
    'close_out_transfer) only work for the game admin (cancel_game also for the group ' +
    'owner); anyone else gets a refusal, and you should say so rather than try another ' +
    'way. They cannot start a game, log buy-ins or cash-outs, settle, remove players or ' +
    'members, or change roles, group settings, invite links or claim codes.',
})

// A missing or invalid token is a 401 whose WWW-Authenticate header points
// at the protected-resource metadata, which is how a client finds the
// Supabase authorization server.
const authed = withMcpAuth(handler, verifyToken, {
  required: true,
  resourceMetadataPath: '/.well-known/oauth-protected-resource/api/mcp',
})

export { authed as GET, authed as POST }
