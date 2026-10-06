# Poker Ledger — what the app actually does

A functional reference: the rules the app enforces and why, written for
someone who needs to know how it behaves rather than how it is built.
[SPEC.md](SPEC.md) is the build spec and goes deeper on design reasoning;
[CLAUDE.md](../CLAUDE.md) holds the engineering non-negotiables.

Live at **kevespoker.com**. Installable as a PWA.

---

## The shape of it

A **group** is a set of people who play together. A **group member** is a
person's place in that group — their name, their history, their money. A
member may or may not be linked to a login:

- **Claimed** — linked to a profile, someone who signed in.
- **Unclaimed** — created by an admin for someone who walked in the door.
  They have real history from their first hand and can claim it later.

Everything in the app references the **member**, never the login. That is
what lets a guest play, be owed money, and claim their record months later
with all of it intact.

A **game** belongs to one group and has **exactly one admin** — a single
column, never a list. Group role grants nothing over a game: an owner who
isn't the game admin cannot log a buy-in.

---

## Who can do what

| | Group owner | Group admin | Member | Game admin |
|---|---|---|---|---|
| Create a game | ✅ | ✅ | ✅ | — |
| Log buy-ins, cash outs, settle | ❌ | ❌ | ❌ | ✅ |
| Add/remove players from a game | ❌ | ❌ | ❌ | ✅ |
| Add members to the group | ✅ | ✅ | ❌ | (guests only) |
| Remove a member | ✅ | ✅ | ❌ | ❌ |
| Change roles | ✅ | ❌ | ❌ | ❌ |
| Edit group settings / photo | ✅ | ✅ | ❌ | ❌ |
| Delete the group | ✅ | ❌ | ❌ | ❌ |
| Cancel a game | ✅ | ❌ | ❌ | ✅ |

**Authorization is Row Level Security, not the UI.** Hiding a button is not
a permission — every rule above is a Postgres policy, and the app assumes
someone will open devtools. Writes also run through column-level grants: a
policy says *which rows*, a grant says *which columns*. `games.status`,
`group_members.role`, `signup_order` and `buyins.created_at` are not
client-writable at all; they move only through functions that check who is
asking.

---

## The game, start to finish

A game is always in exactly one of five states, and the whole screen changes
with it. There is **one page per game** — no separate admin route.

### 1. Scheduled

Signing up is a plan, not money. **No money is shown anywhere** on this
screen: no pot, no buy-in counts.

- One tap to join or withdraw. Full table → you land on the waitlist with
  your position.
- The admin can add an existing member or type a **guest's name**, which
  creates an unclaimed member on the spot.
- **Seat limit is a default, not a wall.** The admin can seat a waitlisted
  player into a full game after one question that states the numbers —
  *"This game is full (8/8). Adding Dean will make it 9 players."* The count
  then reads **9/8 · 1 over** everywhere. Self-signup at the limit still
  queues; only the admin goes over, and only after being asked.
- **Start game** opens a checklist of everyone confirmed, all ticked. Only
  the ticked ones get a buy-in. Somebody who RSVP'd and didn't show stakes
  nothing.

### 2. Active

The admin's screen becomes the **tap grid** — the part that has to be good,
because it's used one-handed at a table at 1am.

- **One tap = one buy-in** at the default amount. No confirmation dialog:
  speed beats accuracy here because void exists.
- **5-second undo toast** after every tap.
- **Long-press** (or the ⋯ button) opens a sheet: custom amount, a note,
  void a specific buy-in, remove the player, or cash them out.
- Running **pot** pinned to the top, in dollars with chips underneath.
- Everything is live over Realtime, so all nine phones agree. That kills the
  *"did you write mine down?"* argument, which is most of the value.
- **Offline**: if the phone is genuinely offline the tap is queued on the
  device and sent when the connection returns, with a visible count. If the
  write is *refused*, an error toast says why — at the bottom, above any
  open sheet, because an error printed off-screen is indistinguishable from
  nothing happening.

**Buy-ins are append-only.** Nothing is ever updated or deleted — a
correction sets `voided_at`, who voided it, and why. The audit trail is the
product. Every player sees the live feed of every buy-in with a timestamp
and who logged it, and the admin logging their own gets a marker. One person
having sole write access to everyone's money is a trust concession, and the
control on it is visibility, not permission.

