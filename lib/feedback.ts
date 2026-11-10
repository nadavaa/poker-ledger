// Pure helpers for the feedback sheet. No Supabase, Next or React imports.

export type FeedbackKind = 'idea' | 'bug'

export const FEEDBACK_MAX = 2000

/** What gets stored, or why it can't be sent. Mirrors the table's checks. */
export function prepareFeedback(input: {
  kind: FeedbackKind
  message: string
  path?: string | null
  userAgent?: string | null
}):
  | { ok: true; row: { kind: FeedbackKind; message: string; page_path: string | null; user_agent: string | null } }
  | { ok: false; reason: 'empty' | 'too-long' } {
  const message = input.message.trim()
  if (!message) return { ok: false, reason: 'empty' }
  if (message.length > FEEDBACK_MAX) return { ok: false, reason: 'too-long' }
  return {
    ok: true,
    row: {
      kind: input.kind,
      message,
      page_path: input.path ? input.path.slice(0, 200) : null,
      user_agent: input.userAgent ? input.userAgent.slice(0, 400) : null,
    },
  }
}

/** Postgres and network errors, in words for a player. */
export function feedbackError(message: string): string {
  if (/feedback limit reached/i.test(message)) {
    return 'You’ve sent a lot today. Try again tomorrow.'
  }
  if (/fetch|network|load failed/i.test(message)) {
    return 'Couldn’t send. Check your connection and try again.'
  }
  return 'Couldn’t send. Try again in a moment.'
}

/**
 * The email Nadav gets when feedback arrives. Plain text: it's an alert, not
 * a newsletter. The sender's display name only; no email address or handle.
 */
export function feedbackAlertEmail(input: {
  kind: FeedbackKind
  message: string
  pagePath: string | null
  senderName: string | null
}): { subject: string; text: string } {
  const who = input.senderName?.trim() || 'Someone'
  const label = input.kind === 'bug' ? 'Bug report' : 'Idea'
  const firstLine = input.message.split('\n')[0]
  const preview = firstLine.length > 60 ? `${firstLine.slice(0, 57)}...` : firstLine
  return {
    subject: `KevesPoker ${label.toLowerCase()} from ${who}: ${preview}`,
    text: [
      `${label} from ${who}`,
      input.pagePath ? `Page: ${input.pagePath}` : null,
      '',
      input.message,
      '',
      'All feedback: https://www.kevespoker.com/admin',
    ]
      .filter((l) => l !== null)
      .join('\n'),
  }
}
