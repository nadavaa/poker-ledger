import type { McpServer } from '@modelcontextprotocol/server'
import { registerGameTools } from './tools/games'
import { registerGroupTools } from './tools/groups'
import { registerMoneyTools } from './tools/money'

export const SERVER_INFO = { name: 'poker-ledger', version: '0.1.0' }

/**
 * Read-only in this phase: every tool is annotated readOnlyHint, and none
 * writes. A write tool would be a new function in the database first, with
 * its own policy, and only then a tool here.
 */
export function registerTools(server: McpServer) {
  registerGroupTools(server)
  registerGameTools(server)
  registerMoneyTools(server)
}
