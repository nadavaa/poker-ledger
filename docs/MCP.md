# Poker Ledger as an AI connector (MCP)

Players can ask their own AI app about their poker: *"what do I owe
Gilad?"*, *"am I up this year?"*, *"am I on the waitlist for Saturday?"*
This is a **read-only** remote MCP server at

```
https://kevespoker.com/api/mcp
```

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
   (`https://kevespoker.com`) this is the page Supabase sends people to.
4. Check it is live — this should return JSON, not `OAuth server is disabled`:

   ```bash
   curl https://<project-ref>.supabase.co/.well-known/oauth-authorization-server/auth/v1
   ```

5. Apply `supabase/migrations/20261005000000_mcp_tool_calls.sql` in the SQL
   editor, then run `supabase/tests/mcp_tool_calls_20261005.sql` (with "Run
   without RLS") and check it ends `ALL PASS`. Until the migration is applied
   the connector works but nothing is logged.

No new environment variables are needed. The service-role key is never used
by this code path.

## Add it to Claude

1. Claude → **Settings → Connectors → Add custom connector**.
2. Name: *Poker Ledger*. URL: `https://kevespoker.com/api/mcp`. Add.
3. Click **Connect**. You land on Poker Ledger: sign in the way you always
   do (Google or a magic link), then read the screen and press **Allow**.
4. Ask: *"What poker groups am I in?"*

To remove access, disconnect the connector in Claude.

**ChatGPT** takes the same URL under Settings → Connectors (developer mode,
add a custom MCP connector). **Meta Muse:** not verified. It needs to support
remote MCP servers with OAuth; try the same URL.

## Tools

All read-only, all as you, all through the same row-level security as the
app.

| Tool | Use it for |
|---|---|
| `list_my_groups` | Your groups, your role, the group's timezone. Start here. |
| `list_games(group_id, status?, from?, to?)` | Games, with seats like `9/8 · 1 over` and whether you're seated or waitlisted. |
| `get_game(game_id)` | Roster, waitlist, and what you're allowed to see of the money. |
| `get_my_stats(group_id, from?, to?)` | Lifetime net, streaks, biggest win/loss, per-game nets. |
| `get_my_balances(group_id?)` | What you ended each settled game with. |
| `get_outstanding_debt(group_id?)` | Who you still owe and who owes you, with Venmo links. |

Money comes back as integer cents and a display string; times as ISO 8601 and
text in the group's own timezone.

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

Every tool call writes one row to `mcp_tool_calls`: user, tool, ok, latency,
time. No arguments, no amounts, no error text. No client can read it; use the
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
| Claude says it can't connect, no sign-in page | OAuth server disabled, or dynamic registration off, in Supabase |
| Sign-in works, then the consent page says the request expired | Took longer than the request lives; start again from Claude |
| Signs in, lands on the home page instead of consent | `next` lost in the login round trip — check `lib/supabase/middleware.ts` keeps the query for `/oauth/*` |
| `401` on every call after connecting | Token isn't role `authenticated` or the project's signing keys changed; disconnect and reconnect |
| A tool says *not found, or you are not a member* | RLS: that id isn't in one of your groups |
| Venmo link missing | The payee hasn't saved a Venmo handle |
