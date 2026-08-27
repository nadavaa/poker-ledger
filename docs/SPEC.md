# Poker Ledger — Build Spec

A web app that replaces the WhatsApp poll + notes-app + Venmo-hub workflow for a recurring home poker cash game. Handles signup with waitlist, live buy-in tracking, end-of-game reconciliation, and minimum-transfer settlement.

---

## 1. Platform decision: PWA, not a native app

Build a mobile-first web app installable to the home screen. Do not build for the App Store.

Reasoning:

**Distribution matches the existing habit.** The group already coordinates by pasting things into WhatsApp. A URL works there. An App Store listing means every player has to search, download, and accept an update every time you ship. Half of them won't.

**Mixed devices.** iPhone and Android in the same group means either two codebases or React Native. Neither is worth it for nine people.

**Iteration speed.** If a bug shows up mid-game at 11pm, you push a fix and everyone has it on refresh. App Store review would take days.

**Nothing here needs native APIs.** No camera, no location, no background processing. Push notifications are the only real gap, and iOS 16.4+ supports web push for installed PWAs. Even without it, WhatsApp is a better notification channel than push for this group — the app should generate shareable message text rather than compete with WhatsApp.

**Interview framing.** "I picked a PWA because distribution was already happening through a WhatsApp thread and iteration speed mattered more than native APIs" is a better answer than "I built it in Swift because that's what I know."

Tradeoff to acknowledge: no offline mode. If Gilad's apartment has bad wifi, buy-in logging breaks. Mitigation in Phase 6 (optimistic local writes with a sync queue). Not a Phase 1 concern.

---

## 2. Stack

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js 15, App Router, TypeScript | Server components for data-heavy list views, route handlers for the settlement endpoint |
| DB + Auth | Supabase (Postgres, Auth, RLS, Realtime) | Row-level security maps directly onto the admin-only-writes requirement. Realtime gives live buy-in counts for free |
| Styling | Tailwind + shadcn/ui | Fast, and the default components are fine for this |
| Hosting | Vercel | Zero config with Next |
| Tests | Vitest | The settlement solver needs real tests |
| State | React Server Components + Supabase Realtime subscriptions | Skip Redux/Zustand, there isn't enough client state |

No ORM. Use the Supabase client directly with generated TypeScript types (`supabase gen types typescript`). Prisma on top of Supabase adds a layer that fights RLS.

---

## 3. Core domain model

### 3.1 The identity problem, and how to solve it

You asked for "login or join as guest." Guest accounts are the wrong shape here — they fragment history, which is the whole point of logging in.

Better model: **a person in a group is a `group_member` row, which may or may not be linked to an auth account.**

- Gilad can add "Yoni" to the group before Yoni has ever opened the app. Yoni is a real member with a real balance and real game history.
- Later Yoni gets an invite link, signs in, and *claims* that member row. All his history is already there.
- Everything in the system references `group_member_id`, never `auth.user.id`.

This gives you guest-like frictionlessness without the data loss.

### 3.2 Money and chips

**Store all money as integer cents. Never use floats.** `amount_cents INTEGER`.

Chips and dollars are separate units linked by a group-level ratio. Your group runs 2 chips per dollar ($50 buy-in = 100 chips). Store `chips_per_dollar` on the group, and **snapshot it onto each game** so that changing the group default later doesn't silently rewrite past results.

```
cashout_cents = round(chips * 100 / chips_per_dollar)
net_cents     = cashout_cents - sum(buyin_cents)
```

### 3.3 Buy-ins are append-only

Never update or delete a buy-in row. Every buy-in is an immutable event. Mistakes are corrected by voiding (soft delete with `voided_at`, `voided_by`, `void_reason`). This gives you a full audit trail, which is exactly what's missing from Gilad's notes app today. When someone says "I only bought in three times," you can show the timestamps.

### 3.3a Signing up is a plan; starting the game is the stake

A signup is an intention to play, not chips on the table. Games routinely
start before everyone has arrived, so nothing stakes money automatically and
no buy-in or stake amount is shown for a `scheduled` game.