**Cashing out mid-game.** Someone leaves at 11pm: the admin counts their
chips from the ⋯ menu and records them. That player's card dims and reads
*"✓ Cashed out · N chips"*, their seat frees for the waitlist, and no further
buy-ins can be logged for them — enforced in the database, not by the dimmed
card. Undo exists for the person who announces they're leaving and then
stays for one more hand; it's refused once chips are being counted, and
refused if the waitlist already took the seat.

The pot never changes when someone cashes out — it is the sum of the buy-ins
and always will be. A second figure appears, **on the table**: pot chips
minus chips already paid out. If cashed-out chips ever exceed the pot, that's
provably a miscount and the header says so immediately.

### 3. Reconciling (counting chips)

In a real game the counts almost never balance, and today that gets resolved
by arguing. This is the screen that replaces the argument.

- Chip entry is **non-negative integers only** — non-digits are stripped as
  you type, pasted text is cleaned rather than refused, numeric keypad on
  mobile.
- **Empty ≠ zero.** An empty field means "not counted yet"; `0` is a real
  entry for a player who busted. They are never conflated.
- Anyone who cashed out mid-game arrives **already entered**, marked with the
  time it was taken. Still editable. *"3 players left"* means three people
  still at the table, not three including someone who left two hours ago.
- A **live distribution tracker** is pinned to the bottom: pot, counted,
  remaining, in chips and dollars, updating as you type. It distinguishes
  "still counting" from "over by" so it doesn't cry wolf.
- **Assign remainder** fills the last uncounted player with what's left —
  explicit, never silent.
- *"Back to the game"* returns it to active if chips need to keep moving.
  Counts already entered survive.

**The settle gate.** If the counts don't balance, four resolutions:

| Mode | What it does |
|---|---|
| Recount | Go fix a number. The default, and usually right. |
| Spread evenly | Divide the difference across all players |
| Assign to one player | Someone admits they miscounted |
| Split by buy-in | Proportional to what each put in |

Each writes to `game_adjustments`, so the fudge is in the ledger rather than
in someone's head. Re-resolving replaces the previous resolution.

**The button being disabled is a courtesy; the database is the guarantee.**
`settle_game()` recomputes the nets itself and refuses while any count is
missing, while the nets don't sum to zero, or while the submitted transfers
don't zero every player out.

### 4. Settled

- **Results table**: everyone's in, out, and net, biggest winner first.
- **Who pays who**, computed by a minimum-transfer solver. The admin sees
  every transfer; a player sees only their own, framed as an action —
  *"Pay Gilad $80"* — with a Venmo deep link.
- **Poker and food stay separate line items**, even between the same two
  people. *"You won $80 at cards and owe me $25 for the pizza"* are two
  different conversations.
- **Status is never carried by colour alone** — every state has a glyph and
  a word, because a colourblind player is being told what they owe.
- The **confirmation counter is the viewer's own**: a player with two
  transfers sees *"0 of 2"*, not the game's eight. The admin sees all eight,
  because chasing payments is the job.
- **Copy summary for WhatsApp** — plain text to paste in the group chat,
  where the group actually lives.

**The handshake.** The payer marks paid; the payee confirms received. Only
those two, in that order, and the amounts and parties are immutable once
settled. The game admin can **close out** a transfer when a payee won't
confirm in the app — never on their own debt — and the row then says who
closed it rather than implying the payee acknowledged it.

### 5. Cancelled

Keeps everything — roster, buy-ins, audit trail. It just means no settlement
will be computed.

---

## Money

**Integer cents, always.** Every conversion between cents, dollars and chips
lives in one module. No floats anywhere in the money path.

**No money moves through this app.** Venmo deep links and manual
confirmation only — that is a deliberate product decision, not a gap, and it
keeps the whole thing clear of money-transmitter territory.

**Payment handles.** Venmo handle or a phone for Zelle, set in Settings. A
handle is accepted with or without the `@` and stored without it. A phone
number is readable **only** by someone who actually owes that person money
in a settled game, or by the game admin — it's in no table grant and reaches
the screen through a function that checks exactly that.

