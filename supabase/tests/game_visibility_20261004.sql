-- Can a group member who never signed up for a game still see it?
--
-- Run in the SQL editor with "Run without RLS" (as postgres): the script
-- impersonates the viewer itself via request.jwt.claims, the way PostgREST
-- does, and that needs SET ROLE.
--
-- One transaction, ending in ROLLBACK. It picks a REAL game that already has
-- a bystander — an active member of that group with no signup row — and only
-- reads. Nothing is created and nothing is written.
--
-- Read the last table: row 0 is the summary, failures sort to the top.

begin;

create temp table vis_results (n serial, test text, expect text, got text, pass boolean) on commit drop;

-- Reads one query as one user and records the row count it could see.
create function pg_temp.seen(test text, expect text, sql text, as_uid uuid)
returns void language plpgsql as $f$
declare cnt int; got text; ok boolean;
begin
  begin
    set local role authenticated;
    perform set_config('request.jwt.claims',
      json_build_object('sub', as_uid, 'role', 'authenticated')::text, true);
    execute sql into cnt;
    got := cnt::text || ' row(s)';
  exception when others then
    got := 'error: ' || sqlstate || ' ' || left(sqlerrm, 60);
  end;
  reset role;
  ok := case
          when expect = 'SOME' then got ~ '^[1-9]'
          when expect = 'NONE' then got = '0 row(s)'
        end;
  insert into vis_results (test, expect, got, pass) values (test, expect, got, ok);
end $f$;

-- Attempts one write as one user. The savepoint undoes it either way, and
-- the transaction rolls back regardless.
create function pg_temp.attempt(test text, sql text, as_uid uuid)
returns void language plpgsql as $f$
declare got text;
begin
  begin
    set local role authenticated;
    perform set_config('request.jwt.claims',
      json_build_object('sub', as_uid, 'role', 'authenticated')::text, true);
    execute sql;
    raise exception using errcode = 'P0999', message = 'allowed';
  exception
    when sqlstate 'P0999' then got := 'ALLOWED';
    when others then got := 'denied: ' || sqlstate || ' ' || left(sqlerrm, 55);
  end;
  reset role;
  insert into vis_results (test, expect, got, pass)
  values (test, 'NONE', got, got like 'denied%');
end $f$;

do $$
declare
  g          record;
  bystander  uuid;   -- profile id of a member of that group with NO signup
  participant uuid;  -- profile id of someone who did play, as a control
  n_settle   int;
  n_food     int;
begin
  -- A game with buy-ins, at least one settlement, and a group member who is
  -- active but never signed up for it.
  select gm.id as game_id, gm.group_id, gm.status into g
  from public.games gm
  where exists (select 1 from public.buyins b where b.game_id = gm.id)
    and exists (
      select 1 from public.group_members m
      where m.group_id = gm.group_id and m.is_active and m.profile_id is not null
        and not exists (
          select 1 from public.game_signups s
          where s.game_id = gm.id and s.member_id = m.id
        )
    )
  order by gm.started_at desc nulls last
  limit 1;

  if g.game_id is null then
    insert into vis_results (test, expect, got, pass) values (
      'no game in this database has a non-participant group member',
      'SOME', 'cannot test', false);
    return;
  end if;

  select m.profile_id into bystander
  from public.group_members m
  where m.group_id = g.group_id and m.is_active and m.profile_id is not null
    and not exists (
      select 1 from public.game_signups s
      where s.game_id = g.game_id and s.member_id = m.id
    )
  limit 1;

  select m.profile_id into participant
  from public.game_signups s
  join public.group_members m on m.id = s.member_id
  where s.game_id = g.game_id and m.profile_id is not null
  limit 1;

  insert into vis_results (test, expect, got, pass) values (
    format('subject: game %s (%s), viewer is in the group with no signup',
           left(g.game_id::text, 8), g.status),
    'SOME', 'fixture', true);

  -- ---- What a non-participant SHOULD see ----
  perform pg_temp.seen('bystander sees the game row', 'SOME',
    format('select count(*) from public.games where id = %L', g.game_id), bystander);
  perform pg_temp.seen('bystander sees who played (signups)', 'SOME',
    format('select count(*) from public.game_signups where game_id = %L', g.game_id), bystander);
  perform pg_temp.seen('bystander sees the buy-ins / the pot', 'SOME',
    format('select count(*) from public.buyins where game_id = %L', g.game_id), bystander);
  perform pg_temp.seen('bystander sees the results table', 'SOME',
    format('select count(*) from public.game_player_totals where game_id = %L', g.game_id), bystander);
  perform pg_temp.seen('bystander sees the roster', 'SOME',
    format('select count(*) from public.group_members where group_id = %L', g.group_id), bystander);
  perform pg_temp.seen('bystander sees every game in the group', 'SOME',
    format('select count(*) from public.games where group_id = %L', g.group_id), bystander);

  -- cashouts and adjustments may legitimately be empty; only assert when the
  -- game actually has some, otherwise an empty read proves nothing.
  if exists (select 1 from public.cashouts where game_id = g.game_id) then
    perform pg_temp.seen('bystander sees the cashouts', 'SOME',
      format('select count(*) from public.cashouts where game_id = %L', g.game_id), bystander);
  end if;
  if exists (select 1 from public.game_adjustments where game_id = g.game_id) then
    perform pg_temp.seen('bystander sees the adjustments', 'SOME',
      format('select count(*) from public.game_adjustments where game_id = %L', g.game_id), bystander);
  end if;

  -- ---- What must stay hidden ----
  select count(*) into n_settle from public.settlements where game_id = g.game_id;
  if n_settle > 0 then
    perform pg_temp.seen('bystander sees NO settlement transfers', 'NONE',
      format('select count(*) from public.settlements where game_id = %L', g.game_id), bystander);
    if participant is not null then
      perform pg_temp.seen('a participant still sees their own settlements', 'SOME',
        format('select count(*) from public.settlements where game_id = %L', g.game_id), participant);
    end if;
  end if;

  select count(*) into n_food from public.food_orders where game_id = g.game_id;
  if n_food > 0 then
    perform pg_temp.seen('bystander sees NO food orders', 'NONE',
      format('select count(*) from public.food_orders where game_id = %L', g.game_id), bystander);
    perform pg_temp.seen('bystander sees NO food shares', 'NONE',
      format('select count(*) from public.food_order_shares s
              join public.food_orders o on o.id = s.food_order_id
              where o.game_id = %L', g.game_id), bystander);
  end if;

  -- ---- Write access is unchanged ----
  perform pg_temp.attempt('bystander cannot log a buy-in',
    format('insert into public.buyins (game_id, member_id, amount_cents, chips)
            values (%L, (select id from public.group_members
                         where group_id = %L and profile_id = %L limit 1), 100, 1)',
           g.game_id, g.group_id, bystander),
    bystander);

  perform pg_temp.attempt('bystander cannot record a cashout',
    format('insert into public.cashouts (game_id, member_id, chips, amount_cents, recorded_by_member_id)
            values (%L, (select id from public.group_members
                         where group_id = %L and profile_id = %L limit 1), 1, 1,
                        (select id from public.group_members
                         where group_id = %L and profile_id = %L limit 1))',
           g.game_id, g.group_id, bystander, g.group_id, bystander),
    bystander);
end $$;

select 0 as n,
  format('SUMMARY: %s failure(s) of %s',
    count(*) filter (where not pass), count(*)) as test,
  '' as expect, '' as got, bool_and(pass) as pass
from vis_results
union all
select n, test, expect, got, pass from vis_results
order by pass nulls first, n;

rollback;