The admin hits **Start game** and gets a checklist of everyone with a
confirmed seat, defaulted to all checked. Whoever is actually at the table
stays checked; the rest get unchecked. Starting writes one buy-in at the
game's snapshotted `default_buyin_cents` for each checked player and flips the
game to `active`. Latecomers are added with an ordinary tap as they walk in.

This is one transaction (`start_game`), so a game never ends up `active` with
half its opening buy-ins written.

Chips are derived in Postgres by `cents_to_chips()`, the SQL counterpart to
`centsToChips()` in `lib/money.ts`. The conversion has exactly one home per
runtime; do not add a third.

### 3.4 Game ownership: one admin, always

Any member can create a game. Whoever creates it becomes its admin, and a game has exactly one admin at all times.

**Enforce this through schema shape, not validation.** Admin is a single non-null `admin_member_id` column on `games`. There is no join table, no admin role flag, no array. A column holds one value, so the invariant is impossible to violate. Don't model it as `game_admins(game_id, member_id)` with a check constraint counting rows, because that's an invariant you'd have to defend forever against concurrent writes.

Consequences worth being deliberate about:

**Group role and game role are separate.** Being a group owner does not give you write access to someone else's game. If you created the group but Yoni created tonight's game, Yoni controls the buy-ins and you don't. This is correct: the person running the table is the person tracking the chips.

**Admin is independent of playing.** The admin is usually also a player, but doesn't have to be. Someone who deals but doesn't play still gets the admin role. Someone who plays but didn't create the game is just a player. Keep `admin_member_id` and `game_signups` completely decoupled.

**Handoff is required, not optional.** Gilad's phone dies at 11pm mid-game. Without transfer, the game is frozen and unsettleable. The current admin can hand the role to any active group member with one tap. Every transfer writes a `game_admin_transfers` row and shows in the game activity feed, so nobody can quietly take over.

**Escape hatch for a dark admin.** If the admin becomes unreachable and can't hand off, the group owner can force-reassign. This is the single exception to "group role doesn't grant game power," and it's necessary — otherwise an abandoned game locks $500 of settlements forever. Guard it: log it with `was_forced = true`, require a reason, and post it visibly in the game feed. Consider a 24-hour cooling window before it's available on an `active` game.

### 3.5 Creating a game for a new set of friends

Your example — starting a game with a different group — is really a request for a new *group*, since balances and history need a container to live in. Don't make the user learn that distinction.

Make "New Game" a single flow: pick a date, then pick an existing group from a list *or* type a new group name in the same field. If they type a new name, create the group, add them as owner, add them as admin of the game, all in one transaction. They experience one action. The data model gets the container it needs.

Do not allow games with a null `group_id`. It's tempting for the ad-hoc case, but it breaks the cross-week balance tracking that is the whole reason to have accounts.

Balances never merge across groups. Your net with the Tuesday crew and your net with the college friends are separate numbers on separate cards. Same person, same login, two ledgers.

---

## 4. Database schema

