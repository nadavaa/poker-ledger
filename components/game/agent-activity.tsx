import { formatTime } from '@/lib/time'
import { agentActionLine, type AgentActionRow } from '@/lib/agent-marker'

/**
 * What AI agents did in this game, newest first. A signup shows on the roster
 * and a payment on its transfer, but a withdrawal leaves no row to label, so
 * this is where it can be seen at all.
 */
export function AgentActivity({
  rows,
  names,
  timeZone,
}: {
  rows: AgentActionRow[]
  names: Map<string, string>
  timeZone: string
}) {
  if (rows.length === 0) return null
  const shown = rows.slice(0, 5)
  return (
    <section className="flex flex-col gap-1.5">
      <h2 className="text-[0.7rem] font-medium uppercase tracking-[0.08em] text-muted-foreground">
        Agent activity
      </h2>
      <ul className="flex flex-col gap-1 text-sm">
        {shown.map((r, i) => (
          <li key={`${r.created_at}-${i}`} className="flex justify-between gap-2">
            <span className="min-w-0 truncate">
              {agentActionLine(
                r,
                names.get(r.member_id) ?? 'Someone',
                r.target_member_id ? names.get(r.target_member_id) : undefined
              )}
              <span className="text-muted-foreground"> · via AI agent</span>
            </span>
            <span className="shrink-0 text-xs text-muted-foreground">
              {formatTime(r.created_at, timeZone, 'when')}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}
