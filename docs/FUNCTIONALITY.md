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
ask about their poker in plain words, do a handful of the things a player can
do themselves, and, if they run the game, a handful of the things a game admin
can do. Setup is in [MCP.md](MCP.md); this is what the agent is
and isn't allowed to do, and why.

**It is you, signed in.** The connector signs in as the player, through the
same Google or magic-link login, and a consent screen names the app and says
what it can do. Every request then reaches the database with that player's own
token — so every row-level policy and column grant applies exactly as it does
in the app. There is no agent permission layer to get wrong: ask for a game in
a group you don't belong to and the answer is the same as devtools would
give, *not found*. The service-role key is not part of this code path, and a
test keeps it that way. Each action goes through the same table update or
database function the app's own button uses, never around it.

### What it can read

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
  and your net in every game. Settled games only, dated by the night they were
  played.
- **Your balances** — what you ended each settled game with.
- **What you owe and are owed** — with the handshake status and, on what you
  owe, a Venmo link. No money moves through Poker Ledger or through the agent.
- **Who is in a group** — names and member ids only, so "add Dean" can be
  turned into a member. No contact details, handles, roles or claim status.
- **The WhatsApp summary** of a settled game — the same text the app's *Copy
  summary for WhatsApp* button copies, from the same code, for the game admin.

### What it can do

Five player actions, and nothing an admin does.

| Action | What it does | Same as |
|---|---|---|
| Join a game | Seated if there is room, waitlisted with a position if full, queued for the admin if the game is running; refused if settled, cancelled or being counted. Already in: reports where you stand and changes nothing | Opening the game link |
| Withdraw | Gives up the seat; the next waitlisted player moves up. Allowed whenever the app allows it: scheduled, or running with no buy-in of yours in the pot | The Withdraw button |
| Mark a transfer paid | You are the payer: records that you sent the money | The Paid button |
| Confirm a transfer received | You are the payee: records that the money arrived and closes the debt. Works from pending or paid, as in the app | The Confirm button |
| Update payment details | Venmo handle and Zelle number, with Settings' own validation. Omitted fields are kept | Settings |

Joining only works for games in groups you already belong to: the game is read
through row-level security first, so a link to someone else's game is *not
found* rather than an invitation to join their group.

### What the game admin can do

A game has exactly one admin, and the database knows who. These work only for
that person: **group role grants nothing over a game**, so an owner who is not
the game admin cannot add a player here any more than in the app. (Cancelling
is the one exception, as in the app: the game admin or the group owner.) A
refusal is one sentence and the agent is told to say so rather than look for
another way.

| Action | What it does | Same as |
|---|---|---|
| Create a game | Date and time are read on the group's own clock, in its IANA timezone, so 8 PM is 8 PM at the table on either side of a clocks-change. Seat limit, buy-in and chip ratio come from the group and are snapshotted onto the game. The creator becomes the game admin and, unless they say otherwise, takes a seat. A time that does not exist, or a date that is not real, is refused rather than slid to another time | The new-game form |
| Edit a game | Time, location, name, seat limit. The database decides what may change: time and seats only while scheduled; name and location until it is finished. Lowering the limit below the number confirmed is refused with the app's reason, and nobody is ever demoted. Raising it seats the waitlist in order | The edit form |
| Add a player | An existing member, or a guest by name, who becomes an unclaimed member as in the app. A seat if there is room, the waitlist if not; adding never takes the table over its limit. A guest whose name matches an existing member is refused, with that member's id, so nobody ends up in the group twice. Never shows or creates a claim code | Add player |
| Seat from the waitlist | If the table is full, the preview is the app's own question, word for word — *"This game is full (8/8). Adding Dean will make it 9 players. Continue?"* — and going over happens only after a yes to that | The waitlist panel |
| Cancel a game | Keeps the roster, every buy-in and the audit trail; it only means no settlement will be computed. Refused for a settled game or one with unpaid transfers | The danger zone |
| Close out a transfer | For a payee who will not confirm in the app. Never on a transfer the admin is part of: a payer cannot close out their own debt, and a payee confirms. The transfer then says who closed it out, not that the payee confirmed it | The close-out button |

Each takes the same two steps as the player actions. One addition: **the yes
is bound to the outcome it was given for, not just the request.** A yes to
*"they would get a seat"* does not cover a waitlist spot if the table fills
before the commit; a yes to a free seat does not go over the limit; a yes to
a game created with the group's numbers does not cover changed numbers. When
the facts differ the confirmation stops working and the user is asked again.
The same applies to `join_game`.

