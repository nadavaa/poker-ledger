import type { McpServer } from '@modelcontextprotocol/server'
import { registerAdminTools } from './tools/admin'
import { registerGameTools } from './tools/games'
import { registerGroupTools } from './tools/groups'
import { registerMoneyTools } from './tools/money'
import { registerPaymentHandleTool } from './tools/payment-handle'
import { registerRosterTools } from './tools/roster'
import { registerSignupTools } from './tools/signups'
import { registerTransferTools } from './tools/transfers'

export const SERVER_INFO = { name: 'poker-ledger', version: '0.1.0' }

/**
 * Reads, a small set of player actions, and the game admin's actions. Each action goes through the
 * same table update or database function the app's own screen uses, as the
 * signed-in user, so row-level security still decides. Anything that changes
 * a seat or says money moved takes two calls (preview, then confirm).
 */
export function registerTools(server: McpServer) {
  registerGroupTools(server)
  registerGameTools(server)
  registerMoneyTools(server)
  registerSignupTools(server)
  registerTransferTools(server)
  registerPaymentHandleTool(server)
  registerRosterTools(server)
  registerAdminTools(server)
}