**Chip ratio and buy-in amount are snapshotted onto the game** when it's
created. A past game is always computed with the numbers it was played
under, never with whatever the group's defaults say today.

---

## Food orders

A delivery split across whoever ate, kept as its own line item and never
netted into the poker transfers.

- **Only the payer is ticked by default.** Not everyone eats, and an
  all-checked list means someone has to notice and untick four people —
  silently billing a player $25 for food they never saw is worse than the
  extra taps. *Select all* is one tap for the night everyone did order.
- Per-person **fixed amounts** are allowed; the rest split the remainder
  evenly. A live footer shows total, assigned and remaining as you type.
- Remainder cents go to the earliest signups, so the split always adds up
  exactly.
- **Visible to participants and the game admin only** — not to the rest of
  the group.

---

## Joining

Three ways in, all idempotent — clicking five times produces one membership
and one signup.

| Link | What it does |
|---|---|
| **Group invite** `/join/[code]` | Joins the group. Reactivates a previous member onto their original row rather than creating a second. |
| **Game link** `/games/[id]/join` | Joins the group *and* handles the game, in one transaction |
| **Claim link** `/claim/[code]` | Takes over an unclaimed member and its entire history |

The **game link** is the interesting one — one URL pasted into WhatsApp,
with share text generated alongside it:

- **Scheduled with room** → seated.
- **Scheduled and full** → waitlisted, told so, with their position.
- **Active** → joins the group, lands in the waitlist for the admin to seat.
  A forwarded link does not get to seat someone into a game with money on
  the table.
- **Settled, cancelled, or being counted** → group only, with a note.
- **Already signed up** → straight to the game, no message.

Signed out, any of these routes through login and comes back — including
the Google round trip. Never the home page; that's the case most likely to
break.

**Claim codes are not readable by anyone.** Owners and admins fetch their
own group's codes through a gated function, and a code is destroyed the
moment it's used. A claim link is a working key to someone's identity and
financial history.

---

## Visibility

Any group member can open **any game in the group**, whether or not they
played: the roster, the pot, the buy-ins, the cash outs, the results table.

Two things stay narrower:

- **Settlements** — the two parties and the game admin. A non-participant
  sees the results and the pot, not who owes whom.
- **Food orders** — participants and the game admin.

---

## Stats

Per group, settled games only:

- Lifetime net, games played, biggest win, biggest loss, current streak
- A running balance chart over the season
- The **zero line** is the part that matters — above or below it is the
  whole question

A game is dated by **the night it was played** (`started_at`, falling back
to the scheduled time). A game that ran on Saturday and settled on Sunday
afternoon is a Saturday game.

---

## Times

Every time is rendered in the **group's own timezone** — an IANA identifier,
never a fixed offset, because a hardcoded −5 is wrong from March to
November. What the admin types when creating a game is what the group sees,
wherever either of them is standing. Server and browser format identically,
so the time doesn't change shape when the page hydrates.

---

## Accounts

- **Magic link or Google.** No passwords.
- **Onboarding** is three short steps — name, how you get paid, photo —
  every one skippable, and the flag is set whether you finish or skip,
  because asking again every login is nagging.
- Skipping the **payment step** asks once: *"You won't be able to get paid."*
  Framed as what they lose, not as a field the app wants. Skip anyway works
  and nothing asks twice. A dismissible banner on the home page and a card
  on any settled game where they're owed money carry the same sentence,
  because a warning during setup is forgotten by the time it matters.
- **Skip never discards what you typed** — it saves anything valid first.
- Display name follows the profile: change it once and it updates everywhere,
  including games played years ago.

---

## Admin analytics

`/admin`, owner only. Gated on an environment variable holding one user id,
checked in middleware and again in the page; anyone else gets the ordinary
404. Growth, retention, the onboarding funnel, engagement, and product
health — reconciliation rate, settlement confirmation rate, stale debts,
voided buy-ins per game, abandoned games.

Aggregates and counts only. No emails, no phone numbers, no handles, and no
amounts between named people. The functions that produce it are callable by
the service role alone.