### Nothing that matters happens on one call

Joining, withdrawing, marking paid and confirming each take **two calls**:

1. The first returns a **preview** in words — *"You're marking that you paid
   Gilad $80 for poker from Oct 2. Only say yes if the money has actually been
   sent. Confirm?"* — and a confirmation token. Nothing has changed.
2. The agent shows the preview to the user and waits for a real yes, then
   calls again with the token.

The token is how the server knows the user was shown *this* action. It is
signed, valid for five minutes, and bound to the user, the tool and the exact
arguments: a token from one preview cannot confirm another transfer or another
game. It works once; the database refuses a replay. The tool descriptions tell
the agent never to confirm for the user and never to infer that a payment
happened. That last part is a request, not a guarantee, which is why the money
steps are also visible to the people they involve (below).

Anything that is already true is answered at once without a token — already
seated, already marked paid — so repeating a request is safe. A refusal
(*"Only the person being paid can confirm they received it"*) is one sentence;
the database's own error text is never passed through.

Changing payment details skips the two steps, because it affects only you and
can be changed back, but it says exactly what it saved. A phone number is
shown only as its last four digits.

### Interactive view (MCP Apps)

Six **display tools** can draw a small version of the app inside the chat, in
apps that support MCP Apps (Claude on web, desktop and mobile). Each returns
exactly the text its lookup counterpart does, so an app that does not draw the
page, or an agent that only reads, loses nothing.

**A screen only when the screen is the answer.** The page is attached to the
display tools, never to the lookups. The agent uses a lookup (`list_games`,
`get_game`, `get_my_stats`, …, which draw nothing) for anything it works out by
combining, counting, comparing or filtering, and a display tool (`show_groups`,
`show_group`, `show_game`, `show_my_stats`, `show_balances`,
`show_outstanding_debt`) once, only when you ask to see that screen. "What was my
balance in September?" is answered in words; "show my stats for Poker @ NYC"
draws the screen.

It is laid out as the app's own screens are, from the app's own styles: the
same cards, rows, tabs, state banner, spacing and money colours, with pictures
for people and groups. It is always in light mode whatever theme the chat is in
(`THEME` in `widgets/app/main.ts` switches it to follow the chat). Opened by
whichever display tool ran, it starts on that tool's screen.

From there you can click through, as in the app: a group, then its **Games**,
**Members** and **My Stats**, then a game, with Back and Home buttons.

| Screen | What it shows |
|---|---|
| Your groups | Each group with your lifetime net and its member count; links to *What you owe* and *My results* |
| A group: Games | **Happening now** (scheduled and running games, soonest first, each with its live tag and seats) and **History** (finished games: the night, how many played, the pot, and your result). History shows the five most recent with a **Show all** button for the rest (**Show fewer** folds it back); a history one game over the limit is shown whole |
| A group: Members | Who is in the group, with their picture, and *(you)* beside your own name. No roles, games played or contact details, which the agent is not given |
| A group: My Stats | Total net, the running-balance chart with a labelled zero line (tap a point for that game), average, win rate, best and worst game, streaks, total bought in |
| A game, scheduled | The state banner (with the buy-in in chips, or *Never started* once the start time has passed), your status with a small **I'm in** / **Join waitlist** / **Withdraw** button, then the confirmed players as rows with their pictures and the waitlist numbered. No money, as on the screen |
| A game, started or settled | The state banner; once settled the total pot and the Player / In / Out / Net table, and your settlements (or who pays whom, for the game admin). While running, who is in and what each put in. Read-only |
| What you owe | Poker and food kept apart, owed and owing never netted. No Venmo links and no buttons |
| My results | Your net in every settled game, newest first |

**What the buttons do.** Join and Withdraw run the same two steps as above,
but the user's click is the yes. The first click calls the tool with no token
and shows the server's preview in the card, with **Confirm** and **Cancel**;
nothing has changed. Confirm calls it again with the token, then the card
reloads from the server and tells the chat what happened, so the conversation
and the card agree. A refusal (expired confirmation, table changed, already
signed up) is shown in the card in the server's own words. Confirmations work
once, so a second tap on a used one is refused. Moving to a game also tells the
chat which game is on screen.

**Open in Poker Ledger.** A link at the bottom of each screen asks the app to
open the matching page of the site (the group, or the game) in the browser. The
site it points at is the one the server is running as: production on
production, a preview's own address on a preview.

