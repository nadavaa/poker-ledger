-- Proof for 20261006010000_agent_actions.sql.
--
-- Run in the SQL editor with "Run without RLS" (as postgres): the script
-- impersonates users itself via request.jwt.claims, which needs SET ROLE.
--
-- One transaction, ending in ROLLBACK. It picks REAL rows (a pending transfer
-- with a bystander in the group, and a confirmed signup) and changes them
-- inside the transaction only. Nothing persists.
--
-- Read the last table: row 0 is the summary, failures sort to the top.

begin;

create temp table a_results (n serial, test text, expect text, got text, pass boolean) on commit drop;

-- Runs one statement as one user; reports 'ok' or 'denied: ...'.
create function pg_temp.try_as(as_uid uuid, sql text)
returns text language plpgsql as $f$
declare got text;
begin
  begin
    set local role authenticated;
    perform set_config('request.jwt.claims',
      json_build_object('sub', as_uid, 'role', 'authenticated')::text, true);
    execute sql;
    got := 'ok';
  exception when others then
    got := 'denied: ' || left(sqlerrm, 70);
  end;
  reset role;
  return got;
end $f$;

-- Counts the rows one query returns as one user (row-level security applies).
create function pg_temp.count_as(as_uid uuid, sql text)
returns int language plpgsql as $f$
declare cnt int;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', as_uid, 'role', 'authenticated')::text, true);
  execute sql into cnt;
  reset role;
  return cnt;
end $f$;

do $$
declare
  st record;          -- a pending transfer
  grp uuid;
  payer_uid uuid;
  payee_uid uuid;
  admin_uid uuid;
  bystander uuid;     -- an active group member who is neither party nor admin
  sg record;          -- a confirmed signup, for the signup half
  sg_uid uuid;
  sg_bystander uuid;
  outsider uuid;      -- someone in no group with this game
  got text;
  n int;