---

## Agents

Players can connect their own AI app (Claude, ChatGPT) to Poker Ledger and
ask about their poker in plain words. Setup is in [MCP.md](MCP.md); this is
what the agent is and isn't allowed to do, and why.

**It is you, with read-only access.** The connector signs in as the player,
through the same Google or magic-link login, and a consent screen names the
app and says what it will see. Every request then reaches the database with
that player's own token — so every row-level policy and column grant applies
exactly as it does in the app. There is no agent permission layer to get
wrong: ask for a game in a group you don't belong to and the answer is the
same as devtools would give, *not found*. The service-role key is not part of
this code path, and a test keeps it that way.

**What it can read**

- **Your groups** — name, your role, the group's timezone.
- **Games** — date, status, seats (`9/8 · 1 over`, never clamped), and whether
  you're seated or waitlisted, with your waitlist position.
- **One game** — roster, waitlist, admin. A **scheduled game shows no money**,
  same as the screen. Once it starts, the pot and each player's buy-in total;
  once settled, everyone's in, out and net, which is already public inside the
  group.
- **Settlements** — only the ones the database lets you see: your own, or all
  of them if you ran the game. Poker and food are separate lines, never netted.
- **Your stats** — lifetime net, games played, streaks, biggest win and loss,
  and your net in every game, so the agent can answer questions we never
  built a screen for. Settled games only, dated by the night they were
  played.
- **Your balances** — what you ended each settled game with.
- **What you owe and are owed** — with the handshake status (pending, paid,
  confirmed) and, on what you owe, a Venmo link. The link is the same
  prefilled payment the app builds. No money moves through Poker Ledger or
  through the agent.

**What it can't do, and why**

- **Write anything.** Not a signup, a buy-in, a settlement, a "mark paid".
  Phase one is read-only on purpose: a write tool is a new database function
  with its own policy first, and only then a tool. An agent should not be able
  to move someone's money on the strength of a sentence it misread.
- **See anything in the live game** — the buy-in feed, cash-outs as they
  happen. The tap grid is a human's job at a table.
- **See phone numbers.** The database function that returns a payee's Zelle
  number also returns it to the agent's code; the tool drops it and a test
  pins that. Venmo handles are shown, because they go into the link.
- **See claim codes, invite links, group settings, member lists, roles or
  the `/admin` analytics.** A claim code is a working key to someone's
  identity and an invite link has no expiry; neither belongs in a chat
  transcript. Role and membership changes stay in the app.
- **See other people's debts.** A game admin can see every transfer in their
  game in the app, but the agent only reports the ones you are party to — the
  question being asked is *yours*.

**Consent and revocation.** Any signed-in player can approve a connector; the
screen names the app. Disconnecting it in the AI app ends its access.
Because Supabase allows AI apps to register themselves, the consent screen
is the control: nothing is readable until a person says yes to a named app.

**What we record.** One row per tool call: who, which tool, success or not,
how long. No arguments, no amounts, no error text. It exists to measure
adoption, and no client can read it, including its owner.

---

## Things that are deliberately not true

Worth stating, because each one looks like a bug until you know why:

- **No limit on buy-ins.** A player can rebuy as many times as they want —
  that's a cash game. The card switches from pips to a number past six.
- **Removing a player voids their buy-ins and shrinks the pot.** That is
  *not* the same event as cashing out early. Removal is for the person who
  never sat down; a player who played and left records a cashout and stays
  in the settlement math.
- **Settlement never nets poker against food.**
- **Seat limit can be exceeded**, on purpose, by the admin.
- **Lowering the seat limit below the confirmed count is refused** rather
  than demoting someone automatically. Who loses a seat is a decision about
  people, not a number.
- **An over-limit game reads 9/8**, never clamped to 8/8.
- **The group invite link has no expiry and no revocation.** Anyone with it
  can join. Same as it has always been — worth knowing, not currently a
  feature.

---

## Scale and shape

39 migrations · 170 tests across 14 pure modules · one Next.js app on Vercel,
one Supabase project. The testable rules live in `lib/` with no I/O:
settlement, splitting, money, time, seats, stats, joins, game edits.