```sql
-- ============ PROFILES ============
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  avatar_url text,
  venmo_handle text,
  created_at timestamptz not null default now()
);

-- ============ GROUPS ============
create table groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  invite_code text not null unique default encode(gen_random_bytes(6), 'base64url'),
  chips_per_dollar numeric(10,4) not null default 2,
  default_buyin_cents integer not null default 5000,
  default_seat_limit integer not null default 9,
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now()
);

create type member_role as enum ('owner', 'admin', 'member');

create table group_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups(id) on delete cascade,
  profile_id uuid references profiles(id) on delete set null,  -- null = unclaimed
  display_name text not null,
  role member_role not null default 'member',
  claim_code text unique default encode(gen_random_bytes(6), 'base64url'),
  venmo_handle text,          -- overrides profile handle if set
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (group_id, profile_id)
);
create index on group_members (group_id);
create index on group_members (profile_id);

-- ============ GAMES ============
create type game_status as enum ('scheduled','active','reconciling','settled','cancelled');

create table games (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups(id) on delete cascade,
  name text,                                  -- optional, e.g. "Labor Day game"
  scheduled_at timestamptz not null,
  location text,
  seat_limit integer not null default 9,
  -- snapshotted from group at creation so history never changes:
  default_buyin_cents integer not null,
  chips_per_dollar numeric(10,4) not null,
  status game_status not null default 'scheduled',
  -- exactly one admin per game, enforced by the shape of the schema:
  -- admin is a single non-null column, not a role on a join table.
  admin_member_id uuid not null references group_members(id),
  created_at timestamptz not null default now(),
  created_by_member_id uuid not null references group_members(id),
  started_at timestamptz,
  settled_at timestamptz
);
create index on games (group_id, scheduled_at desc);

-- Admin handoff audit trail. Only the current admin (or, as an escape hatch,
-- the group owner) can move the role, and every move is logged.
create table game_admin_transfers (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references games(id) on delete cascade,
  from_member_id uuid not null references group_members(id),
  to_member_id uuid not null references group_members(id),
  transferred_by_member_id uuid not null references group_members(id),
  was_forced boolean not null default false,   -- true = group owner override
  reason text,
  created_at timestamptz not null default now()
);
create index on game_admin_transfers (game_id);

-- ============ SIGNUPS / WAITLIST ============
create type signup_status as enum ('confirmed','waitlist','withdrawn');

create table game_signups (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references games(id) on delete cascade,
  member_id uuid not null references group_members(id) on delete cascade,
  status signup_status not null,
  signup_order integer not null,   -- monotonic per game, drives waitlist promotion
  created_at timestamptz not null default now(),
  withdrawn_at timestamptz,
  unique (game_id, member_id)
);

-- ============ BUY-INS (append only) ============
create table buyins (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references games(id) on delete cascade,
  member_id uuid not null references group_members(id),
  amount_cents integer not null check (amount_cents > 0),
  chips integer not null check (chips > 0),
  note text,
  created_at timestamptz not null default now(),
  created_by_member_id uuid not null references group_members(id),
  voided_at timestamptz,
  voided_by_member_id uuid references group_members(id),
  void_reason text
);
create index on buyins (game_id) where voided_at is null;

-- ============ CASHOUTS ============
create table cashouts (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references games(id) on delete cascade,
  member_id uuid not null references group_members(id),
  chips integer not null check (chips >= 0),
  amount_cents integer not null,          -- computed on write from game ratio
  recorded_at timestamptz not null default now(),
  recorded_by_member_id uuid not null references group_members(id),
  unique (game_id, member_id)
);

-- ============ DISCREPANCY ADJUSTMENTS ============
create table game_adjustments (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references games(id) on delete cascade,
  member_id uuid references group_members(id),   -- null = spread across all
  amount_cents integer not null,
  reason text not null,
  created_at timestamptz not null default now(),
  created_by_member_id uuid not null references group_members(id)
);

-- ============ SETTLEMENTS ============
create type settlement_status as enum ('pending','paid','confirmed','deferred');

create table settlements (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references games(id) on delete cascade,
  from_member_id uuid not null references group_members(id),
  to_member_id uuid not null references group_members(id),
  amount_cents integer not null check (amount_cents > 0),
  status settlement_status not null default 'pending',
  paid_at timestamptz,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  check (from_member_id <> to_member_id)
);
create index on settlements (game_id);
create index on settlements (from_member_id, status);
```

### Views

```sql
create view game_player_totals as
select
  g.id as game_id,
  gm.id as member_id,
  gm.display_name,
  coalesce(b.buyin_cents, 0)  as buyin_cents,
  coalesce(b.buyin_count, 0)  as buyin_count,
  c.amount_cents              as cashout_cents,
  coalesce(c.amount_cents,0) - coalesce(b.buyin_cents,0) as net_cents
from games g
join game_signups s on s.game_id = g.id and s.status = 'confirmed'
join group_members gm on gm.id = s.member_id
left join lateral (
  select sum(amount_cents) buyin_cents, count(*) buyin_count
  from buyins where game_id = g.id and member_id = gm.id and voided_at is null
) b on true
left join cashouts c on c.game_id = g.id and c.member_id = gm.id;

create view member_lifetime as
select member_id, display_name,
       count(*) filter (where cashout_cents is not null) as games_played,
       sum(net_cents) as lifetime_net_cents
from game_player_totals
group by member_id, display_name;
```

---

## 5. Row-level security

RLS is where your "only the admin updates balances" requirement gets enforced. Do it in the database, not the UI. A member who opens devtools should not be able to add themselves chips.

