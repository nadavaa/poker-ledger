-- Proof for 20261116000000_payment_modes.sql. Run in the SQL editor AFTER
-- applying the migration.
--
-- One transaction ending in ROLLBACK, so nothing here changes production.
-- Each attempt runs as a real user (impersonated via request.jwt.claims, the
-- way PostgREST does it). Read the final table: every row must show
-- pass = true. Tests that need an open game are skipped (not listed) when the
-- picked member has none.

begin;

create temp table audit_results (n serial, test text, expect text, got text, pass boolean) on commit drop;
grant all on audit_results to authenticated, anon;
grant usage on sequence audit_results_n_seq to authenticated, anon;

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
  victim   record;  -- a member with a profile who is not the game admin of open_g
  open_g   record;  -- a scheduled/active/reconciling game victim is confirmed in
  mate     record;  -- another confirmed player in open_g
  done_g   record;  -- a settled game in victim's group
  admin_p  uuid;    -- profile of done_g's admin
  any_s    record;  -- any settlement victim can see
begin
  select m.id as member_id, m.profile_id, m.group_id, s.game_id
    into victim
  from public.group_members m
  join public.game_signups s on s.member_id = m.id and s.status = 'confirmed'
  join public.games g on g.id = s.game_id
  where m.profile_id is not null and m.is_active
    and g.status in ('scheduled', 'active', 'reconciling')
    and g.admin_member_id <> m.id
  order by g.created_at desc limit 1;

  if victim.member_id is null then
    -- No open game to test against: fall back to any member for the rest.
    select m.id as member_id, m.profile_id, m.group_id, null::uuid as game_id
      into victim
    from public.group_members m
    where m.profile_id is not null and m.is_active
    order by m.created_at limit 1;
  end if;

  if victim.game_id is not null then
    select s.member_id into mate from public.game_signups s
    where s.game_id = victim.game_id and s.status = 'confirmed'
      and s.member_id <> victim.member_id limit 1;
  end if;

  select g.id as game_id, g.admin_member_id into done_g
  from public.games g
  where g.group_id = victim.group_id and g.status = 'settled'
  order by g.settled_at desc limit 1;
  select profile_id into admin_p from public.group_members where id = done_g.admin_member_id;

  select s.id into any_s from public.settlements s
  where s.from_member_id = victim.member_id or s.to_member_id = victim.member_id limit 1;

  -- ---- Schema ----
  perform pg_temp.run('existing games default to online', 'EXPECT-ALLOW',
    'do $x$ begin if exists (select 1 from public.games where payment_mode is null) then raise exception ''null mode''; end if; end $x$',
    null, 'postgres');
  perform pg_temp.run('existing settlements default to app', 'EXPECT-ALLOW',
    'do $x$ begin if exists (select 1 from public.settlements where method <> ''app'') then raise exception ''non-app row''; end if; end $x$',
    null, 'postgres');
  perform pg_temp.run('old 9-argument create_game is gone', 'EXPECT-ALLOW',
    'do $x$ begin if to_regprocedure(''public.create_game(timestamptz, uuid, text, text, text, integer, integer, numeric, boolean)'') is not null then raise exception ''old overload still there''; end if; end $x$',
    null, 'postgres');

  -- ---- Who can read methods ----
  perform pg_temp.run('anon calls game_payment_methods()', 'EXPECT-DENY',
    format('select * from public.game_payment_methods(%L)', coalesce(victim.game_id, done_g.game_id)), null, 'anon');
  perform pg_temp.run('member calls game_payment_methods() on own game', 'EXPECT-ALLOW',
    format('select * from public.game_payment_methods(%L)', coalesce(victim.game_id, done_g.game_id)), victim.profile_id);

  -- ---- Who can set a method ----
  perform pg_temp.run('player writes pays_cash column directly', 'EXPECT-DENY',
    format('update public.game_signups set pays_cash = true where member_id = %L', victim.member_id), victim.profile_id);
  if victim.game_id is not null then
    perform pg_temp.run('player sets own method on open game', 'EXPECT-ALLOW',
      format('select public.set_pays_cash(%L, %L, true)', victim.game_id, victim.member_id), victim.profile_id);
    if mate.member_id is not null then
      perform pg_temp.run('player sets someone else''s method', 'EXPECT-DENY',
        format('select public.set_pays_cash(%L, %L, true)', victim.game_id, mate.member_id), victim.profile_id);
    end if;
  end if;
  if done_g.game_id is not null and admin_p is not null then
    perform pg_temp.run('game admin sets a method on a settled game', 'EXPECT-DENY',
      format('select public.set_pays_cash(%L, %L, true)', done_g.game_id, done_g.admin_member_id), admin_p);
  end if;

  -- ---- Who can change the mode ----
  -- RLS refuses by updating zero rows, not by raising, so the statement
  -- raises only if a row changed: "allowed" means refused, which is the pass.
  if victim.game_id is not null then
    perform pg_temp.run('non-admin changes game payment_mode (allowed = refused)', 'EXPECT-ALLOW',
      format('do $x$ begin update public.games set payment_mode = ''cash'' where id = %L; if found then raise exception ''mode changed''; end if; end $x$', victim.game_id),
      victim.profile_id);
  end if;
  if done_g.game_id is not null and admin_p is not null then
    perform pg_temp.run('admin changes mode of a settled game (allowed = refused)', 'EXPECT-ALLOW',
      format('do $x$ begin update public.games set payment_mode = ''cash'' where id = %L; if found then raise exception ''mode changed''; end if; end $x$', done_g.game_id),
      admin_p);
  end if;

  -- ---- Settlement method is the database's ----
  if any_s.id is not null then
    perform pg_temp.run('party rewrites settlements.method', 'EXPECT-DENY',
      format('update public.settlements set method = ''cash'' where id = %L', any_s.id), victim.profile_id);
  end if;
end $$;

select n, test, expect, got, pass from audit_results order by n;
select count(*) filter (where not pass) as failures, count(*) as total from audit_results;

rollback;
