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
- Settles the money with no arguments. At the end you count chips, and the app won't settle until the count matches the money that went in. Then it gives everyone a short list of who pays whom.
- Gets everyone paid in seconds. Each payment comes with a Venmo or Zelle button already filled in, and each person marks it paid when they've paid. The whole game is settled before people reach the door.

One ask: if you play in other home games, or know people who do, I'd really appreciate you passing KevesPoker along. It's a one-person project and it grows by word of mouth.

And if anything is confusing or broken, just reply to this email. It comes straight to me.

Good luck at the table,
Nadav
`
}
