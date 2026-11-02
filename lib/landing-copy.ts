// Every word on the public pages lives here, so it can be edited in one
// place. Facts come from docs/FUNCTIONALITY.md and docs/MCP.md. Do not add a
// claim the app does not back up: no payments, no Zelle link, no "invite-only
// app", no Android or desktop install, no official ChatGPT listing, no "free
// forever", no numbers about users, games or money, no legality claims.

export const SITE_URL = 'https://www.kevespoker.com'
export const SITE_NAME = 'KevesPoker'
export const MCP_URL = `${SITE_URL}/api/mcp`

export const SITE_TITLE = 'KevesPoker: track home poker cash games'
export const SITE_DESCRIPTION =
  'A web app that tracks buy-ins, cash-outs and who owes whom in home poker cash games, and works out the fewest payments to settle up.'

export const nav = [
  { href: '/#story', label: 'Watch a game' },
  { href: '/ai-connector', label: 'AI connector' },
  { href: '/guides', label: 'Guides' },
  { href: '/#faq', label: 'FAQ' },
] as const

export const landing = {
  hero: {
    headline: 'Track your home poker game. Settle up without the arguments.',
    sub: 'Track buy-ins and cash-outs, check the chips, and get the fewest payments to settle up.',
    cta: 'Get started',
    signIn: 'Sign in',
    watch: 'Watch a game play out',
  },

  story: {
    heading: 'Watch one game play out',
    intro: 'Six invented players, one night.',
    scenes: [
      {
        title: 'Buy-ins land as they happen',
        body: 'The admin taps once per buy-in. Every player sees the pot and the feed update live, and a mistake is voided rather than erased.',
      },
      {
        title: 'Then the chips get counted',
        body: 'Type each player’s chips. Empty means not counted yet, and zero is a real count. The pot is 20,000 chips. This count adds up to 19,700.',
      },
      {
        title: 'The game will not settle on a bad count',
        body: 'Recount, or have one player own the difference. Here Sam owns the $3. The moment the chips match the money in, the lock opens.',
      },
      {
        title: 'Five payments settle six players',
        body: 'The fewest transfers that zero everyone out, each tracked from paid to confirmed. No money moves through KevesPoker.',
      },
    ],
  },

  features: {
    heading: 'What else it does',
    items: [
      'Sign-up and seat waitlist for each game',
      'Guests without an account, who can claim their history later',
      'Personal stats and running balances',
      'A summary ready to paste into WhatsApp',
      'Food-order splitting',
      'A connector for AI assistants',
    ],
  },

  money: {
    heading: 'How money works',
    body: [
      'No money moves through KevesPoker. The app records who owes whom and by how much.',
      'If you pay with Venmo, the app gives you a Venmo link to open. If you pay with Zelle, it shows you the phone number to send to and the amount. Then you mark the transfer as paid, and the person owed confirms it arrived.',
      'Players add a Venmo handle or a Zelle phone number in Settings. A phone number is shown only to someone who owes that person money in a settled game, and to that game’s admin.',
    ],
  },

  connector: {
    heading: 'Use KevesPoker with Claude or ChatGPT',
    intro:
      'Ask Claude or ChatGPT what you owe, who is on the waitlist, how your year is going.',
    addressLabel: 'Connector address',
    steps: [
      'In Claude, add a custom connector and paste the address above, then sign in to KevesPoker when asked.',
      'In ChatGPT, turn on developer mode and add the same address as a custom connector. It is not an official ChatGPT app listing.',
    ],
    examples: [
      'What do I owe?',
      'Am I on the waitlist for Saturday?',
      'How am I doing this year?',
    ],
    canHeading: 'What it can do',
    can: [
      'Read your groups, games, balances, stats, and what you owe and are owed',
      'Show a game’s settlement and a WhatsApp-ready summary',
      'For a player: join or withdraw from a game, mark a transfer paid, confirm one received, update payment details',
      'For a game admin: create or edit a game, add a player, seat someone from the waitlist, cancel a game',
    ],
    cannotHeading: 'What it cannot do',
    cannot:
      'It cannot start a game, log buy-ins or cash-outs, settle a game, remove members, or change roles, group settings, invite links or claim codes. Every change shows a preview and needs your explicit yes.',
  },

  faq: {
    heading: 'Questions',
    items: [
      {
        q: 'Does KevesPoker handle payments?',
        a: 'No. No money moves through the app. It tells you who owes whom, links Venmo payers to Venmo, and shows Zelle payers the phone number to send to. You pay each other yourselves and mark it done in the app.',
      },
      {
        q: 'What if the chip count does not match the money in?',
        a: 'You see the difference in chips and dollars, and the game will not settle until it is resolved. You can recount, spread the difference across everyone, assign it to one player, or split it by buy-in. The resolution is written into the record.',
      },
      {
        q: 'Do I need an account?',
        a: 'Yes. You sign in with an emailed magic link or with Google. There are no passwords. A guest without an account can still be added to a game by name and claim their history later.',
      },
      {
        q: 'Are my group’s games public?',
        a: 'No. Invite links, games and groups all require signing in. The landing page, the guides and the AI connector page are the only public parts of the site, and the game story on the home page uses invented players.',
      },
    ],
  },

  closing: {
    heading: 'Next game, settle in minutes',
    body: 'Make a group, send the invite link, and run the next game on one list everyone can see.',
  },

  footer: 'KevesPoker. No money moves through the app.',
} as const
