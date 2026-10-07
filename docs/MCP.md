# Poker Ledger as an AI connector (MCP)

Players can ask their own AI app about their poker — *"what do I owe
Gilad?"*, *"am I up this year?"*, *"am I on the waitlist for Saturday?"* — and
do a few things a player can do themselves: join or leave a game, mark a
payment paid, confirm one received, update a Venmo or Zelle handle. This is a
remote MCP server at

```
https://www.kevespoker.com/api/mcp
```

Use the **`www`** address exactly. `kevespoker.com` redirects to `www`, and an
MCP client checks that the server's metadata names the same URL it was given:
entered without `www`, Claude fails with *"Couldn't register with Poker App's
sign-in service."*

What it can and can't do, and why, is in the *Agents* section of
[FUNCTIONALITY.md](FUNCTIONALITY.md). This page is how to set it up.

## One-time project setup (owner)

Supabase Auth is the OAuth 2.1 authorization server; there is no auth
server of ours. In the Supabase dashboard:

1. **Authentication → OAuth Server → Enable.**
2. Turn on **Allow dynamic OAuth apps** (dynamic client registration). Claude
   registers itself through it. The consent screen is the control: nothing is
   readable until a signed-in user approves a named client.
3. **Authorization path:** `/oauth/consent`. With the Site URL
   (the `www` address) this is the page Supabase sends people to.
4. Check it is live — this should return JSON, not `OAuth server is disabled`:

   ```bash
   curl https://<project-ref>.supabase.co/.well-known/oauth-authorization-server/auth/v1
   ```

