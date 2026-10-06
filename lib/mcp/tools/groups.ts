import type { McpServer } from '@modelcontextprotocol/server'
import { z } from 'zod'
import { mapGroups } from '../map'
import { must, runTool } from './run'

export function registerGroupTools(server: McpServer) {
  server.registerTool(
    'list_my_groups',
    {
      title: 'List my poker groups',
      description:
        'Use this first, or whenever you need a group_id for another tool. ' +
        'Returns the poker groups the signed-in user belongs to: group_id, ' +
        'name, their role (owner, admin or member) and the IANA timezone ' +
        'the group plays in. Takes no input. It does not list members, ' +
        'invite links or settings, and it cannot create or change groups.',
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    (_args, ctx) =>
      runTool('list_my_groups', ctx, async ({ db, userId }) => {
        const rows = must(
          await db
            .from('group_members')
            .select('role, groups(id, name, timezone)')
            .eq('profile_id', userId)
            .eq('is_active', true)
        )
        return {
          groups: mapGroups(
            rows.flatMap((r) =>
              r.groups
                ? [{ ...r.groups, role: r.role }]
                : []
            )
          ),
        }
      })
  )
}
