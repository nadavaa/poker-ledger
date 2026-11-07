// Public how-to guides. Plain, checkable statements about running a home cash
// game, with KevesPoker mentioned where it is the honest answer. No invented
// statistics, no "best", no legality claims, no claim that money moves through
// the app. The worked example is computed from lib/landing-demo.ts at render
// time, so the numbers cannot drift from what the demo does.

export type Block =
  | { type: 'h2'; text: string }
  | { type: 'p'; text: string }
  | { type: 'ul'; items: string[] }
  | { type: 'example' }

export type Faq = { q: string; a: string }

export type Guide = {
  slug: string
  title: string
  description: string
  /** ISO date the guide was first written. */
  published: string
  /** ISO date of the last material change, if any. */
  updated?: string
  blocks: Block[]
  /** Short questions and answers, rendered at the end and marked up as FAQPage. */
  faq?: Faq[]
}

export const GUIDES: Guide[] = [
  {
    slug: 'settle-a-home-poker-game',
    title: 'How to settle a home poker cash game',
    description:
      'Work out what each player won or lost, check the chips against the money in, and settle in a handful of transfers. A worked example with six players.',
    published: '2026-10-31',
    updated: '2026-11-07',
    blocks: [
      {
        type: 'p',
        text: 'Settling a cash game takes three steps: work out each player’s net, check that the nets add up to zero, then turn the nets into as few payments as possible.',
      },
      { type: 'h2', text: '1. Work out each player’s net' },
      {
        type: 'p',
        text: 'A player’s net is the value of the chips they finish with, minus everything they bought in for. Rebuys count: if you bought in three times at $20, you put in $60. A positive net means you are owed money, a negative net means you owe it.',
      },
      { type: 'h2', text: '2. Check the nets add up to zero' },
      {
        type: 'p',
        text: 'Every dollar won came from someone else’s stack, so all the nets together must come to exactly zero. In other words, the chips counted at the end must equal the chips sold at the start. If they do not, someone miscounted or a stack is missing, and no list of payments can be right until that is sorted out.',
      },
      { type: 'h2', text: '3. Turn nets into a short list of payments' },
      {
        type: 'p',
        text: 'You do not need everyone to pay everyone. Pair the biggest debtor with the biggest creditor, settle as much as one of them can, and repeat. This never takes more payments than the number of players minus one. It is not always the absolute minimum (finding that is a much harder puzzle), but at a home-game table it is usually the same number or one more.',
      },
      { type: 'h2', text: 'A worked example' },
      { type: 'example' },
      { type: 'h2', text: 'Doing it in KevesPoker' },
      {
        type: 'p',
        text: 'KevesPoker follows exactly this order. The admin logs buy-ins during the game, the chip count is compared with the money in, and the game cannot settle until the difference is zero. It then lists who pays whom. No money moves through the app: players pay each other, and each payment is marked paid and then confirmed received.',
      },
    ],
    faq: [
      {
        q: 'Do I need an app to settle a home poker game?',
        a: 'No. A notebook and these three steps work for any table. An app helps when there are lots of rebuys, players leave at different times, or nobody wants to be the one doing the sums at 1am.',
      },
      {
        q: 'What if someone left before the end?',
        a: 'Count their chips when they leave and write the value down. They stay in the end-of-night settlement like everyone else: their net is that count minus what they bought in for.',
      },
      {
        q: 'Should the host collect everyone’s money and pay out the winners?',
        a: 'It works, but it puts every payment through one person and they carry the risk of anyone who doesn’t pay. Losers paying winners directly takes fewer transfers and nobody holds the pot.',
      },
    ],
  },
  {
    slug: 'chip-count-is-off',
    title: 'What to do when the chip count is off',
    description:
      'The chips on the table rarely match the money in exactly. Four fair ways to resolve a small difference, and when to recount instead.',
    published: '2026-10-31',
    blocks: [
      {
        type: 'p',
        text: 'At the end of a home game the chips counted are often a little more or less than the chips sold. A dropped chip, a miscount or a forgotten rebuy is usually the cause. The difference has to go somewhere before anyone can settle.',
      },
      { type: 'h2', text: 'Start by recounting' },
      {
        type: 'p',
        text: 'Recount the largest stacks first, because a miscount of one colour in a big stack is the most common error. Check that every rebuy was written down, including the ones paid in cash. Most differences disappear here.',
      },
      { type: 'h2', text: 'If it is still off, pick one rule and say it out loud' },
      {
        type: 'ul',
        items: [
          'Spread it evenly: divide the difference across all players. Simple, and fair when nobody knows who miscounted.',
          'Assign it to one player: someone owns up to the miscount, or the table agrees it was theirs.',
          'Split it by buy-in: the difference is shared in proportion to what each player put in, so bigger stakes carry more of it.',
        ],
      },
      {
        type: 'p',
        text: 'The important part is agreeing the rule before looking at who it favours, and writing down what was decided so nobody argues about it next week.',
      },
      { type: 'h2', text: 'How KevesPoker handles it' },
      {
        type: 'p',
        text: 'KevesPoker shows the difference in chips and dollars, blocks settlement while it is non-zero, and offers recount, spread evenly, assign to one player, or split by buy-in. Whichever you choose is saved in the game record, so the adjustment is written down rather than remembered.',
      },
    ],
    faq: [
      {
        q: 'Who pays if the chips come up short?',
        a: 'Whoever the table agrees: one player if someone owns the miscount, everyone evenly if nobody knows, or in proportion to buy-ins. Agree the rule before you look at who it favours.',
      },
      {
        q: 'How small a difference is fine to just split?',
        a: 'There is no fixed number. A few dollars on a big pot is usually a miscount worth splitting. A difference that matches a buy-in exactly usually means a rebuy was never written down, so look for it first.',
      },
      {
        q: 'Can we settle before every stack is counted?',
        a: 'No. Until every stack is counted you cannot know each player’s net, and any list of payments will be wrong for someone.',
      },
    ],
  },
  {
    slug: 'pay-after-poker-venmo-zelle',
    title: 'How to pay each other after poker with Venmo or Zelle',
    description:
      'A simple routine for paying after a home game: one list of who pays whom, a payment note, and a clear way to mark each payment paid and received.',
    published: '2026-10-31',
    blocks: [
      {
        type: 'p',
        text: 'Most home games settle by Venmo or Zelle. The part that goes wrong is not the payment, it is knowing who owes whom and whether a payment arrived.',
      },
      { type: 'h2', text: 'Agree one list first' },
      {
        type: 'p',
        text: 'Settle from a single list of transfers, worked out from the nets, rather than everyone doing their own sums. With one list, each person sees only what they need to pay or collect.',
      },
      { type: 'h2', text: 'Pay in the app you both use' },
      {
        type: 'ul',
        items: [
          'Venmo: search the person’s handle, enter the exact amount, and add a short note so it is recognisable.',
          'Zelle: send to the phone number or email the person has shared with you, for the exact amount.',
        ],
      },
      { type: 'h2', text: 'Close the loop' },
      {
        type: 'p',
        text: 'The payer says it is paid, and the person owed confirms it arrived. Until both have happened, the debt is still open. This is what stops “I already sent it” and “I never got it” turning into a standing argument.',
      },
      { type: 'h2', text: 'How KevesPoker fits in' },
      {
        type: 'p',
        text: 'KevesPoker records who owes whom and shows each player their own payments. For a Venmo payer it opens Venmo with the amount filled in. For a Zelle payer it shows the phone number to send to and the amount. Then the payer marks it paid and the person owed confirms it. No money moves through KevesPoker itself.',
      },
    ],
    faq: [
      {
        q: 'Should we Venmo each other during the game?',
        a: 'Better not. Write buy-ins down as they happen and pay once at the end, from the final list. Paying mid-game means more transfers and more chances to lose track.',
      },
      {
        q: 'What if someone doesn’t have Venmo or Zelle?',
        a: 'Settle that one transfer in cash or by bank transfer. Nothing about the list changes, only how that payment is made.',
      },
      {
        q: 'What if someone says they paid but the money never arrived?',
        a: 'Treat the debt as open until the person owed confirms it. Check the exact handle or phone number used: most lost payments went to the wrong person, not nowhere.',
      },
    ],
  },
  {
    slug: 'bank-or-pay-each-other',
    title: 'Bank or pay each other? Three ways to handle the money at a home game',
    description:
      'A cash bank, one person playing banker, or losers paying winners directly. What each one asks of the host, and how to pick.',
    published: '2026-11-07',
    blocks: [
      {
        type: 'p',
        text: 'Every home cash game has to answer one question before the first hand: where does the money go? There are three common answers. None is wrong, but each puts the work and the risk in a different place.',
      },
      { type: 'h2', text: '1. A cash bank' },
      {
        type: 'p',
        text: 'Players pay cash for their chips, and at the end the bank pays each player the value of their chips. Nobody owes anyone anything when they leave. The cost is that someone has to hold the cash and make change, and players have to bring cash in the first place.',
      },
      { type: 'h2', text: '2. One person plays banker' },
      {
        type: 'p',
        text: 'Losers send what they owe to one person, often the host, who then pays the winners. Each player has a single payment, always with the same person. The banker does all the sending, carries the risk if a loser never pays, and can run into a payment app’s daily limits on a big night.',
      },
      { type: 'h2', text: '3. Losers pay winners directly' },
      {
        type: 'p',
        text: 'Nobody collects anything during the game. Buy-ins are written down, chips are counted at the end, and the losers pay the winners from one shared list. Done well, this takes no more payments than the number of players minus one, and nobody holds the pot.',
      },
      { type: 'h2', text: 'How to pick' },
      {
        type: 'ul',
        items: [
          'Everyone carries cash and you don’t mind making change: a cash bank is the simplest night.',
          'The group is new, or you want one person accountable: a banker, as long as they are happy to chase.',
          'A regular group that pays by app and trusts each other: losers pay winners directly.',
        ],
      },
      {
        type: 'p',
        text: 'Whichever you choose, decide it before the first hand. Switching halfway through the night is how ledgers stop adding up.',
      },
      { type: 'h2', text: 'How KevesPoker does it' },
      {
        type: 'p',
        text: 'KevesPoker is built for the third way. The game admin logs buy-ins as they happen, the chips are checked against the money in, and the app lists who pays whom. Each payment is marked paid by the payer and confirmed by the person owed. KevesPoker never holds or moves money.',
      },
    ],
    faq: [
      {
        q: 'Which way takes the fewest payments?',
        a: 'A cash bank needs no payments after the game, because the money changed hands at the table. Of the two app-based ways, losers paying winners directly usually takes fewer transfers than routing everything through a banker.',
      },
      {
        q: 'Can we mix cash and Venmo?',
        a: 'Yes, as long as the buy-in record is the same either way. Write down every buy-in whether it was cash or an IOU, and settle the final list however each pair prefers.',
      },
    ],
  },
  {
    slug: 'player-leaves-early',
    title: 'A player wants to leave early: how to cash them out',
    description:
      'Count their chips before they go, write the value down, and keep them in the end-of-night settlement. The pot never changes.',
    published: '2026-11-07',
    blocks: [
      {
        type: 'p',
        text: 'Someone always has an early start tomorrow. Cashing them out takes two minutes if it happens at the table, and causes an argument a week later if it doesn’t.',
      },
      { type: 'h2', text: 'Count their chips before they stand up' },
      {
        type: 'p',
        text: 'Count the stack with the player there, say the number out loud, and write it next to their name with the time. That number is their cash-out. They should not take chips home, and nobody should guess the stack after they have gone.',
      },
      { type: 'h2', text: 'Keep them in the settlement' },
      {
        type: 'p',
        text: 'Their net is the value of that count minus everything they bought in for, the same as everyone else’s. If you settle at the end of the night, they are simply one more line on the final list: they pay or get paid once the game is settled. Paying them out of other people’s money on the way out is how a game ends up short.',
      },
      { type: 'h2', text: 'The pot does not change' },
      {
        type: 'p',
        text: 'The pot is the total of all the buy-ins, and it stays that way when someone leaves. What changes is how many chips are still on the table. At the end, the chips counted at the table plus the chips already cashed out must equal the pot.',
      },
      { type: 'h2', text: 'If they change their mind' },
      {
        type: 'p',
        text: 'People announce they are leaving and then play one more hand. That is fine until their chips have been counted and recorded. After that, treat any return as a new buy-in, so the record stays honest.',
      },
      { type: 'h2', text: 'How KevesPoker does it' },
      {
        type: 'p',
        text: 'The game admin cashes the player out from their card: the chips are recorded, the card is marked cashed out, no further buy-ins can be logged for them, and their seat opens for whoever is on the waitlist. The count arrives already filled in when the table counts chips at the end, and the player appears in the final list of who pays whom.',
      },
    ],
    faq: [
      {
        q: 'Can an early leaver be paid right away?',
        a: 'Only if someone hands them cash from their own pocket, which then has to be accounted for. It is simpler to settle them with everyone else at the end of the night.',
      },
      {
        q: 'What if they left without counting?',
        a: 'Agree a number with them as soon as possible and write down that it was agreed later. If the end-of-night count doesn’t balance, treat their stack as the first suspect.',
      },
    ],
  },
  {
    slug: 'weekly-home-game-signups-waitlist',
    title: 'Running a weekly home game: sign-ups, a seat limit and a waitlist',
    description:
      'Replace the group-chat poll with a list that has a seat limit and a waitlist, so you know who is coming and nobody fights over the last seat.',
    published: '2026-11-07',
    blocks: [
      {
        type: 'p',
        text: 'The hardest part of a weekly game is often not the poker, it is getting a full table. A poll in the group chat tells you who is interested, not who is actually coming, and the ninth person to say yes rarely knows they are ninth.',
      },
      { type: 'h2', text: 'Set a seat limit and say it up front' },
      {
        type: 'p',
        text: 'Decide how many seats the table really has, and post it with the game: date, time, place, buy-in and seats. A clear limit is what makes a waitlist fair.',
      },
      { type: 'h2', text: 'First come, first seated, then a waitlist' },
      {
        type: 'p',
        text: 'Seats go in the order people sign up. Once the table is full, the next person goes on a waitlist with a visible position, so they know where they stand. When someone drops out, the first person on the waitlist takes the seat.',
      },
      { type: 'h2', text: 'Make dropping out easy' },
      {
        type: 'p',
        text: 'The worst outcome is a no-show who never said anything while someone on the waitlist stayed home. If withdrawing is one tap, people do it early, and the seat goes to someone who will come.',
      },
      { type: 'h2', text: 'Let the host go over the limit, deliberately' },
      {
        type: 'p',
        text: 'Sometimes one more is fine. The host should be able to seat someone past the limit, but as a choice, not by accident, and the table should see that it is running one over.',
      },
      { type: 'h2', text: 'How KevesPoker does it' },
      {
        type: 'ul',
        items: [
          'The admin creates the game with a seat limit and shares one link in the group chat.',
          'Players tap to join. A full table puts them on the waitlist with their position, and withdrawing moves the next person up.',
          'The game admin can seat someone over the limit after a question that states the numbers, and the count then reads, for example, 9/8.',
          'Guests without an account can be added by name.',
          'When the game starts, only the people who actually showed up are ticked in, so a no-show stakes nothing.',
        ],
      },
    ],
    faq: [
      {
        q: 'How many seats should a home game have?',
        a: 'However many fit comfortably at your table. Most home games run six to nine players at a single table.',
      },
      {
        q: 'Should signing up cost anything?',
        a: 'Not in KevesPoker: signing up is a plan, not money, and no buy-in is recorded until the game starts and the player is there.',
      },
    ],
  },
  {
    slug: 'track-home-poker-with-chatgpt-claude',
    title: 'Track your home poker game with ChatGPT or Claude',
    description:
      'Connect KevesPoker to Claude or ChatGPT and ask what you owe, who is on the waitlist, or how your year is going. What it can do, and what it deliberately can’t.',
    published: '2026-11-07',
    blocks: [
      {
        type: 'p',
        text: 'If you already use Claude or ChatGPT, you can ask it about your home game in plain words instead of opening the app. KevesPoker works as a connector: you add it once, sign in, and your assistant can read your games and do a few things on your behalf.',
      },
      { type: 'h2', text: 'Set it up' },
      {
        type: 'ul',
        items: [
          'Claude: add a custom connector and paste https://www.kevespoker.com/api/mcp, then sign in to KevesPoker when asked.',
          'ChatGPT: turn on developer mode and add the same address as a custom connector. It is not an official ChatGPT app listing.',
          'The first time, you approve a consent screen. Nothing is readable until you do.',
        ],
      },
      { type: 'h2', text: 'Things to ask' },
      {
        type: 'ul',
        items: [
          '“What do I owe from Saturday?”',
          '“Am I on the waitlist for the next game?”',
          '“How am I doing this year?”',
          '“Give me the summary for the group chat.”',
        ],
      },
      { type: 'h2', text: 'What it can do' },
      {
        type: 'p',
        text: 'It reads your groups, games, balances and stats, and what you owe and are owed. As a player it can join or withdraw from a game, mark a payment sent, confirm one received, and update your payment details. A game admin can also create or edit a game, add a player, seat someone from the waitlist, or cancel a game.',
      },
      { type: 'h2', text: 'What it deliberately can’t do' },
      {
        type: 'p',
        text: 'It cannot start a game, log buy-ins or cash-outs, or settle a game. Those happen at the table, in the app. Every change it makes shows you a preview first and only goes through after an explicit yes, and anything done through an assistant is labelled as such in the game.',
      },
    ],
    faq: [
      {
        q: 'Can other people see my questions?',
        a: 'Your conversation stays in your assistant. The connector can only read what you can already see in KevesPoker, as you.',
      },
      {
        q: 'Do I need a paid Claude or ChatGPT plan?',
        a: 'That depends on your assistant’s own rules for custom connectors, which change. Check its current settings for adding a custom or developer-mode connector.',
      },
    ],
  },
  {
    slug: 'guests-without-an-account',
    title: 'Playing with guests who don’t have an account',
    description:
      'A friend of a friend shows up. How a guest can buy in, get paid or pay, and later claim their history, without signing up first.',
    published: '2026-11-07',
    blocks: [
      {
        type: 'p',
        text: 'Every regular game gets walk-ins. Asking a guest to download something or create an account before they can sit down is a bad start, and a ledger that only works for people with accounts breaks the first time someone brings a friend.',
      },
      { type: 'h2', text: 'Write them down like anyone else' },
      {
        type: 'p',
        text: 'A guest’s buy-ins, cash-out and net work exactly like a regular’s. Put their name on the list when they sit down and log every buy-in. What they don’t need is an account.',
      },
      { type: 'h2', text: 'Settle them on the night' },
      {
        type: 'p',
        text: 'Guests are the people you are least likely to see next week, so settle their line before they leave if you can: cash, or a payment to or from whoever the list says.',
      },
      { type: 'h2', text: 'How KevesPoker does it' },
      {
        type: 'p',
        text: 'The game admin adds a guest by name. From then on the guest is a full player in the ledger: buy-ins, cash-out, net and the transfers they are part of. If they come back and want their own login, the group owner or an admin can send them a claim link, and signing in through it gives them their whole history, from their first hand. A claim link works once and then stops working.',
      },
    ],
    faq: [
      {
        q: 'Can a guest see the game on their phone?',
        a: 'Not until they sign in. Until then the admin and the table see everything about their line, so nothing is hidden from the game.',
      },
      {
        q: 'Do guests count toward the seat limit?',
        a: 'Yes. A guest takes a seat like anyone else, and goes on the waitlist if the table is full.',
      },
    ],
  },
]

export function getGuide(slug: string) {
  return GUIDES.find((g) => g.slug === slug)
}
