// Which things on a game screen an AI agent did, from the agent_actions rows.
//
// Pure. The rows come from the database already filtered by row-level
// security, so a payment marker only reaches someone who can see that
// payment; this only decides what to label.

export type AgentAction =
  | 'joined'
  | 'withdrew'
  | 'marked_paid'
  | 'confirmed_received'
  | 'created_game'
  | 'edited_game'
  | 'added_player'
  | 'seated_player'
  | 'cancelled_game'
  | 'closed_out'

export type AgentActionRow = {
  /** Who acted: the member whose AI agent did it. */
  member_id: string
  action: AgentAction
  settlement_id: string | null
  signup_order: number | null
  /** For adding or seating someone: who. */
  target_member_id?: string | null
  created_at: string
}

export type AgentMarks = {
  /** Was this member's CURRENT signup made through an agent? */
  joinedViaAgent: (memberId: string, signupOrder: number) => boolean
  paidViaAgent: (settlementId: string) => boolean
  confirmedViaAgent: (settlementId: string) => boolean
  closedOutViaAgent: (settlementId: string) => boolean
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
  const closedOut = new Set(
    rows.filter((r) => r.action === 'closed_out').map((r) => r.settlement_id)
  )
  return {
    joinedViaAgent: (m, order) => joined.has(`${m}:${order}`),
    paidViaAgent: (id) => paid.has(id),
    confirmedViaAgent: (id) => confirmed.has(id),
    closedOutViaAgent: (id) => closedOut.has(id),
  }
}

/** "Dean withdrew". Never an amount, never who the other person was. */
export function agentActionLine(
  row: Pick<AgentActionRow, 'action'>,
  name: string,
  /** For adding or seating someone: the name of whoever it was. */
  targetName?: string
): string {
  switch (row.action) {
    case 'joined':
      return `${name} signed up`
    case 'withdrew':
      return `${name} withdrew`
    case 'marked_paid':
      return `${name} marked a payment as paid`
    case 'confirmed_received':
      return `${name} confirmed a payment received`
    case 'closed_out':
      return `${name} closed out a payment`
    case 'created_game':
      return `${name} created the game`
    case 'edited_game':
      return `${name} edited the game`
    case 'cancelled_game':
      return `${name} cancelled the game`
    case 'added_player':
      return `${name} added ${targetName ?? 'a player'}`
    case 'seated_player':
      return `${name} seated ${targetName ?? 'a player'} from the waitlist`
  }
}