**What the view can't do.** It has no access of its own: no database, no token,
and no way to make a request. Everything it shows came in a tool result, and
everything it does is a call to a tool through the app, as you, under the same
row-level security. The one thing it loads from outside is pictures, and only
from two places: this project's public storage (where profile and group
pictures live) and Google's picture host (a Google sign-in hands over a photo
address). The host enforces that list; any other address, a request, a frame
or a script is blocked. A picture that does not load falls back to initials on
the person's colour, as in the app, and the page says so in one small line at the
foot (which address, which rule, and the policy the app applied), so a blocked
picture is never a silent circle.

The pictures and a few list numbers (players and pot for a finished game, and
which member is you) reach the view in the result's `_meta`, which the app
hands to the page and does not show to the model. The text every tool returns
is unchanged, and everything in `_meta` is already visible to the signed-in
user in the group.

It cannot do anything an admin does, move money, mark a payment, or show the
live game (buy-ins, cash-outs, settling). Those stay in Poker Ledger, which is
what the link is for. The app's font is not loaded, so type is the device's own.
Names and places from the database are shown as text, never as markup.

One difference worth knowing. With only the chat, "never confirm for the user"
is a request to the model. In the card it is the Confirm button. The server
cannot tell a tap from a model's call; what it checks is unchanged: the
token is signed, bound to the user, the tool, the game and the outcome the
user was shown, and works once. A join made through the card carries the same
*via AI agent* label, because it goes through the same tool.

### Everything an agent does is visible

The app's rule is that money-related actions are visible, and an agent acting
for a player is one more fact worth showing:

- A seat or waitlist spot taken through an agent reads *"· via AI agent"* next
  to the name, the way an admin logging their own buy-in gets a marker. The
  label belongs to that one signup: if someone joins by agent, withdraws, and
  rejoins by hand, the new signup carries no label.
- A payment marked paid, confirmed or closed out by an agent says so on the
  transfer.
- A short **Agent activity** list on the game covers the rest — a game
  created, edited or cancelled, someone added or seated, a withdrawal — which
  leave no single row to label.

A payment marker is visible only to people who can already see that payment —
the two parties and the game admin — so it can never reveal who owes whom. A
marker is written only after the action has committed, by a function that
checks it really happened to the caller. If the label cannot be saved, the
action still stands and the agent is told to say so.

### What it can't do, and why

- **The parts of running a game that handle the chips and the pot.** No
  starting a game, buy-ins, cash-outs, chip counts, reconciliation or settling;
  no removing a player (that voids their buy-ins); no food orders. A sentence
  misread by an agent should not move the pot.
- **Anything about the group itself.** No role changes, removing members, group
  settings, invite links or claim codes.
- **Anything an admin does, for someone who is not the admin.** Ask a game
  you do not run and the answer is the same as the app's.
- **See anything in the live game** — the buy-in feed, cash-outs as they
  happen. The tap grid is a human's job at a table.
- **See phone numbers.** The database function that returns a payee's Zelle
  number also returns it to the agent's code; the tool drops it and a test
  pins that. Venmo handles are shown, because they go into the link.
- **See claim codes, invite links, group settings, member lists, roles or the
  `/admin` analytics.** A claim code is a working key to someone's identity and
  an invite link has no expiry; neither belongs in a chat transcript.
- **See other people's debts.** A game admin can see every transfer in their
  game in the app, but the agent only reports the ones you are party to.
- **Change a lot, fast.** Each user has a limit on previews and on committed
  changes in any ten minutes.
- **Create a game twice by accident.** A game already at that exact time is
  flagged in the preview, and each confirmation works once.

**Consent and revocation.** Any signed-in player can approve a connector; the
screen names the app and lists what it can do. Disconnecting it in the AI app
ends its access. Because Supabase allows AI apps to register themselves, the
consent screen is the control: nothing is readable or changeable until a person
says yes to a named app.

**What we record.** One row per tool call: who, which tool, success or not,
whether it was a read, a preview or a commit, and how long. No arguments, no
amounts, no error text, no tokens. It exists to measure adoption, and no
client can read it, including its owner.

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

42 migrations · 170 tests across 14 pure modules · one Next.js app on Vercel,
one Supabase project. The testable rules live in `lib/` with no I/O:
settlement, splitting, money, time, seats, stats, joins, game edits.
