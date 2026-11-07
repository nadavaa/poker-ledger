import { describe, expect, it } from 'vitest'
import { FEEDBACK_MAX, feedbackError, prepareFeedback } from './feedback'

describe('prepareFeedback', () => {
  it('trims the message and keeps context', () => {
    const r = prepareFeedback({ kind: 'bug', message: '  totals wrong  ', path: '/settings', userAgent: 'UA' })
    expect(r).toEqual({
      ok: true,
      row: { kind: 'bug', message: 'totals wrong', page_path: '/settings', user_agent: 'UA' },
    })
  })
  it('rejects blank and oversized messages', () => {
    expect(prepareFeedback({ kind: 'idea', message: '   ' })).toEqual({ ok: false, reason: 'empty' })
    expect(prepareFeedback({ kind: 'idea', message: 'x'.repeat(FEEDBACK_MAX + 1) })).toEqual({
      ok: false,
      reason: 'too-long',
    })
  })
  it('caps context to the table limits', () => {
    const r = prepareFeedback({ kind: 'idea', message: 'hi', path: '/' + 'p'.repeat(300), userAgent: 'u'.repeat(500) })
    expect(r.ok && r.row.page_path?.length).toBe(200)
    expect(r.ok && r.row.user_agent?.length).toBe(400)
  })
})

describe('feedbackError', () => {
  it('explains the daily limit', () => {
    expect(feedbackError('feedback limit reached')).toMatch(/tomorrow/)
  })
  it('explains a network failure', () => {
    expect(feedbackError('Failed to fetch')).toMatch(/connection/)
  })
  it('never echoes raw text', () => {
    expect(feedbackError('permission denied for table feedback')).toBe('Couldn’t send. Try again in a moment.')
  })
})
