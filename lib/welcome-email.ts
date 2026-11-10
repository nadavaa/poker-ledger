// The welcome email Nadav sends every new account. Pure: no Supabase, Next or
// React imports. Text approved by Nadav, 2026-11-09. Plain text on purpose:
// it is a note from a person, not a newsletter.

/** First word of the display name, or null when there is nothing usable. */
export function firstName(displayName: string | null | undefined): string | null {
  const first = displayName?.trim().split(/\s+/)[0]
  return first ? first : null
}

export const WELCOME_SUBJECT = 'Thanks for joining KevesPoker'

export function welcomeEmailText(displayName: string | null | undefined): string {
  const name = firstName(displayName)
  return `Hi ${name ?? 'there'},

Thanks for signing up for KevesPoker. I'm Nadav, and I built it for my own weekly game in NYC, after one too many nights of tracking buy-ins in my notes app and chasing Venmos the next morning.

Here's what it does for your game:

- Tracks every buy-in as it happens, so nobody has to remember who rebought twice.
- Settles the money with no arguments. At the end you count chips, then it gives everyone a short list of who pays whom.
- Gets everyone paid in seconds. Each payment comes with a Venmo or Zelle button already filled in. The whole game is settled before people reach the door.

One ask: if you play in other home games, or know people who do, I'd really appreciate you passing KevesPoker along. It's a one-person project and it grows by word of mouth.

And if anything is confusing or broken, just reply to this email. It comes straight to me.

May the flop be with you,
Nadav
`
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * The same words as welcomeEmailText, laid out as Nadav's Google Doc
 * (2026-11-09): Arial, italic KevesPoker, underlined "Here's what it does",
 * real bullets with bold lead-ins, bold underlined "One ask:". Plain HTML,
 * no template or images, so it reads like a note from a person.
 */
export function welcomeEmailHtml(displayName: string | null | undefined): string {
  const name = escapeHtml(firstName(displayName) ?? 'there')
  const p = 'margin:0 0 16px'
  return `<!doctype html>
<html><body style="margin:0;padding:24px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#000000;">
<div style="max-width:600px;">
<p style="${p}">Hi ${name},</p>
<p style="${p}">Thanks for signing up for <em>KevesPoker</em>. I'm Nadav, and I built it for my own weekly game in NYC, after one too many nights of tracking buy-ins in my notes app and chasing Venmos the next morning.</p>
<p style="${p}"><u>Here's what it does for your game:</u></p>
<ul style="margin:0 0 16px;padding-left:24px;">
<li><strong>Tracks every buy-in</strong> as it happens, so nobody has to remember who rebought twice.</li>
<li><strong>Settles the money with no arguments</strong>. At the end you count chips, then it gives everyone a short list of who pays whom.</li>
<li><strong>Gets everyone paid in seconds</strong>. Each payment comes with a Venmo or Zelle button already filled in. The whole game is settled before people reach the door.</li>
</ul>
<p style="${p}"><strong><u>One ask:</u></strong> if you play in other home games, or know people who do, I'd really appreciate you passing KevesPoker along. It's a one-person project and it grows by word of mouth.</p>
<p style="${p}">And if anything is confusing or broken, just reply to this email. It comes straight to me.</p>
<p style="margin:0">May the flop be with you,<br>Nadav</p>
</div>
</body></html>`
}
