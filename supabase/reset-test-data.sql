-- Wipe all game data, keeping the schema and everyone's account.
--
-- NOT a migration. Deliberately lives outside supabase/migrations/ so it is
-- never picked up and replayed against a real database. Paste it into the
-- SQL editor by hand when you actually mean it.
--
-- This is irreversible. There is no undo and no backup unless you took one.
--
-- What survives:
--   profiles   — display names and Venmo handles, so you can sign back in
--   auth.users — delete throwaway accounts in Authentication → Users, which
--                cascades their profile row
--   schema, RLS policies, triggers, functions — all untouched

-- Run this first and read the numbers before you commit to anything.
select
  (select count(*) from public.groups)                as groups,
  (select count(*) from public.group_members)         as members,
  (select count(*) from public.games)                 as games,
  (select count(*) from public.game_signups)          as signups,
  (select count(*) from public.buyins)                as buyins,
  (select count(*) from public.cashouts)              as cashouts,
  (select count(*) from public.game_adjustments)      as adjustments,
  (select count(*) from public.settlements)           as settlements,
  (select count(*) from public.game_admin_transfers)  as admin_transfers;

-- Then this.
--
-- Children first. `delete from groups` alone would very likely work, since
-- the cascades reach everything — but buyins.member_id and its siblings
-- reference group_members with no cascade, so it relies on Postgres deferring
-- those checks to end of statement. Being explicit removes the question.
begin;

delete from public.settlements;
delete from public.game_adjustments;
delete from public.cashouts;
delete from public.buyins;
delete from public.game_admin_transfers;
delete from public.game_signups;
delete from public.games;
delete from public.group_members;
delete from public.groups;

commit;