Helper functions first:

```sql
create or replace function my_member_id(gid uuid) returns uuid
language sql security definer stable as $$
  select id from group_members where group_id = gid and profile_id = auth.uid()
$$;

create or replace function is_group_member(gid uuid) returns boolean
language sql security definer stable as $$
  select exists (select 1 from group_members
                 where group_id = gid and profile_id = auth.uid() and is_active)
$$;

-- Strictly the one admin. Group owner/admin role does NOT grant game write
-- access. If the group owner needs control of a game they must first take the
-- admin role through the transfer flow, which is logged.
create or replace function can_admin_game(g uuid) returns boolean
language sql security definer stable as $$
  select exists (
    select 1 from games ga
    join group_members gm on gm.id = ga.admin_member_id
    where ga.id = g and gm.profile_id = auth.uid()
  )
$$;
```

Policy summary:

| Table | Read | Write |
|---|---|---|
| `groups` | members of that group | owner/admin only |
| `group_members` | members of that group | owner/admin; a user may claim an unclaimed row via claim code |
| `games` | group members | any group member may create; after creation, **the game admin only** |
| `game_signups` | group members | **a member may insert/withdraw their own row**; the game admin may write any |
| `buyins` | group members | **game admin only** |
| `cashouts` | group members | **game admin only** |
| `game_admin_transfers` | group members | game admin, or group owner with `was_forced = true` |
| `settlements` | group members | admin creates; `from_member` may set `paid`; `to_member` may set `confirmed` |

That last row is the good detail: the payer marks paid, the payee confirms received. Neither can do the other's half. It's a two-party handshake enforced at the DB level.

Example:

```sql
alter table buyins enable row level security;

create policy "read buyins in my groups" on buyins for select
using (exists (select 1 from games g where g.id = buyins.game_id and is_group_member(g.group_id)));

create policy "only game admins write buyins" on buyins for insert
with check (can_admin_game(game_id));

create policy "only game admins void buyins" on buyins for update
using (can_admin_game(game_id));
```

---

## 6. Settlement algorithm

This is the most interesting code in the project. Put it in `lib/settle.ts` as a pure function with no DB dependency, and test it hard.

### 6.1 Reconciliation gate (do not skip this)

In a real game the chip counts almost never balance. Chips end up in pockets, someone miscounts, a stack gets knocked over. **The sum of all nets must equal zero before you can settle.** If it doesn't, block the settle button and surface the discrepancy.

```
discrepancy = Σ cashout_cents − Σ buyin_cents
```

If `discrepancy ≠ 0`, show it prominently and offer four resolutions:

1. **Recount** — go back and fix a cashout entry (most common, and the default)
2. **Spread evenly** — divide the discrepancy across all players
3. **Assign to one player** — someone admits they miscounted
4. **Log as missing chips** — accept it and write it to `game_adjustments` with `member_id = null`, spread proportionally to buy-in

Each resolution writes to `game_adjustments` so the ledger stays auditable. This single feature is the biggest real-world improvement over the notes app, because today this problem gets resolved by arguing.

### 6.2 Minimum-transfer solver

```typescript
export type Net = { memberId: string; netCents: number };
export type Transfer = { fromMemberId: string; toMemberId: string; amountCents: number };

export function settle(nets: Net[]): Transfer[] {
  const total = nets.reduce((s, n) => s + n.netCents, 0);
  if (total !== 0) throw new Error(`Nets must sum to zero, got ${total}`);

  const debtors  = nets.filter(n => n.netCents < 0)
                       .map(n => ({ ...n, amt: -n.netCents }))
                       .sort((a, b) => b.amt - a.amt);
  const creditors = nets.filter(n => n.netCents > 0)
                        .map(n => ({ ...n, amt: n.netCents }))
                        .sort((a, b) => b.amt - a.amt);

  const transfers: Transfer[] = [];
  let i = 0, j = 0;

  while (i < debtors.length && j < creditors.length) {
    const amount = Math.min(debtors[i].amt, creditors[j].amt);
    if (amount > 0) {
      transfers.push({
        fromMemberId: debtors[i].memberId,
        toMemberId: creditors[j].memberId,
        amountCents: amount,
      });
    }
    debtors[i].amt -= amount;
    creditors[j].amt -= amount;
    if (debtors[i].amt === 0) i++;
    if (creditors[j].amt === 0) j++;
  }
  return transfers;
}
```

