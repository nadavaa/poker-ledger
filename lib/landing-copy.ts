// Every word on the public landing page lives here, so it can be edited in one
// place. Facts come from docs/FUNCTIONALITY.md and docs/MCP.md. Do not add a
// claim the app does not back up: no payments, no Zelle link, no "invite-only
// app", no Android or desktop install, no official ChatGPT listing, no "free
// forever", no numbers about users, games or money.

export const SITE_URL = 'https://www.kevespoker.com'
export const SITE_NAME = 'KevesPoker'
export const MCP_URL = `${SITE_URL}/api/mcp`

export const SITE_TITLE = 'KevesPoker: track home poker cash games'
export const SITE_DESCRIPTION =
  'KevesPoker is a free-for-now web app for tracking buy-ins, cash-outs and who owes whom in home poker cash games, with Venmo and Zelle settlement and an AI-assistant connector.'

export const landing = {
  hero: {
    headline: 'Home poker cash games, tracked and settled.',
    sub: 'KevesPoker is a free-for-now web app for tracking buy-ins, cash-outs and who owes whom in your home game. It works out the fewest payments needed to settle up.',
    cta: 'Get started',
    signIn: 'Sign in',
    note: 'Sign in with a magic link or Google. No passwords.',
  },

  howItWorks: {
    heading: 'How a game works',
    steps: [
      'Sign in and create a group for the people you play with. Invite them with a link.',
      'Any group member can create a game. Players sign up for it, and a full game keeps a seat waitlist. Whoever creates the game is its admin.',
      'During the game the admin logs buy-ins and mid-game cash-outs. Every buy-in is kept as a record, and a correction is a voided entry rather than an edit.',
      'At the end, count the chips. KevesPoker compares them with the money in and shows any difference before you can settle.',
      'It then works out the fewest transfers that settle everyone, and tracks each one from "paid" to "received".',
    ],
  },

  features: {
    heading: 'What it does',
    items: [
      'Sign-up and seat waitlist for each game',
      'Live buy-in tracking, with mid-game cash-outs',
      'End-of-game chip-count reconciliation',
      'Minimum-transfer settlement',
      'Food-order splitting, kept separate from the poker',
      'Personal stats and running balances',
      'A summary ready to paste into WhatsApp',
      'A connector for AI assistants (see below)',
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
    body: 'Friends who play cash games at home and settle up by Venmo or Zelle in the US, and are tired of doing the maths on a napkin.',
  },

  connector: {
    heading: 'Use KevesPoker with Claude or ChatGPT',
    intro:
      'You can ask an AI assistant about your own games. It signs in as you, with the same permissions you have in the app.',
    addressLabel: 'Connector address',
    steps: [
      'In Claude, add a custom connector and paste the address above, then sign in to KevesPoker when asked.',
      'In ChatGPT, turn on developer mode and add the same address as a custom connector. It is not an official ChatGPT app listing.',
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
        q: 'Is KevesPoker free?',
        a: 'It is free for now. There is no pricing today, and that may change.',
      },
      {
        q: 'Does KevesPoker handle payments?',
        a: 'No. No money moves through the app. It tells you who owes whom, links Venmo payers to Venmo, and shows Zelle payers the phone number to send to. You pay each other yourselves and mark it done in the app.',
      },
      {
        q: 'Do I need an account?',
        a: 'Yes. You sign in with an emailed magic link or with Google. There are no passwords.',
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
        q: 'Does it work on Android or desktop?',
        a: 'It is a web app, so you can open it in a browser. Add to Home Screen has only been confirmed on iPhone Safari, and there is no native app.',
      },
      {
        q: 'Can I connect it to ChatGPT or Claude?',
        a: 'Yes, as a custom connector, using the address above. See the connector section for what it can and cannot do.',
      },
      {
        q: 'Are my group’s games public?',
        a: 'No. Invite links, games and groups all require signing in. This page is the only public part of the site.',
      },
    ],
  },

  footer: 'KevesPoker',
} as const