5. Apply `supabase/migrations/20261005000000_mcp_tool_calls.sql` in the SQL
   editor, then run `supabase/tests/mcp_tool_calls_20261005.sql` (with "Run
   without RLS") and check it ends `ALL PASS`. Until the migration is applied
   the connector works but nothing is logged.

6. Apply the phase 2 migrations, in order, each followed by its proof script
   (ending `ALL PASS`):

   | Migration | Proof |
   |---|---|
   | `20261006000000_mcp_write_support.sql` | `supabase/tests/mcp_write_support_20261006.sql` |
   | `20261006010000_agent_actions.sql` | `supabase/tests/agent_actions_20261006.sql` |
   | `20261007000000_agent_actions_admin.sql` (phase 3) | `supabase/tests/agent_actions_admin_20261007.sql` |

   Then run the anon check from phase 1 (list public functions `anon` can
   execute); it should return no rows.
7. Set **`MCP_CONFIRM_SECRET`** on Vercel (Production and Preview) and in
   `.env.local`: any long random string, for example
   `openssl rand -base64 48`. It signs confirmation tokens. **Without it every
   change refuses to run** — reading still works. Rotating it only invalidates
   previews that are in flight.

The service-role key is never used by this code path.

## Add it to Claude

1. Claude → **Settings → Connectors → Add custom connector**.
2. Name: *Poker Ledger*. URL: `https://www.kevespoker.com/api/mcp` (with `www`). Add.
3. Click **Connect**. You land on Poker Ledger: sign in the way you always
   do (Google or a magic link), then read the screen and press **Allow**.
4. Ask: *"What poker groups am I in?"*

To remove access, disconnect the connector in Claude.

**ChatGPT** takes the same URL under Settings → Connectors (developer mode,
add a custom MCP connector). **Meta Muse:** not verified. It needs to support
remote MCP servers with OAuth; try the same URL.

## Tools

All as you, all through the same row-level security as the app.

| Tool | Use it for |
|---|---|
| `list_my_groups` | Your groups, your role, the group's timezone. Start here. |
| `list_games(group_id, status?, from?, to?)` | Games, with seats like `9/8 · 1 over` and whether you're seated or waitlisted. |
| `get_game(game_id)` | Roster, waitlist, and what you're allowed to see of the money. |
| `get_my_stats(group_id, from?, to?)` | Lifetime net, streaks, biggest win/loss, per-game nets. |
| `get_my_balances(group_id?)` | What you ended each settled game with. |
| `get_outstanding_debt(group_id?)` | Who you still owe and who owes you, with Venmo links and a `transfer_id` for each. |
| `join_game(game_id)` | Sign up, or join the waitlist. Two-step. |
| `withdraw_from_game(game_id)` | Give up your seat. Two-step. |
| `mark_transfer_paid(transfer_id)` | You are the payer and you sent it. Two-step. |
| `confirm_transfer_received(transfer_id)` | You are the payee and it arrived. Two-step, can't be undone. |
| `update_payment_handle(venmo?, zelle_phone?)` | Venmo and/or Zelle. Saves at once; shows the last four digits of a phone only. |
| `list_group_members(group_id)` | Member ids and names, to turn "add Dean" into a `member_id`. |
| `get_whatsapp_summary(game_id)` | The text of the app's *Copy summary for WhatsApp* button. Game admin, settled game. |
| `create_game(group_id, date, time, …)` | Schedule a game. Date and time are the group's local clock. Two-step. |
| `edit_game(game_id, date?, time?, location?, name?, seat_limit?)` | Game admin. Two-step. |
| `add_player(game_id, member_id? \| guest_name?)` | Game admin. A seat, or the waitlist if full. Two-step. |
| `seat_from_waitlist(game_id, member_id)` | Game admin. Over the limit only after the app's own question. Two-step. |
| `cancel_game(game_id)` | Game admin or group owner. Keeps the roster and buy-ins. Two-step. |
| `close_out_transfer(transfer_id)` | Game admin, a transfer they are not part of. Two-step, can't be undone. |

**Admin tools** work only for the game admin (cancelling also for the group
owner): being a group owner grants nothing over a game, and the database
refuses anyone else. A confirmation is bound to the outcome it was shown for,
so if the table fills or the group's defaults change between preview and yes,
the token stops working and the agent must preview again.

**Two-step:** the first call returns a preview and a `confirmation_token` and
changes nothing; the agent shows the preview, waits for a yes, and calls again
with the token. Tokens last five minutes, work once, and are bound to you, the
tool and the exact arguments. Every change an agent makes is labelled *via AI
agent* on the game screen. The full rules are in the Agents section of
[FUNCTIONALITY.md](FUNCTIONALITY.md).
Money comes back as integer cents and a display string; times as ISO 8601 and
text in the group's own timezone.

## The interactive view

Six read tools (`list_my_groups`, `list_games`, `get_game`, `get_my_stats`,
`get_my_balances`, `get_outstanding_debt`) link to one page,
`ui://poker-ledger/app.html`, which apps with MCP Apps support draw in the chat
as a small version of the app. What it shows and can do is in
[FUNCTIONALITY.md](FUNCTIONALITY.md#interactive-view-mcp-apps).

The source is in `widgets/app`. It builds to one self-contained HTML file that
the server returns as the resource, so **after changing anything in
`widgets/`, run `npm run build:widgets` and commit the result in
`lib/mcp/ui/generated/`**. A test checks that the file is one document, under
the size budget, and names no web address of its own. The page needs no
configuration beyond the connector. "Open in Poker Ledger" goes to
`www.kevespoker.com` on production and to the deployment's own address on a
preview (`lib/mcp/ui/origin.ts`).

## Try it locally in MCP Inspector

The full connector flow needs a public URL (Claude can't reach localhost), so
locally you test with a token you already have.

```bash
npm run dev
npx @modelcontextprotocol/inspector
```

In Inspector: transport **Streamable HTTP**, URL `http://localhost:3000/api/mcp`.
Under *Authentication* paste a bearer token.

A token is a credential for about an hour. To get yours, sign in at
`http://localhost:3000` and run this in the browser console:

```js
const c = document.cookie.split('; ').filter((x) => /^sb-.*auth-token/.test(x))
const raw = c.map((x) => x.split('=').slice(1).join('=')).join('')
JSON.parse(atob(raw.replace('base64-', ''))).access_token
```

(If it throws, the cookie was split into `.0`/`.1` chunks in a different
order; sort `c` by name first.) With no token, every request is a `401` with a
`WWW-Authenticate` header pointing at the metadata — that's correct.

Useful checks:

```bash
# 401 with a resource_metadata pointer
curl -si -X POST localhost:3000/api/mcp -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'

# the protected-resource metadata
curl -s localhost:3000/.well-known/oauth-protected-resource/api/mcp
```

## Measuring adoption

Every tool call writes one row to `mcp_tool_calls`: user, tool, ok, whether it
was a read, a preview or a commit, latency, time. No arguments, no amounts, no error text. No client can read it; use the
service role from the SQL editor:

```sql
select tool, count(*) calls, count(distinct profile_id) users,
       count(*) filter (where not ok) errors,
       round(avg(latency_ms)) avg_ms
from mcp_tool_calls
where created_at > now() - interval '30 days'
group by tool order by calls desc;
```

## When something is wrong

| Symptom | Likely cause |
|---|---|
| *"Couldn't register with Poker App's sign-in service"* | The URL was entered without `www`; use `https://www.kevespoker.com/api/mcp` |
| Claude says it can't connect, no sign-in page | OAuth server disabled, or dynamic registration off, in Supabase |
| Sign-in works, then the consent page says the request expired | Took longer than the request lives; start again from Claude |
| Signs in, lands on the home page instead of consent | `next` lost in the login round trip — check `lib/supabase/middleware.ts` keeps the query for `/oauth/*` |
| `401` on every call after connecting | Token isn't role `authenticated` or the project's signing keys changed; disconnect and reconnect |
| A tool says *not found, or you are not a member* | RLS: that id isn't in one of your groups |
| Venmo link missing | The payee hasn't saved a Venmo handle |
| *"Changes through an AI app are not switched on for this server yet"* | `MCP_CONFIRM_SECRET` is not set on this deployment |
| *"That confirmation expired"* / *"already used"* | Ask for a fresh preview; each token lasts five minutes and works once |
| *"Too many changes in a short time"* | The per-user limit (10 changes or 30 previews in ten minutes); wait |
| *"Only the game admin can …"* | The user is not the one admin of that game. Group role does not change that |
| *"… does not exist in America/New_York"* | The local time falls in the hour clocks skip, or the date is not real |
| *"The arguments changed since the preview"* right after a yes | The table, the group's numbers or the transfer changed in between; preview again |
| Changes work but no *via AI agent* label appears | `20261006010000_agent_actions.sql` is not applied, or `record_agent_action` failed; the tool reports a warning when it can't label |
