-- Proof for 20260922000000_member_removal_privilege.sql.
--
-- Run in the SQL editor with "Run without RLS" (as postgres): the script
-- impersonates each user itself via request.jwt.claims, which is how
-- PostgREST does it, and that needs the ability to SET ROLE.
--
-- Everything happens in one transaction that ends in ROLLBACK. The fixtures
-- it builds — a throwaway group, four members, a game, a settlement — are
-- created and destroyed inside it. Nothing here touches an existing group,
-- game or settlement, and nothing survives the script.
--
-- Read the final table: every row must show pass = true.

begin;

create temp table removal_results (n serial, test text, expect text, got text, pass boolean) on commit drop;

-- Runs one statement as one user and records what the database said. The
-- inner savepoint undoes an allowed write so the tests stay independent.
create function pg_temp.run(test text, expect text, sql text, as_uid uuid, as_role text default 'authenticated')
returns void language plpgsql as $f$
declare got text; ok boolean;
begin
  begin
    execute format('set local role %I', as_role);
    perform set_config('request.jwt.claims',
      json_build_object('sub', as_uid, 'role', as_role)::text, true);
    execute sql;
    raise exception using errcode = 'P0999', message = 'allowed';
  exception
    when sqlstate 'P0999' then got := 'allowed';
    when others then got := 'denied: ' || sqlstate || ' ' || left(sqlerrm, 80);
  end;
  reset role;
  ok := (expect = 'EXPECT-DENY' and got like 'denied%')
     or (expect = 'EXPECT-ALLOW' and got = 'allowed');
  insert into removal_results (test, expect, got, pass) values (test, expect, got, ok);
end $f$;

do $$
declare
  owner_p   uuid;   -- real profile ids, borrowed as fixture identities
  member_p  uuid;
  gid       uuid;
  m_owner   uuid;   -- the group owner
  m_plain   uuid;   -- an ordinary member, does the unauthorised attempt
  m_fresh   uuid;   -- no history at all -> DELETE path
  m_played  uuid;   -- has history -> UPDATE is_active path
  m_owes    uuid;   -- has history AND an open settlement -> blocked
  game_id   uuid;
  got       text;
