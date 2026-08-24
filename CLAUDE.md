# Poker Ledger

Mobile-first PWA for tracking home poker cash games: signup with waitlist, live buy-in tracking, end-of-game reconciliation, minimum-transfer settlement.

Full spec: `docs/SPEC.md`. Read the relevant section before starting a phase. Don't build ahead of the current phase.

## Stack

Next.js 15 (App Router) · TypeScript · Supabase (Postgres, Auth, RLS, Realtime) · Tailwind · shadcn/ui · Vitest · Vercel

No ORM. Use the Supabase client directly with generated types (`supabase gen types typescript`). No Redux/Zustand — server components plus Realtime subscriptions.

## Non-negotiables

**Money is integer cents. Always.** No floats anywhere in the money path. All conversion between cents, dollars, and chips lives in `lib/money.ts` and nowhere else. If you find yourself writing `* 100` or `/ 2` outside that file, stop.

**Buy-ins are append-only.** Never UPDATE or DELETE a buyin row. Corrections happen by setting `voided_at`, `voided_by_member_id`, `void_reason`. The audit trail is the product.

**Authorization lives in RLS, not the app layer.** Every permission rule is a Postgres row-level security policy. Do not implement a permission check by hiding a button or adding an `if` in a server action. If you need a new permission, write a policy. Assume a user will open devtools.

**Exactly one admin per game.** It's the single non-null `admin_member_id` column on `games`. Never introduce a `game_admins` table, an admin array, or a role flag that could hold two values. Group role does not grant game write access.

**`lib/settle.ts` is pure.** Zero imports from Supabase, Next, or React. Input: array of nets. Output: array of transfers. It must be testable with no I/O.

**Everything references `group_member_id`, never `auth.users.id`.** A player is a group_members row that may or may not be linked to a profile. Unclaimed members are first-class and must work everywhere.

## Conventions

- Migrations in `supabase/migrations/`, timestamped, never edited after being applied. New change = new migration.
- Server components by default. `'use client'` only where there's actual interactivity.
- Realtime subscriptions on `buyins` and `game_signups` only.
- Chip ratio and buy-in amount are snapshotted onto each `games` row at creation. Never read them from `groups` when computing a past game.

## Workflow

- One phase at a time. Stop at the end of each phase and tell me what to verify manually before continuing.
- Prefer working and ugly over polished and half-wired. Phase 6 is where things get pretty.
- When a decision isn't covered by the spec, ask instead of guessing.
- Don't add features that aren't in the current phase, including "while I was in there" improvements.

## Testing

`lib/settle.ts` gets real tests, including property tests over randomly generated valid net arrays. For any input summing to zero, the output must: sum to zero, leave every player at net zero after application, contain at most n−1 transfers, and include no self-transfers or non-positive amounts. Non-zero-sum input must throw.

Everything else can go untested for now.

## Do not

- Do not add Prisma, Drizzle, or any ORM on top of Supabase.
- Do not build a payments integration. Venmo deep links plus manual confirmation only. No money moves through this app.
- Do not create games with a null `group_id`.
- Do not let a settle action run while the reconciliation discrepancy is non-zero.
- Do not write seed data into production tables. Use a separate seed script.