begin
  -- ---------- a pending transfer whose group has a true bystander
  select s.id, s.game_id, s.from_member_id, s.to_member_id, g.group_id, g.admin_member_id
    into st
  from public.settlements s
  join public.games g on g.id = s.game_id
  join public.group_members pf on pf.id = s.from_member_id and pf.profile_id is not null
  join public.group_members pt on pt.id = s.to_member_id and pt.profile_id is not null
  where s.status = 'pending'
    and s.from_member_id <> g.admin_member_id
    and s.to_member_id <> g.admin_member_id
    and exists (
      select 1 from public.group_members b
      where b.group_id = g.group_id and b.is_active and b.profile_id is not null
        and b.id not in (s.from_member_id, s.to_member_id, g.admin_member_id)
    )
  limit 1;

  if st.id is null then
    insert into a_results (test, expect, got, pass)
    values ('SETUP: a pending transfer with a bystander exists', 'found', 'none found', false);
    return;
  end if;

  select profile_id into payer_uid from public.group_members where id = st.from_member_id;
  select profile_id into payee_uid from public.group_members where id = st.to_member_id;
  select profile_id into admin_uid from public.group_members where id = st.admin_member_id;
  select b.profile_id into bystander
  from public.group_members b
  where b.group_id = st.group_id and b.is_active and b.profile_id is not null
    and b.id not in (st.from_member_id, st.to_member_id, st.admin_member_id)
  limit 1;
  select p.id into outsider from public.profiles p
  where not exists (select 1 from public.group_members m where m.group_id = st.group_id and m.profile_id = p.id)
  limit 1;

  -- ---------- a forged marker is refused before anything happened
  got := pg_temp.try_as(payer_uid, format(
    'select public.record_agent_action(%L, null, %L)', 'marked_paid', st.id));
  insert into a_results (test, expect, got, pass)
  values ('cannot record "marked paid" for a transfer still pending', 'denied', got, got like 'denied%');

  -- ---------- the payer marks it paid (the ordinary update), then it is recorded
  got := pg_temp.try_as(payer_uid, format(
    'update public.settlements set status = %L where id = %L', 'paid', st.id));
  insert into a_results (test, expect, got, pass)
  values ('SETUP: payer marks it paid the ordinary way', 'ok', got, got = 'ok');

  got := pg_temp.try_as(payer_uid, format(
    'select public.record_agent_action(%L, null, %L)', 'marked_paid', st.id));
  insert into a_results (test, expect, got, pass)
  values ('payer can record that they marked it paid', 'ok', got, got = 'ok');

  got := pg_temp.try_as(payer_uid, format(
    'select public.record_agent_action(%L, null, %L)', 'marked_paid', st.id));
  select count(*) into n from public.agent_actions where settlement_id = st.id and action = 'marked_paid';
  insert into a_results (test, expect, got, pass)
  values ('recording twice leaves one marker', '1', n::text, n = 1);

  -- ---------- only the right person, and only for what they did
  got := pg_temp.try_as(payee_uid, format(
    'select public.record_agent_action(%L, null, %L)', 'marked_paid', st.id));
  insert into a_results (test, expect, got, pass)
  values ('the payee cannot claim the payer''s action', 'denied', got, got like 'denied%');

  got := pg_temp.try_as(payer_uid, format(
    'select public.record_agent_action(%L, null, %L)', 'confirmed_received', st.id));
  insert into a_results (test, expect, got, pass)
  values ('the payer cannot record a confirmation', 'denied', got, got like 'denied%');

  got := pg_temp.try_as(bystander, format(
    'select public.record_agent_action(%L, null, %L)', 'marked_paid', st.id));
  insert into a_results (test, expect, got, pass)
  values ('a bystander cannot record anything on a transfer', 'denied', got, got like 'denied%');

  -- ---------- who can SEE the transfer marker: the settlement's own audience
  n := pg_temp.count_as(payer_uid, format('select count(*) from public.agent_actions where settlement_id = %L', st.id));
  insert into a_results (test, expect, got, pass) values ('payer sees the marker', '1', n::text, n = 1);

  n := pg_temp.count_as(payee_uid, format('select count(*) from public.agent_actions where settlement_id = %L', st.id));
  insert into a_results (test, expect, got, pass) values ('payee sees the marker', '1', n::text, n = 1);

  n := pg_temp.count_as(admin_uid, format('select count(*) from public.agent_actions where settlement_id = %L', st.id));
  insert into a_results (test, expect, got, pass) values ('game admin sees the marker', '1', n::text, n = 1);

  n := pg_temp.count_as(bystander, format('select count(*) from public.agent_actions where settlement_id = %L', st.id));
  insert into a_results (test, expect, got, pass)
  values ('a bystander in the group does NOT see who paid whom', '0', n::text, n = 0);

  if outsider is not null then
    n := pg_temp.count_as(outsider, format('select count(*) from public.agent_actions where game_id = %L', st.game_id));
    insert into a_results (test, expect, got, pass)
    values ('someone outside the group sees nothing', '0', n::text, n = 0);
  end if;

  -- ---------- confirmation by the payee
  got := pg_temp.try_as(payee_uid, format(
    'update public.settlements set status = %L where id = %L', 'confirmed', st.id));
  insert into a_results (test, expect, got, pass)
  values ('SETUP: payee confirms the ordinary way', 'ok', got, got = 'ok');
  got := pg_temp.try_as(payee_uid, format(
    'select public.record_agent_action(%L, null, %L)', 'confirmed_received', st.id));
  insert into a_results (test, expect, got, pass)
  values ('payee can record that they confirmed it', 'ok', got, got = 'ok');

  -- ---------- signups: visible to the whole group, tied to one signup
  select s.game_id, s.member_id, s.signup_order, g.group_id, m.profile_id
    into sg
  from public.game_signups s
  join public.games g on g.id = s.game_id
  join public.group_members m on m.id = s.member_id and m.profile_id is not null
  where s.status = 'confirmed'
    and exists (
      select 1 from public.group_members b
      where b.group_id = g.group_id and b.is_active and b.profile_id is not null
        and b.id <> s.member_id
    )
  limit 1;

  if sg.game_id is not null then
    sg_uid := sg.profile_id;
    select b.profile_id into sg_bystander from public.group_members b
    where b.group_id = sg.group_id and b.is_active and b.profile_id is not null and b.id <> sg.member_id
    limit 1;

    got := pg_temp.try_as(sg_uid, format(
      'select public.record_agent_action(%L, %L)', 'joined', sg.game_id));
    insert into a_results (test, expect, got, pass)
    values ('a seated player can record that they joined', 'ok', got, got = 'ok');

    got := pg_temp.try_as(sg_uid, format(
      'select public.record_agent_action(%L, %L)', 'withdrew', sg.game_id));
    insert into a_results (test, expect, got, pass)
    values ('cannot record a withdrawal while still seated', 'denied', got, got like 'denied%');

    n := pg_temp.count_as(sg_bystander, format(
      'select count(*) from public.agent_actions where game_id = %L and action = %L', sg.game_id, 'joined'));
    insert into a_results (test, expect, got, pass)
    values ('the rest of the group sees a signup marker', 'SOME', n::text, n >= 1);

    select count(*) into n from public.agent_actions
     where member_id = sg.member_id and game_id = sg.game_id and signup_order = sg.signup_order;
    insert into a_results (test, expect, got, pass)
    values ('the signup marker is tied to that signup_order', '1', n::text, n = 1);

    -- Withdraw the ordinary way, then the marker for it is allowed.
    got := pg_temp.try_as(sg_uid, format(
      'update public.game_signups set status = %L where game_id = %L and member_id = %L',
      'withdrawn', sg.game_id, sg.member_id));
    -- A refusal here (money already in the pot) is a valid outcome of the
    -- database; only continue if the withdrawal went through.
    if got = 'ok' and exists (
      select 1 from public.game_signups where game_id = sg.game_id and member_id = sg.member_id and status = 'withdrawn'
    ) then
      got := pg_temp.try_as(sg_uid, format(
        'select public.record_agent_action(%L, %L)', 'withdrew', sg.game_id));
      insert into a_results (test, expect, got, pass)
      values ('a player who just withdrew can record it', 'ok', got, got = 'ok');
    end if;
  end if;

  -- ---------- the table itself is closed
  got := pg_temp.try_as(payer_uid, 'insert into public.agent_actions (profile_id, member_id, game_id, action, signup_order) select profile_id, member_id, game_id, ''joined'', 999 from public.agent_actions limit 1');
  insert into a_results (test, expect, got, pass)
  values ('nobody can insert a marker directly', 'denied', got, got like 'denied%');

  got := pg_temp.try_as(payer_uid, 'update public.agent_actions set action = ''withdrew''');
  insert into a_results (test, expect, got, pass)
  values ('nobody can edit a marker', 'denied', got, got like 'denied%');

  got := pg_temp.try_as(payer_uid, 'delete from public.agent_actions');
  insert into a_results (test, expect, got, pass)
  values ('nobody can delete a marker', 'denied', got, got like 'denied%');

  begin
    set local role anon;
    perform public.record_agent_action('joined', st.game_id);
    got := 'ALLOWED';
  exception when others then got := 'denied: ' || sqlstate;
  end;
  reset role;
  insert into a_results (test, expect, got, pass)
  values ('anon cannot call record_agent_action', 'denied', got, got like 'denied%');

  begin
    set local role anon;
    perform count(*) from public.agent_actions;
    got := 'ALLOWED';
  exception when others then got := 'denied: ' || sqlstate;
  end;
  reset role;
  insert into a_results (test, expect, got, pass)
  values ('anon cannot read markers', 'denied', got, got like 'denied%');
end $$;

select 0 as n, 'SUMMARY' as test,
       count(*) filter (where not pass) || ' failed of ' || count(*) as expect,
       case when bool_and(pass) then 'ALL PASS' else 'FAILURES' end as got,
       bool_and(pass) as pass
from a_results
union all
select n, test, expect, got, pass from a_results
order by pass, n;

rollback;
