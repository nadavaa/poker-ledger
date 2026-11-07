# Growth plan

_Updated 2026-11-06. Docs only: product changes below are requests for the app
session, not builds._

## Goal

Get KevesPoker in front of more home-game hosts through **public posting** and
**search/AI-engine visibility (SEO and GEO)**, and **see clearly on `/admin` who
our users are and what changed**. The hub target (20 users outside the friend
group by Jan 31, 2027) is a check on whether this works, not something to chase
host by host.

Baseline, 2026-11-06: one real group (Poker @ NYC, 21 members, 9 settled games
since Sep 2), 0 outside users.

## 1. Admin tracking (approved by Nadav 2026-11-06; top priority)

**Status: A-D built on branch `claude/admin-tracking` (2026-11-06).** Not yet
deployed: needs Nadav's approval for the production migration
(`20261106000000_admin_tracking.sql`), then the PR. Behaviour is documented
in `docs/FUNCTIONALITY.md` (Admin analytics).

### What `/admin` already shows
Total users, groups, DAU/WAU/MAU, sign-up method, weekly sign-ups and games
(12 weeks), monthly sign-ups (6 months), retention cohorts, onboarding funnel,
engagement, product health, invite funnel, and a groups table (name, members,
games, last game). Source: `admin_*` functions in
`supabase/migrations/20260905000000_admin_analytics.sql`, page in
`app/admin/page.tsx`.

### What it is missing
It counts users but can't answer **who they are, where they came from, or what
changed since last time.**

### Request: build these, in this order

**A. "What changed" strip at the top of the page.**
For the last 7 days and the last 30 days, each against the period before it:
- New sign-ups
- New groups created
- **Outside users**: claimed accounts that are an active member of at least
  one group the owner (the `/admin` user id) is not a member of. No game
  required (decided by Nadav 2026-11-06). This is the hub goal metric.
- Active groups (a game started in the period)
- Groups gone quiet (had a game in the previous 30 days, none in the last 30)

Each one is a number with a +/- change, e.g. "Outside users 4 (+3)".

**B. Groups table, extended.**
Add to each row: created date, owner's group or outside, claimed members,
settled games, games in the last 30 days, and status (new / active / quiet).
Sort newest group first so new outside groups are easy to spot.

**C. Users table (approved by Nadav 2026-11-06).**
One row per account: display name, sign-up date, sign-up source (from D),
groups, outside or not, games played, last game date. **No emails, phone
numbers or payment handles.** This changes the "aggregates only" rule in
`docs/FUNCTIONALITY.md` (Admin analytics) to "display names allowed, no contact
or payment details"; update that doc in the same change.

**D. Sign-up source.**
Record where each account came from, so posting and SEO can be measured:
- A `?ref=` value on any link to the site (e.g. `ref=reddit-homegames`,
  `ref=linkedin`), carried through login (including the Google round trip)
  and saved on the profile on first sign-in.
- If there is no `ref`, save the external referrer's domain (google.com,
  chatgpt.com, reddit.com), or "direct", or "invite" for `/join` and game links.
- Show it on `/admin` as a "Sign-ups by source, last 30 days" table, plus the
  source column in C.
- Built after the sign-up page merged (PR #15), so no conflict.

**Build notes for the app session:** new migration (never edit the existing
one); new functions follow the existing pattern (`security definer`, `revoke
execute ... from anon, authenticated`, called by the service role only); owner
gate unchanged; a production migration needs Nadav's approval.

## 2. Exposure plan

### Site side: SEO and GEO
Owned by the GEO engagement: `../kevespoker.com GEO/03-recommendations.md`.
The ones that matter most for exposure are R8 (helpful content for the
questions people actually ask), R11 (Search Console and Bing Webmaster Tools),
R13 (traffic measurement) and R14 (being mentioned elsewhere). Public posting
below is how R14 gets done. Nothing from that file is built here without
Nadav's approval.

### Off-site: public posting (ON HOLD, per Nadav 2026-11-06; to be discussed)
Nothing below is scheduled. Every post links with a `ref=` tag (request D) so `/admin` shows what worked.
Each one also earns a backlink and a mention that search and AI engines can
pick up.

| Where | Angle | When |
|---|---|---|
| Home-game and poker subreddits (r/poker and smaller home-game ones; check each one's self-promotion rules first) | "I host a weekly game and built this to replace the Venmo-hub mess. Feedback welcome." Screenshots of settlement | Week of Nov 9 |
| LinkedIn | Build story: problem, how it works, an AI connector that lets players ask Claude/ChatGPT about their balance. Also shows deployment work in action | Week of Nov 16 |
| Show HN / Indie Hackers | The settlement algorithm (fewest transfers) plus integer-cents and append-only ledger design. Technical audiences link to that kind of write-up | Late Nov, after the user-facing posts |
| MCP / AI-connector directories | List the connector (`/ai-connector`). Direct GEO value: AI tools and their users discover it there | Late Nov |
| Product Hunt | Single launch day, once A-D are live so the spike is measurable | Jan, after the holidays |

Cadence: about one post a week, each answered for 48 hours (reply to every
comment; that is where hosts ask "can it do X?").

Each post's draft goes in `docs/posts/` (to be created) and needs Nadav's
approval of the exact text before it goes out.

## 3. How we know it's working

Weekly, from `/admin` once A-D exist:
- New sign-ups by source (which posts and engines bring people)
- New outside groups and outside users (does exposure turn into real tables)
- Groups gone quiet (do new groups stick)

Search-side numbers (impressions, clicks, AI-engine mentions) come from the
GEO engagement's R11 and R13.

## Decisions

Made 2026-11-06:
- Users table with display names on `/admin`: **yes** (no emails or handles).
- Outside user: **any claimed account in a group Nadav is not in.**
- Public posting: **on hold**, to be discussed.

Open:
- Public posting plan (venues, order, timing).

## Rules

- Nothing is posted or sent without Nadav approving the exact text.
- No money is spent (ads, promoted posts) without approval.
- No app code is changed from this plan. Requests go to the app session.