**Why greedy and not optimal:** finding the true minimum number of transfers requires partitioning players into zero-sum subsets, which reduces to subset-sum and is NP-hard. Greedy largest-debtor-to-largest-creditor guarantees at most `n − 1` transfers, which is the same bound Splitwise uses. At n = 9 the difference between greedy and optimal is at most a transfer or two, and nobody cares. Know this answer cold, because it is exactly the kind of thing an interviewer will poke at.

**Optional refinement worth adding (Phase 6):** suppress transfers under $2 by folding them into a larger one, and prefer pairings between people who already owe each other from a prior unsettled game.

### 6.3 Tests

Write property-based tests in `settle.test.ts`. For 1000 random valid net arrays:

- Output transfers sum to zero
- After applying all transfers, every player's balance is exactly zero
- `transfers.length <= nets.filter(n => n.netCents !== 0).length - 1`
- No self-transfers, no zero or negative amounts
- Non-zero sum input throws

Also hand-write these cases: everyone breaks even, one big winner and eight losers, one big loser and eight winners, two players, exact offsetting pairs.

---

## 7. Money movement

No money passes through the app. You compute who owes whom, deep-link into Venmo with the amount prefilled, and track confirmation state. This keeps you entirely out of money transmitter territory, which is where a Stripe Connect integration would drag you.

