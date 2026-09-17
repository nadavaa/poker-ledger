-- RLS / privilege proof for the 2026-09-17 hardening. Run in the SQL editor
-- AFTER 20260917000000_security_hardening.sql.
--
-- Everything happens inside one transaction that ends in ROLLBACK, so nothing
-- here can change production — the attempted writes are rolled back whether
-- they were refused or not. Each attempt runs as a real user (impersonated
-- via request.jwt.claims, exactly how PostgREST does it) and records whether
-- the database said no. Read the final table: every row marked EXPECT-DENY
-- must show pass = true, every EXPECT-ALLOW must show pass = true.

begin;

create temp table audit_results (n serial, test text, expect text, got text, pass boolean) on commit drop;

-- Runs one statement as one user and records what the database said. The
-- exception block is a savepoint, so a refused OR an allowed write is undone
-- before the next test — and the whole transaction rolls back at the end
-- regardless. A result of "denied: 42501 permission denied to set role" means
-- the impersonation itself was refused and that test could not run.
create function pg_temp.run(test text, expect text, sql text, as_uid uuid, as_role text default 'authenticated')
returns void language plpgsql as $f$
declare got text; ok boolean;
begin
  begin
    execute format('set local role %I', as_role);
    if as_uid is null then
      perform set_config('request.jwt.claims', json_build_object('role', as_role)::text, true);
    else
      perform set_config('request.jwt.claims', json_build_object('sub', as_uid, 'role', as_role)::text, true);
    end if;
    execute sql;
    -- Undo any write that was allowed, so tests stay independent.
    raise exception using errcode = 'P0999', message = 'allowed';
  exception
    when sqlstate 'P0999' then got := 'allowed';
    when others then got := 'denied: ' || sqlstate || ' ' || left(sqlerrm, 70);
  end;
  reset role;
  ok := (expect = 'EXPECT-DENY' and got like 'denied%') or (expect = 'EXPECT-ALLOW' and got = 'allowed');
  insert into audit_results (test, expect, got, pass) values (test, expect, got, ok);
end $f$;

do $$
declare
  victim   record;   -- a non-admin, non-owner member with a profile
  admin_m  record;   -- an 'admin'-role member (for the self-promotion test)
  gm       record;   -- a game where victim is NOT the game admin
  other    record;   -- a settlement victim is not party to
  own_sig  record;
