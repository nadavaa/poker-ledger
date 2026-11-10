'use server'

import { createClient } from '@/lib/supabase/server'
import { feedbackAlertEmail, prepareFeedback, type FeedbackKind } from '@/lib/feedback'

/**
 * Saves feedback as the signed-in player, then emails Nadav. The insert runs
 * with the player's own session, so the table's policy (insert as yourself
 * only) and its 20-a-day flood guard apply exactly as before; the email goes
 * out only for a row that was actually stored.
 *
 * The alert never fails the player's send: if Resend is down or not set up
 * (RESEND_API_KEY / FEEDBACK_ALERT_TO unset), the note is still saved and
 * still shows on /admin.
 */
export async function sendFeedback(input: {
  kind: FeedbackKind
  message: string
  path: string | null
  userAgent: string | null
}): Promise<{ error: string | null }> {
  const prepared = prepareFeedback(input)
  if (!prepared.ok) return { error: prepared.reason }

  const supabase = await createClient()
  const { error } = await supabase.from('feedback').insert(prepared.row)
  if (error) return { error: error.message }

  const key = process.env.RESEND_API_KEY
  const to = process.env.FEEDBACK_ALERT_TO
  if (key && to) {
    try {
      const { data: auth } = await supabase.auth.getUser()
      const { data: profile } = auth.user
        ? await supabase
            .from('profiles')
            .select('display_name')
            .eq('id', auth.user.id)
            .maybeSingle()
        : { data: null }
      const email = feedbackAlertEmail({
        kind: prepared.row.kind,
        message: prepared.row.message,
        pagePath: prepared.row.page_path,
        senderName: profile?.display_name ?? null,
      })
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: process.env.FEEDBACK_ALERT_FROM || 'KevesPoker <onboarding@resend.dev>',
          to: [to],
          subject: email.subject,
          text: email.text,
        }),
        signal: AbortSignal.timeout(5000),
      })
    } catch {
      // Saved is what matters; the alert is best effort.
    }
  }
  return { error: null }
}
