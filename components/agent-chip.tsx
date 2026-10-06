/**
 * "via AI agent", the same quiet grey as "logged own" on an admin's buy-in:
 * not a warning, a fact. Players should be able to tell that a person's AI
 * app acted for them.
 */
export function AgentChip({ label = 'via AI agent' }: { label?: string }) {
  return <span className="text-muted-foreground"> · {label}</span>
}