begin
  -- Pick real subjects. Nothing is written to them.
  select m.id as member_id, m.profile_id, m.group_id
    into victim
  from public.group_members m
  where m.profile_id is not null and m.is_active and m.role = 'member'
  order by m.created_at limit 1;

  select m.id as member_id, m.profile_id, m.group_id
    into admin_m
  from public.group_members m
  where m.profile_id is not null and m.is_active and m.role = 'admin'
  order by m.created_at limit 1;

  select g.id as game_id, g.group_id
    into gm
  from public.games g
  where g.group_id = victim.group_id and g.admin_member_id <> victim.member_id
  order by g.created_at desc limit 1;

  select s.id into other
  from public.settlements s
  join public.games g on g.id = s.game_id
  where g.group_id = victim.group_id
    and s.from_member_id <> victim.member_id and s.to_member_id <> victim.member_id
  limit 1;

  select s.id into own_sig
  from public.game_signups s where s.member_id = victim.member_id limit 1;

  -- ---- 1. Function execute: the thing that was actually open ----
  perform pg_temp.run('anon calls admin_overview()',            'EXPECT-DENY', 'select public.admin_overview()', null, 'anon');
  perform pg_temp.run('anon calls admin_groups()',              'EXPECT-DENY', 'select * from public.admin_groups()', null, 'anon');
  perform pg_temp.run('member calls admin_overview()',          'EXPECT-DENY', 'select public.admin_overview()', victim.profile_id);
  perform pg_temp.run('anon calls promote_from_waitlist()',     'EXPECT-DENY', format('select public.promote_from_waitlist(%L)', gm.game_id), null, 'anon');
  perform pg_temp.run('member calls promote_from_waitlist()',   'EXPECT-DENY', format('select public.promote_from_waitlist(%L)', gm.game_id), victim.profile_id);
  perform pg_temp.run('member calls seats_taken()',             'EXPECT-DENY', format('select public.seats_taken(%L)', gm.game_id), victim.profile_id);
  perform pg_temp.run('anon reads admin_activity view',         'EXPECT-DENY', 'select * from public.admin_activity limit 1', null, 'anon');

  -- ---- 2. Column privileges ----
  perform pg_temp.run('member reads claim_code column',         'EXPECT-DENY', 'select claim_code from public.group_members limit 1', victim.profile_id);
  perform pg_temp.run('player sets own signup_order = 0',       'EXPECT-DENY', format('update public.game_signups set signup_order = 0 where id = %L', own_sig.id), victim.profile_id);
  perform pg_temp.run('non-admin inserts a buyin',              'EXPECT-DENY', format('insert into public.buyins (game_id, member_id, amount_cents, chips) values (%L, %L, 100, 1)', gm.game_id, victim.member_id), victim.profile_id);
  perform pg_temp.run('non-admin inserts a cashout',            'EXPECT-DENY', format('insert into public.cashouts (game_id, member_id, chips, amount_cents, recorded_by_member_id) values (%L, %L, 1, 1, %L)', gm.game_id, victim.member_id, victim.member_id), victim.profile_id);
  perform pg_temp.run('non-admin takes over admin_member_id',   'EXPECT-DENY', format('update public.games set admin_member_id = %L where id = %L', victim.member_id, gm.game_id), victim.profile_id);
  perform pg_temp.run('member sets games.status directly',      'EXPECT-DENY', format('update public.games set status = ''settled'' where id = %L', gm.game_id), victim.profile_id);
  perform pg_temp.run('member inserts a game directly',         'EXPECT-DENY', format('insert into public.games (group_id, scheduled_at, seat_limit, default_buyin_cents, chips_per_dollar, admin_member_id, created_by_member_id) values (%L, now(), 8, 5000, 2, %L, %L)', victim.group_id, victim.member_id, victim.member_id), victim.profile_id);
  perform pg_temp.run('member rewrites another''s venmo override', 'EXPECT-DENY', format('update public.group_members set venmo_handle = ''attacker'' where group_id = %L and id <> %L', victim.group_id, victim.member_id), victim.profile_id);
  perform pg_temp.run('member sets own role = owner',           'EXPECT-DENY', format('update public.group_members set role = ''owner'' where id = %L', victim.member_id), victim.profile_id);
  if admin_m.member_id is not null then
    perform pg_temp.run('group ADMIN sets own role = owner',    'EXPECT-DENY', format('update public.group_members set role = ''owner'' where id = %L', admin_m.member_id), admin_m.profile_id);
    perform pg_temp.run('group ADMIN force-claims a member',    'EXPECT-DENY', format('update public.group_members set profile_id = %L where group_id = %L and profile_id is null', admin_m.profile_id, admin_m.group_id), admin_m.profile_id);
  end if;
  perform pg_temp.run('member changes groups.invite_code',      'EXPECT-DENY', format('update public.groups set invite_code = ''aaaaaaaa'' where id = %L', victim.group_id), victim.profile_id);
  perform pg_temp.run('member backdates a buyin created_at',    'EXPECT-DENY', format('insert into public.buyins (game_id, member_id, amount_cents, chips, created_at) values (%L, %L, 100, 1, now() - interval ''1 day'')', gm.game_id, victim.member_id), victim.profile_id);

  -- ---- 3. Row visibility ----
  if other.id is not null then
    -- The statement raises only if the row IS visible, so "allowed" here
    -- means the row was hidden — which is the pass.
    perform pg_temp.run('non-party cannot see a settlement (allowed = hidden)', 'EXPECT-ALLOW',
      format('do $x$ begin if exists (select 1 from public.settlements where id = %L) then raise exception ''settlement visible to non-party''; end if; end $x$', other.id), victim.profile_id);
  end if;

  -- ---- 4. Positive controls: the app still works ----
  perform pg_temp.run('member reads roster (allowed columns)',  'EXPECT-ALLOW', 'select id, display_name, role, profile_id from public.group_members limit 1', victim.profile_id);
  perform pg_temp.run('member updates own display_name',        'EXPECT-ALLOW', format('update public.profiles set display_name = display_name where id = %L', victim.profile_id), victim.profile_id);
  perform pg_temp.run('player updates own signup status (no-op)', 'EXPECT-ALLOW', format('update public.game_signups set status = status where id = %L', own_sig.id), victim.profile_id);
  perform pg_temp.run('member calls my_payment_details()',      'EXPECT-ALLOW', 'select * from public.my_payment_details()', victim.profile_id);
  perform pg_temp.run('member calls group_claim_codes() (0 rows, no error)', 'EXPECT-ALLOW', format('select * from public.group_claim_codes(%L)', victim.group_id), victim.profile_id);
  perform pg_temp.run('member calls game_nets() on own game',   'EXPECT-ALLOW', format('select * from public.game_nets(%L)', gm.game_id), victim.profile_id);
  perform pg_temp.run('service_role calls admin_overview()',    'EXPECT-ALLOW', 'select public.admin_overview()', null, 'service_role');
end $$;

select n, test, expect, got, pass from audit_results order by n;
select count(*) filter (where not pass) as failures, count(*) as total from audit_results;

rollback;