```typescript
export function venmoLink(handle: string, cents: number, note: string) {
  const amount = (cents / 100).toFixed(2);
  const n = encodeURIComponent(note);
  const h = encodeURIComponent(handle.replace(/^@/, ''));
  return {
    app: `venmo://paycharge?txn=pay&recipients=${h}&amount=${amount}&note=${n}`,
    web: `https://venmo.com/${h}?txn=pay&amount=${amount}&note=${n}`,
  };
}
```

Caveats to build around: these URL schemes are undocumented and Venmo has changed them before. Always render a copy-to-clipboard fallback showing handle and amount as plain text, and always allow "mark as paid" independent of whether the link worked. Treat the deep link as a convenience, not a dependency.

Settlement status flow: `pending` → payer taps Mark as Paid → `paid` → payee taps Confirm Received → `confirmed`. Add a `deferred` status for "I'll get you next week," which rolls the balance into the next game's settlement inputs (Phase 6).

---

## 8. Screens

### Auth / join
Supabase magic link plus Google OAuth. Skip phone OTP, it needs Twilio and costs money. Invite links look like `/join/[inviteCode]`, and a claim flow at `/claim/[claimCode]` lets an existing unclaimed member attach their account.

### App home (multi-group)
List of every group you belong to, each showing your net for that group and its next scheduled game. A persistent "New Game" button. Groups are separate cards and their numbers never combine.

### New game flow
One screen. Date and time, optional location, group selector that doubles as a create-new-group field, seat limit defaulting to 9, buy-in defaulting to $50, chips ratio defaulting to 2:1. Creator becomes admin automatically with no prompt. A checkbox for "I'm playing too," checked by default, which creates your signup row.

### Group home
- Next game card at top: date, location, seats filled, your status (In / Waitlist #2 / Not signed up), one-tap RSVP
- Your lifetime net, big number, green or red
- Outstanding settlements you owe or are owed
- Scrolling list of past games with date, player count, your net for that game

### Game detail — member view
Roster with confirmed players and waitlist in order. Live buy-in count per player. Your own total staked. Read-only.

### Game detail — admin view (the critical screen)

This is the screen that has to be good, because Gilad is using it one-handed while holding cards. Design rules:

- Grid of player cards, one tap adds a buy-in at the default amount. That's it. One tap.
- Each card shows name, buy-in count as dots or a number, dollar total
- Long-press opens a sheet for a custom amount, a void, or a note
- Undo toast for 5 seconds after every tap
- Running pot total pinned to the top
- No confirmation dialogs. Speed matters more than accuracy here because void exists.

Everything writes through Supabase Realtime so all nine phones update instantly. This kills the "did you write mine down?" problem, which is really the core value of the app.

Two more things on this screen:

**Remove a player.** Behind a two-tap confirm — before the game starts from
the signed-up list, after it starts from the long-press sheet. It frees a
seat, so it is not in the same class as a mistap on a buy-in.

Removing someone means they are not playing, so **everything they bought in
for is voided and comes back out of the pot**, whether or not the game has
started. This is deliberately not the same event as cashing out early: a
player who played and left records a cashout and stays in the settlement math.
Removal is for the person who never sat down.

**Hand off admin.** Buried in a menu, not a primary button. Pick any active group member, confirm, done. The new admin gets the write access and the old one loses it immediately.

**The admin's own buy-ins render differently in the activity feed.** One person having sole write access to everyone's money is a trust concession, and the control on it is visibility, not permission. Every player sees a live feed of every buy-in with a timestamp and who logged it, and the admin logging their own gets a subtle marker. Nobody will ever cheat, but the reason nobody will is that the log makes it pointless.

### Cashout screen
Numeric chip entry per player. A discrepancy counter at the top updates live and stays red until it hits zero. Settle button disabled until reconciled or an adjustment is recorded.

### Settlement screen
The transfer list rendered as "Nadav pays Gilad $80" rows with a Venmo button on each. Status chips for pending/paid/confirmed. A "Copy summary for WhatsApp" button that generates plain text to paste into the group chat, since that's where the group actually lives.

### Profile
Display name, Venmo handle, game history, stats.

---

## 9. Edge cases to handle explicitly

These are the ones that will actually come up:

1. **Waitlist promotion.** Confirmed player withdraws, lowest-`signup_order` waitlister is auto-promoted. Do this in a Postgres trigger, not application code, so it can't race.
2. **Mid-game cash out.** Player leaves early, records a cashout while the game is still `active`, and a waitlister takes the seat. The seat is free but the departed player stays in the settlement math.
3. **Late arrival.** Admin adds someone not on the signup list directly into the active game.
4. **Non-standard buy-in.** Someone buys in for $100 or half a stack. Long-press → custom amount.
5. **Chip discrepancy.** Covered in 6.1. Assume it happens most games.
6. **Buy-in logged to the wrong player.** Void plus re-add. Never edit.
7. **Game cancelled after signups exist.** Status → `cancelled`, signups preserved, no settlement.
8. **Unclaimed member never signs up.** Works forever, admin manages them by hand.
9. **Player in multiple groups.** One profile, many `group_members`. Balances are per-group and never merge.
10. **Someone deletes their account.** `profile_id` goes null on the member row, history is preserved.
11. **Two admins tap the same buy-in simultaneously.** Append-only means you get two rows. Show recent buy-ins with timestamps so the duplicate is visible and voidable.
12. **Timezones.** Store `timestamptz`, render in the group's timezone, set on the group record.
13. **Admin goes dark mid-game.** Phone dies, leaves early, stops responding. Handled by transfer, with group-owner force-reassign as the fallback. Do not ship Phase 3 without at least the voluntary transfer path.
14. **Admin leaves the group.** Block removal of a member who admins any non-settled game until the role is transferred. Enforce with a trigger.
15. **Admin isn't playing.** Valid state. Their card doesn't appear in the buy-in grid and they're excluded from settlement math.
16. **Two games running in one group at once.** Rare, but allowed, and they can have different admins. Nothing in the model prevents it, so make sure the group home doesn't assume a single "next game."
17. **Non-admin tries to write.** RLS rejects it. Handle the error in the UI with a clear message rather than a silent failure, because the most likely cause is that admin was transferred away while their screen was stale.
18. **No-show removed by the admin.** Admin removes a confirmed player. The seat frees, the first waitlister is promoted, and every buy-in the removed player had is voided and leaves the pot total — removal means they are not playing. Distinct from edge case 2, where a player who actually played leaves early and stays in the settlement math.

---

## 10. Build phases

Each phase ends deployed and usable. Do not move on until the current one works.

**Phase 0 — Foundation (half day)**
Next.js + TypeScript + Tailwind + shadcn. Supabase project, `profiles` table, magic link and Google auth, protected route middleware. Deploy to Vercel. Done when: you can sign in and see your name.

**Phase 1 — Groups and members (1 day)**
`groups`, `group_members`, RLS, create group, invite code and join link, admin adds unclaimed members, claim flow. Done when: you can create a group, add eight fake players, and join from a second device.

**Phase 2 — Games and signup (1–1.5 days)**
`games`, `game_signups`, the one-screen new-game flow with inline group creation, creator-becomes-admin, RSVP, seat limit, waitlist ordering, auto-promotion trigger, past/upcoming split. Done when: any member can create a game in a brand new group, nine people claim seats, and the tenth lands on the waitlist.

**Phase 3 — Buy-in tracking (1–2 days)**
`buyins`, start-game checklist that stakes whoever showed up, admin tap grid, void with undo, remove a player, Realtime subscriptions, live pot total, voluntary admin transfer with audit log. Done when: you tap on one phone and it updates on another within a second, and you can hand admin to a second device mid-game. **Run one real game on this before building anything else.** You'll learn more from that than from another week of specs.

**Phase 4 — Reconciliation and settlement (1–2 days)**
`cashouts`, discrepancy detection and the four resolutions, `settle.ts` with full test coverage, `settlements` table, settlement screen. Done when: a game with a $7 chip discrepancy can be resolved and settled.

**Phase 5 — Payments and history (1 day)**
Venmo deep links, paid/confirmed handshake, WhatsApp summary text, per-member history and lifetime stats.

**Phase 6 — Polish**
PWA manifest and service worker, install prompt, web push, offline write queue, deferred settlements rolling into the next game, charts of running balance, biggest win/loss stats.

---

## 11. Repo structure

```
/app
  /(auth)/login, /join/[code], /claim/[code]
  /(app)/groups/[groupId]/page.tsx
  /(app)/groups/[groupId]/games/[gameId]/page.tsx
  /(app)/groups/[groupId]/games/[gameId]/admin/page.tsx
  /(app)/groups/[groupId]/games/[gameId]/settle/page.tsx
  /(app)/profile
  /api/games/[gameId]/settle/route.ts
