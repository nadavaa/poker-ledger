import type { McpServer } from '@modelcontextprotocol/server'
import { z } from 'zod'
import { money } from '../format'
import { mapGroups } from '../map'
import { groupAvatar } from '../ui/meta'
import { registerPair, SHOWN } from './pair'
import { must } from './run'

export function registerGroupTools(server: McpServer) {
  registerPair(
    server,
    'list_my_groups',
    {
      display: {
        name: 'show_groups',
        title: 'Show my poker groups',
        description:
          SHOWN +
          'Renders the screen listing the user\'s groups, with each group\'s picture, the user\'s lifetime net ' +
          'and its member count. Use only when the user asks to see their groups. To find a group_id use ' +
          'list_my_groups instead.',
      },
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
    async (_args, { db, userId, setUi }, withUi) => {
      const rows = must(
        await db
          .from('group_members')
          .select('id, role, groups(id, name, timezone, avatar_url)')
          .eq('profile_id', userId)
          .eq('is_active', true)
      )
      const mine = rows.flatMap((r) =>
        r.groups ? [{ ...r.groups, role: r.role, memberId: r.id }] : []
      )

      // Only the screen needs these: each group's picture, its member count and
      // my lifetime in it, as the app's home shows them.
      if (withUi && mine.length) {
        const [people, lifetime] = await Promise.all([
          db
            .from('group_members')
            .select('group_id')
            .in('group_id', mine.map((g) => g.id))
            .eq('is_active', true),
          db
            .from('member_lifetime')
            .select('member_id, lifetime_net_cents')
            .in('member_id', mine.map((g) => g.memberId)),
        ])
        const counts = new Map<string, number>()
        for (const m of must(people)) counts.set(m.group_id, (counts.get(m.group_id) ?? 0) + 1)
        const net = new Map(must(lifetime).map((l) => [l.member_id, l.lifetime_net_cents]))
        setUi({
          groups: mine.map((g) => ({
            id: g.id,
            avatar: groupAvatar(g.avatar_url),
            members: counts.get(g.id) ?? 0,
            lifetime: net.has(g.memberId) ? money(net.get(g.memberId)!) : null,
          })),
        })
      }
      return { groups: mapGroups(mine) }
    }
  )
}
