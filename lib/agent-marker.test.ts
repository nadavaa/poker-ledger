import { describe, expect, it } from 'vitest'
import { agentActionLine, agentMarks, type AgentActionRow } from './agent-marker'

const row = (over: Partial<AgentActionRow>): AgentActionRow => ({
  member_id: 'm1',
  action: 'joined',
  settlement_id: null,
  signup_order: 3,
  created_at: '2026-10-06T00:00:00Z',
  ...over,
})

describe('agent marks', () => {
  it('labels the signup the agent made', () => {
    const m = agentMarks([row({})])
    expect(m.joinedViaAgent('m1', 3)).toBe(true)
  })

  it('does not label a later signup by the same person', () => {
    // Joined by agent (order 3), withdrew, rejoined in the app (order 7).
    const m = agentMarks([row({}), row({ action: 'withdrew' })])
    expect(m.joinedViaAgent('m1', 7)).toBe(false)
  })

  it('does not label anyone else', () => {
    expect(agentMarks([row({})]).joinedViaAgent('m2', 3)).toBe(false)
  })

  it('tells paid from confirmed, per transfer', () => {
    const m = agentMarks([
      row({ action: 'marked_paid', settlement_id: 's1', signup_order: null }),
      row({ action: 'confirmed_received', settlement_id: 's2', signup_order: null }),
    ])
    expect(m.paidViaAgent('s1')).toBe(true)
    expect(m.confirmedViaAgent('s1')).toBe(false)
    expect(m.confirmedViaAgent('s2')).toBe(true)
    expect(m.paidViaAgent('s2')).toBe(false)
  })

  it('knows a close-out from a confirmation', () => {
    const m = agentMarks([
      row({ action: 'closed_out', settlement_id: 's9', signup_order: null }),
    ])
    expect(m.closedOutViaAgent('s9')).toBe(true)
    expect(m.confirmedViaAgent('s9')).toBe(false)
  })

  it('names who was added or seated, and says what the admin did', () => {
    expect(agentActionLine({ action: 'created_game' }, 'Nadav')).toBe('Nadav created the game')
    expect(agentActionLine({ action: 'edited_game' }, 'Nadav')).toBe('Nadav edited the game')
    expect(agentActionLine({ action: 'cancelled_game' }, 'Nadav')).toBe('Nadav cancelled the game')
    expect(agentActionLine({ action: 'added_player' }, 'Nadav', 'Dean')).toBe('Nadav added Dean')
    expect(agentActionLine({ action: 'seated_player' }, 'Nadav', 'Dean')).toBe(
      'Nadav seated Dean from the waitlist'
    )
    expect(agentActionLine({ action: 'closed_out' }, 'Nadav')).toBe('Nadav closed out a payment')
  })

  it('says what happened without amounts or counterparties', () => {
    expect(agentActionLine({ action: 'withdrew' }, 'Dean')).toBe('Dean withdrew')
    expect(agentActionLine({ action: 'marked_paid' }, 'Dean')).toBe(
      'Dean marked a payment as paid'
    )
  })
})
