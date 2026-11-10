'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { WELCOME_SUBJECT, welcomeEmailText } from '@/lib/welcome-email'

/**
 * Sends Nadav's welcome email to the signed-in user, once ever. Called when
 * onboarding finishes (finished or skipped). Safe to call any number of
 * times: the claim on profiles.welcome_email_sent_at only succeeds once.
 *
 * Off until WELCOME_FROM is set (e.g. "Nadav from KevesPoker
 * <nadav@kevespoker.com>"), which needs kevespoker.com verified in Resend.
 * Nothing is claimed while it's off, so nobody is marked sent without an
 * email. If the send fails, the claim is released.
 */
export async function sendWelcomeEmail(): Promise<void> {
  const key = process.env.RESEND_API_KEY
  const from = process.env.WELCOME_FROM
  if (!key || !from) return

  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  const user = auth.user
  if (!user?.email) return

  const admin = createAdminClient()
  if (!admin) return

  // Only after onboarding, and only the first time.
  const { data: claimed } = await admin
    .from('profiles')
    .update({ welcome_email_sent_at: new Date().toISOString() })
    .eq('id', user.id)
    .is('welcome_email_sent_at', null)
    .not('onboarding_completed_at', 'is', null)
    .select('display_name')
    .maybeSingle()
  if (!claimed) return

  let ok = false
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [user.email],
        ...(process.env.WELCOME_REPLY_TO
          ? { reply_to: process.env.WELCOME_REPLY_TO }
          : {}),
        subject: WELCOME_SUBJECT,
        text: welcomeEmailText(claimed.display_name),
      }),
      signal: AbortSignal.timeout(8000),
    })
    ok = res.ok
  } catch {
    ok = false
  }

  if (!ok) {
    await admin
      .from('profiles')
      .update({ welcome_email_sent_at: null })
      .eq('id', user.id)
  }
}
