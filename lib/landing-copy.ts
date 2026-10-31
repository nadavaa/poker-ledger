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
  'A free-for-now web app that tracks buy-ins, cash-outs and who owes whom in home poker cash games, and works out the fewest payments to settle up.'

export const nav = [
  { href: '/#story', label: 'Watch a game' },
  { href: '/#how', label: 'How it works' },
  { href: '/ai-connector', label: 'AI connector' },
  { href: '/guides', label: 'Guides' },
  { href: '/#faq', label: 'FAQ' },
] as const

export const landing = {
  hero: {
    headline: 'Track your home poker game. Settle up without the arguments.',
    sub: 'KevesPoker is a free-for-now web app for tracking buy-ins, cash-outs and who owes whom in home poker cash games. It checks the chips against the money in, then works out the fewest payments to settle up.',
    cta: 'Get started',
    signIn: 'Sign in',
    note: 'Sign in with a magic link or Google. No passwords.',
    watch: 'Watch a game play out',
  },

  problem: {
    heading: 'The napkin does not scale past three players',
    body: [
      'Someone wrote your buy-in on a napkin. Someone else remembers it as two. The chips are a few dollars off and it is late.',
      'KevesPoker gives the table one list that everyone can see, a count that has to balance before anything settles, and a short list of who pays whom.',
    ],
  },

  howItWorks: {
    heading: 'How a game works',
    steps: [
      {
        title: 'Make a group',
        body: 'Sign in and create a group for the people you play with. Invite them with a link.',
      },
      {
        title: 'Create a game',
        body: 'Any group member can create a game and becomes its admin. Players sign up, and a full game keeps a seat waitlist.',
      },
      {
        title: 'Log buy-ins live',
        body: 'The admin logs buy-ins, and mid-game cash-outs when someone leaves. Every player sees each entry as it happens.',
      },
      {
        title: 'Count the chips',
        body: 'KevesPoker compares the chips with the money in and shows any difference. A game cannot settle until it balances.',
      },
      {
        title: 'Settle up',
        body: 'It works out the fewest transfers that zero everyone out, and tracks each one from paid to received.',
      },
    ],
  },

  story: {
    heading: 'Watch one game play out',
    intro:
      'Six invented players, $20 buy-ins, 100 chips to the dollar. Scroll through the night. The numbers come from the same arithmetic the app uses.',
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

  trust: {
    heading: 'Built so nobody has to trust anyone’s memory',
    items: [
      {
        title: 'Buy-ins are never edited or deleted',
        body: 'A mistake is voided, with who voided it and why. The original stays in the feed, so the record is the product.',
      },
      {
        title: 'Everyone sees every entry',
        body: 'The admin logs buy-ins, and every player sees each one live with who logged it. Visibility is the check on one person holding the pen.',
      },
      {
        title: 'One admin per game',
        body: 'Exactly one person runs a game. Being a group owner does not let you log buy-ins or settle someone else’s game.',
      },
      {
        title: 'No settling on a bad count',
        body: 'If the chips and the money in disagree, you recount or choose how to resolve the difference. The database refuses to settle until they match.',
      },
      {
        title: 'Poker and food stay separate',
        body: '“You won $80 at cards” and “you owe me $25 for pizza” are two line items, even between the same two people.',
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

  who: {
    heading: 'Who it is for',
    body: 'Friends who play cash games at home and settle up by Venmo or Zelle in the US, and are tired of doing the maths on a napkin. It is built for cash games, not tournaments.',
  },

  connector: {
    heading: 'Use KevesPoker with Claude or ChatGPT',
    intro:
      'Ask an AI assistant about your own games: what you owe, whether you are on the waitlist, how you are doing. It signs in as you, with the same permissions you have in the app.',
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

  install: {
    heading: 'Put it on your home screen',
    body: 'KevesPoker is a web app, not a native app. On iPhone, open it in Safari and use Share, then Add to Home Screen.',
  },

  faq: {
    heading: 'Questions',
    items: [
      {
        q: 'What is KevesPoker?',
        a: 'A free-for-now web app for tracking buy-ins, cash-outs and who owes whom in home poker cash games. It checks the chip count against the money in and works out the fewest payments to settle up.',
      },
      {
        q: 'Is KevesPoker free?',
        a: 'It is free for now. There is no pricing today, and that may change.',
      },
      {
        q: 'Does KevesPoker handle payments?',
        a: 'No. No money moves through the app. It tells you who owes whom, links Venmo payers to Venmo, and shows Zelle payers the phone number to send to. You pay each other yourselves and mark it done in the app.',
      },
      {
        q: 'How does it work out who pays whom?',
        a: 'It nets every player’s buy-ins against their cashed-out chips, then pairs the biggest debtors with the biggest creditors. That never takes more payments than the number of players minus one.',
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
        q: 'Is it invite-only?',
        a: 'Anyone can sign up. Joining a particular group needs that group’s invite link.',
      },
      {
        q: 'Who can run a game?',
        a: 'Any group member can create a game and becomes its single admin. Only the game admin logs buy-ins and cash-outs and settles the game.',
      },
      {
        q: 'Does it work for tournaments?',
        a: 'It is built for cash games: buy-ins, cash-outs and settlement. There is no tournament mode.',
      },
      {
        q: 'Does it work on Android or desktop?',
        a: 'It is a web app, so you can open it in a browser. Add to Home Screen has only been confirmed on iPhone Safari, and there is no native app.',
      },
      {
        q: 'Can I connect it to ChatGPT or Claude?',
        a: 'Yes, as a custom connector, using the address on the AI connector page. It can read your games and balances and do a few things a player can do, and every change needs your explicit yes.',
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

  footer: 'KevesPoker. Free for now. No money moves through the app.',
} as const