begin
  select id into owner_p from public.profiles order by created_at limit 1;
  select id into member_p from public.profiles where id <> owner_p order by created_at limit 1;
  if member_p is null then
    raise exception 'need at least two profiles to run this';
  end if;

  insert into public.groups (name, created_by) values ('ZZ removal fixture', owner_p)
  returning id into gid;

  insert into public.group_members (group_id, profile_id, display_name, role)
  values (gid, owner_p, 'Fixture Owner', 'owner') returning id into m_owner;
  insert into public.group_members (group_id, profile_id, display_name, role)
  values (gid, member_p, 'Fixture Member', 'member') returning id into m_plain;
  insert into public.group_members (group_id, display_name)
  values (gid, 'Fixture Fresh') returning id into m_fresh;
  insert into public.group_members (group_id, display_name)
  values (gid, 'Fixture Played') returning id into m_played;
  insert into public.group_members (group_id, display_name)
  values (gid, 'Fixture Owes') returning id into m_owes;

  -- Created scheduled, because game_signups_before_insert refuses a signup
  -- into a closed game. It is settled below, once the roster exists.
  insert into public.games (
    group_id, scheduled_at, seat_limit, default_buyin_cents, chips_per_dollar,
    status, admin_member_id, created_by_member_id
  ) values (
    gid, now() - interval '1 day', 8, 5000, 2,
    'scheduled', m_owner, m_owner
  ) returning id into game_id;

  -- History for m_played: a signup is enough for member_has_history().
  insert into public.game_signups (game_id, member_id) values (game_id, m_played);

  -- m_owes has history AND money still moving, so the guard must fire.
  insert into public.game_signups (game_id, member_id) values (game_id, m_owes);

  -- Settled now: a finished game means member_removal_block() will not fire
  -- on the owner for "running an unsettled game", so test 4 proves the
  -- owner-role guard rather than accidentally passing on the game guard.
  update public.games
  set status = 'settled',
      started_at = now() - interval '1 day',
      settled_at = now() - interval '20 hours'
  where id = game_id;
  insert into public.settlements (game_id, from_member_id, to_member_id, amount_cents, status)
  values (game_id, m_owes, m_owner, 2500, 'pending');

  -- Sanity: the fixtures are the shape the tests assume.
  insert into removal_results (test, expect, got, pass) values (
    'fixture: fresh member has no history', 'EXPECT-ALLOW',
    case when public.member_has_history(m_fresh) then 'has history' else 'allowed' end,
    not public.member_has_history(m_fresh));
  insert into removal_results (test, expect, got, pass) values (
    'fixture: played member has history', 'EXPECT-ALLOW',
    case when public.member_has_history(m_played) then 'allowed' else 'no history' end,
    public.member_has_history(m_played));

  -- ---- The five cases ----

  perform pg_temp.run(
    '1. owner removes a zero-game member (DELETE path)', 'EXPECT-ALLOW',
    format('do $x$ declare r text; begin r := public.remove_group_member(%L);
            if r <> ''deleted'' then raise exception ''took the %% path'', r; end if; end $x$', m_fresh),
    owner_p);

  perform pg_temp.run(
    '2. owner deactivates a member with history (UPDATE path)', 'EXPECT-ALLOW',
    format('do $x$ declare r text; begin r := public.remove_group_member(%L);
            if r <> ''deactivated'' then raise exception ''took the %% path'', r; end if; end $x$', m_played),
    owner_p);

  perform pg_temp.run(
    '3. ordinary member removes someone else', 'EXPECT-DENY',
    format('select public.remove_group_member(%L)', m_fresh),
    member_p);

  perform pg_temp.run(
    '4. owner removes themselves', 'EXPECT-DENY',
    format('select public.remove_group_member(%L)', m_owner),
    owner_p);

  perform pg_temp.run(
    '5. owner removes someone who still owes money', 'EXPECT-DENY',
    format('select public.remove_group_member(%L)', m_owes),
    owner_p);

  -- The reason in case 5 has to be the readable one, not a bare 42501.
  begin
    set local role authenticated;
    perform set_config('request.jwt.claims',
      json_build_object('sub', owner_p, 'role', 'authenticated')::text, true);
    perform public.remove_group_member(m_owes);
    got := 'allowed';
  exception when others then got := sqlerrm;
  end;
  reset role;
  insert into removal_results (test, expect, got, pass) values (
    '5a. ...and the reason says why', 'EXPECT-ALLOW', left(got, 80),
    got like '%money to pay or collect%');

  -- Reactivate uses the same column and broke the same way.
  perform pg_temp.run(
    '6. owner reactivates a deactivated member', 'EXPECT-ALLOW',
    format('do $x$ begin perform public.remove_group_member(%L);
            perform public.reactivate_group_member(%L); end $x$', m_played, m_played),
    owner_p);

  -- ---- The audit''s intent is still intact ----

  perform pg_temp.run(
    '7. owner still cannot write role', 'EXPECT-DENY',
    format('update public.group_members set role = ''owner'' where id = %L', m_plain),
    owner_p);

  perform pg_temp.run(
    '8. owner still cannot write venmo_handle', 'EXPECT-DENY',
    format('update public.group_members set venmo_handle = ''x'' where id = %L', m_plain),
    owner_p);

  perform pg_temp.run(
    '9. owner still cannot write profile_id', 'EXPECT-DENY',
    format('update public.group_members set profile_id = %L where id = %L', owner_p, m_fresh),
    owner_p);

  perform pg_temp.run(
    '10. ordinary member cannot deactivate anyone', 'EXPECT-DENY',
    format('update public.group_members set is_active = false where id = %L', m_played),
    member_p);
end $$;

select n, test, expect, got, pass from removal_results order by n;
select count(*) filter (where not pass) as failures, count(*) as total from removal_results;

rollback;
