import { describe, expect, it } from 'vitest'
import { FEEDBACK_MAX, feedbackAlertEmail, feedbackError, prepareFeedback } from './feedback'

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

describe('feedbackAlertEmail', () => {
  it('names the kind and the sender, and carries the message', () => {
    const e = feedbackAlertEmail({
      kind: 'bug',
      message: 'Venmo button does nothing\nOn iPhone',
      pagePath: '/games/x',
      senderName: 'Dana',
    })
    expect(e.subject).toBe('KevesPoker bug report from Dana: Venmo button does nothing')
    expect(e.text).toContain('Page: /games/x')
    expect(e.text).toContain('Venmo button does nothing\nOn iPhone')
  })
  it('falls back to Someone and skips a missing page', () => {
    const e = feedbackAlertEmail({ kind: 'idea', message: 'Dark mode', pagePath: null, senderName: '  ' })
    expect(e.subject).toBe('KevesPoker idea from Someone: Dark mode')
    expect(e.text).not.toContain('Page:')
  })
  it('shortens a long first line in the subject', () => {
    const e = feedbackAlertEmail({ kind: 'idea', message: 'x'.repeat(100), pagePath: null, senderName: 'A' })
    expect(e.subject.endsWith('...')).toBe(true)
    expect(e.subject.length).toBeLessThan(110)
  })
})