/components
  /game    BuyInGrid, PlayerCard, PotTotal, CashoutEntry, DiscrepancyBanner
  /settle  TransferList, VenmoButton, SettlementStatus
  /ui      shadcn
/lib
  supabase/client.ts, server.ts, types.ts
  settle.ts, settle.test.ts
  money.ts          -- all cents/chips conversion, single source of truth
  venmo.ts
/supabase
  /migrations
```

Two rules that will save you pain: all currency conversion lives in `money.ts` and nowhere else, and `settle.ts` has zero imports from Supabase.

---

## 12. What to say about this in interviews

- **Platform choice.** Frame the PWA decision as distribution strategy, not technical preference. The users are already in a WhatsApp thread; a link fits that, an App Store listing doesn't.
- **The NP-hard tradeoff.** Optimal debt simplification is subset-sum. You chose greedy with an `n−1` bound because at nine players the gap is negligible and the code is testable. Knowing why you *didn't* do the harder thing is the signal.
- **Security as product requirement.** "Only the admin can change balances" was a product rule about trust between friends, and you enforced it in row-level security rather than by hiding a button. Different layer, different guarantee.
- **The reconciliation gate.** This is the domain insight. The naive version of this app assumes the numbers balance. Real poker games don't, and the argument about the missing $7 is the actual pain point. Finding that requires having played the game, which is a good story about talking to users.
- **Append-only ledger.** You picked immutability plus soft void over mutable rows specifically because the failure mode you were replacing was a notes app with no history.
- **Invariants belong in the schema.** "Exactly one admin per game" is a single non-null column, not a join table with a count check. The rule can't be violated because there's nowhere to put a second value. Contrast that with the version you'd have to defend against concurrent writes forever.
- **Where you broke your own rule, and why.** Group role deliberately doesn't grant game access, except that the group owner can force-reassign an unreachable admin. You can name the exception, name what it costs, and name the abandoned-game failure it prevents. Interviewers care more about that than about a clean rule with no edges.
- **Scope discipline.** Phase 3 ships and gets used in a real game before Phase 4 starts.
