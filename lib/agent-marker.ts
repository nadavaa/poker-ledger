// Which things on a game screen an AI agent did, from the agent_actions rows.
//
// Pure. The rows come from the database already filtered by row-level
// security, so a payment marker only reaches someone who can see that
// payment; this only decides what to label.

export type AgentActionRow = {
  member_id: string
  action: 'joined' | 'withdrew' | 'marked_paid' | 'confirmed_received'
  settlement_id: string | null
  signup_order: number | null
  created_at: string
}

export type AgentMarks = {
  /** Was this member's CURRENT signup made through an agent? */
  joinedViaAgent: (memberId: string, signupOrder: number) => boolean
  paidViaAgent: (settlementId: string) => boolean
  confirmedViaAgent: (settlementId: string) => boolean
}

/**
 * A joined marker belongs to one signup, named by its signup_order. Joining
 * through an agent, withdrawing in the app, and rejoining in the app gives a
 * new signup_order, so the label does not follow the person onto a signup the
 * agent never made.
 */
export function agentMarks(rows: AgentActionRow[]): AgentMarks {
  const joined = new Set(
    rows
      .filter((r) => r.action === 'joined' && r.signup_order !== null)
      .map((r) => `${r.member_id}:${r.signup_order}`)
  )
  const paid = new Set(
    rows.filter((r) => r.action === 'marked_paid').map((r) => r.settlement_id)
  )
  const confirmed = new Set(
    rows
      .filter((r) => r.action === 'confirmed_received')
      .map((r) => r.settlement_id)
  )
  return {
    joinedViaAgent: (m, order) => joined.has(`${m}:${order}`),
    paidViaAgent: (id) => paid.has(id),
    confirmedViaAgent: (id) => confirmed.has(id),
  }
}

const WORDS: Record<AgentActionRow['action'], string> = {
  joined: 'signed up',
  withdrew: 'withdrew',
  marked_paid: 'marked a payment as paid',
  confirmed_received: 'confirmed a payment received',
}

/** "Dean withdrew". Never an amount, never who the other person was. */
export function agentActionLine(
  row: Pick<AgentActionRow, 'action'>,
  name: string
): string {
  return `${name} ${WORDS[row.action]}`
}
