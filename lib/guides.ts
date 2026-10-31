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

export type Guide = {
  slug: string
  title: string
  description: string
  /** ISO date the guide was first written. */
  published: string
  blocks: Block[]
}

export const GUIDES: Guide[] = [
  {
    slug: 'settle-a-home-poker-game',
    title: 'How to settle a home poker cash game',
    description:
      'Work out what each player won or lost, check the chips against the money in, and pay the fewest transfers. A worked example with six players.',
    published: '2026-10-31',
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
      { type: 'h2', text: '3. Turn nets into the fewest payments' },
      {
        type: 'p',
        text: 'You do not need everyone to pay everyone. Pair the biggest debtor with the biggest creditor, settle as much as one of them can, and repeat. This never takes more payments than the number of players minus one.',
      },
      { type: 'h2', text: 'A worked example' },
      { type: 'example' },
      { type: 'h2', text: 'Doing it in KevesPoker' },
      {
        type: 'p',
        text: 'KevesPoker follows exactly this order. The admin logs buy-ins during the game, the chip count is compared with the money in, and the game cannot settle until the difference is zero. It then lists who pays whom. No money moves through the app: players pay each other, and each payment is marked paid and then confirmed received.',
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
  },
]

export function getGuide(slug: string) {
  return GUIDES.find((g) => g.slug === slug)
}
