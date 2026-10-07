-- Proof for 20261007000000_agent_actions_admin.sql.
--
-- Run in the SQL editor with "Run without RLS" (as postgres). One
-- transaction, ending in ROLLBACK: the game it creates, the edits, the guest
-- and the cancel all disappear. It also picks a real pending transfer for the
-- close-out case and changes it inside the transaction only.
--
-- Read the last table: row 0 is the summary, failures sort to the top.

begin;

create temp table x_results (n serial, test text, expect text, got text, pass boolean) on commit drop;
grant all on x_results to authenticated, anon, service_role;
grant usage, select on sequence x_results_n_seq to authenticated, anon, service_role;

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
  admin_uid uuid;     -- someone who can create a game in a group...
  grp uuid;           -- ...that group
  other_uid uuid;     -- another active member of that group (not the admin)
  gid uuid;           -- the throwaway game
  guest uuid;         -- a guest added to it
  got text;
  n int;
  st record;
  payer_uid uuid; payee_uid uuid; adm2 uuid; bystander uuid;
begin
  -- ---------- a group with two active, claimed members
  select m1.profile_id, m1.group_id, m2.profile_id
    into admin_uid, grp, other_uid
  from public.group_members m1
  join public.group_members m2
    on m2.group_id = m1.group_id and m2.id <> m1.id
   and m2.is_active and m2.profile_id is not null
  where m1.is_active and m1.profile_id is not null
  limit 1;
  if admin_uid is null then
    insert into x_results (test, expect, got, pass)
    values ('SETUP: a group with two claimed members', 'found', 'none', false);
    return;
  end if;

  -- ---------- created_game
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', admin_uid, 'role', 'authenticated')::text, true);
  gid := public.create_game(now() + interval '2 days', grp, null, 'proof game', null, 6, null, null, true);
  reset role;

  got := pg_temp.try_as(admin_uid, format('select public.record_agent_action(%L, %L)', 'created_game', gid));
  insert into x_results (test, expect, got, pass) values ('the creator can record that they created the game', 'ok', got, got = 'ok');

  got := pg_temp.try_as(other_uid, format('select public.record_agent_action(%L, %L)', 'created_game', gid));
  insert into x_results (test, expect, got, pass) values ('someone else cannot claim they created it', 'denied', got, got like 'denied%');

  select count(*) into n from public.agent_actions where game_id = gid and action = 'created_game';
  got := pg_temp.try_as(admin_uid, format('select public.record_agent_action(%L, %L)', 'created_game', gid));
  select count(*) into n from public.agent_actions where game_id = gid and action = 'created_game';
  insert into x_results (test, expect, got, pass) values ('recording the creation twice leaves one marker', '1', n::text, n = 1);

  -- ---------- edited_game: only after a real edit
  got := pg_temp.try_as(admin_uid, format('select public.record_agent_action(%L, %L)', 'edited_game', gid));
  insert into x_results (test, expect, got, pass) values ('cannot record an edit that did not happen', 'denied', got, got like 'denied%');

  got := pg_temp.try_as(admin_uid, format('update public.games set location = %L where id = %L', 'Proof Place', gid));
  insert into x_results (test, expect, got, pass) values ('SETUP: admin edits the location the ordinary way', 'ok', got, got = 'ok');

  got := pg_temp.try_as(admin_uid, format('select public.record_agent_action(%L, %L)', 'edited_game', gid));
  insert into x_results (test, expect, got, pass) values ('admin can record the edit', 'ok', got, got = 'ok');

  got := pg_temp.try_as(other_uid, format('select public.record_agent_action(%L, %L)', 'edited_game', gid));
  insert into x_results (test, expect, got, pass) values ('another member cannot record someone else''s edit', 'denied', got, got like 'denied%');

  -- ---------- added_player: the admin only, and a real signup
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', admin_uid, 'role', 'authenticated')::text, true);
  perform public.add_player_to_game(gid, null, 'Proof Guest');
  reset role;
  select id into guest from public.group_members where group_id = grp and display_name = 'Proof Guest' limit 1;

  got := pg_temp.try_as(other_uid, format('select public.record_agent_action(%L, %L, null, %L)', 'added_player', gid, guest));
  insert into x_results (test, expect, got, pass) values ('a non-admin cannot record adding a player', 'denied', got, got like 'denied%');

  got := pg_temp.try_as(admin_uid, format('select public.record_agent_action(%L, %L, null, %L)', 'added_player', gid, guest));
  insert into x_results (test, expect, got, pass) values ('the admin can record adding the guest', 'ok', got, got = 'ok');

  got := pg_temp.try_as(admin_uid, format('select public.record_agent_action(%L, %L, null, %L)', 'seated_player', gid, other_uid));
  insert into x_results (test, expect, got, pass) values ('cannot record seating someone who is not in the game', 'denied', got, got like 'denied%');

  -- ---------- visibility: the whole group sees game-level markers
  n := pg_temp.count_as(other_uid, format('select count(*) from public.agent_actions where game_id = %L', gid));
  insert into x_results (test, expect, got, pass) values ('another group member sees the game markers', 'SOME', n::text, n >= 3);

  -- ---------- cancelled_game
  got := pg_temp.try_as(admin_uid, format('select public.record_agent_action(%L, %L)', 'cancelled_game', gid));
  insert into x_results (test, expect, got, pass) values ('cannot record a cancel while the game is open', 'denied', got, got like 'denied%');

  got := pg_temp.try_as(admin_uid, format('select public.cancel_game(%L)', gid));
  insert into x_results (test, expect, got, pass) values ('SETUP: admin cancels the ordinary way', 'ok', got, got = 'ok');

  got := pg_temp.try_as(admin_uid, format('select public.record_agent_action(%L, %L)', 'cancelled_game', gid));
  insert into x_results (test, expect, got, pass) values ('admin can record the cancel', 'ok', got, got = 'ok');

  got := pg_temp.try_as(other_uid, format('select public.record_agent_action(%L, %L)', 'cancelled_game', gid));
  insert into x_results (test, expect, got, pass) values ('a non-admin non-owner cannot record a cancel', 'denied', got, got like 'denied%');

  -- ---------- closed_out: a real pending transfer, closed by the admin
  select s.id, s.game_id, s.from_member_id, s.to_member_id, g.group_id, g.admin_member_id
    into st
  from public.settlements s
  join public.games g on g.id = s.game_id
  join public.group_members pf on pf.id = s.from_member_id and pf.profile_id is not null
  join public.group_members pt on pt.id = s.to_member_id and pt.profile_id is not null
  where s.status = 'pending'
    and s.from_member_id <> g.admin_member_id and s.to_member_id <> g.admin_member_id
    and exists (select 1 from public.group_members b
                where b.group_id = g.group_id and b.is_active and b.profile_id is not null
                  and b.id not in (s.from_member_id, s.to_member_id, g.admin_member_id))
  limit 1;

  if st.id is null then
    insert into x_results (test, expect, got, pass)
    values ('SETUP: a pending transfer with a bystander exists', 'found', 'none (skipped close-out)', true);
  else
    select profile_id into payer_uid from public.group_members where id = st.from_member_id;
    select profile_id into payee_uid from public.group_members where id = st.to_member_id;
    select profile_id into adm2 from public.group_members where id = st.admin_member_id;
    select b.profile_id into bystander from public.group_members b
    where b.group_id = st.group_id and b.is_active and b.profile_id is not null
      and b.id not in (st.from_member_id, st.to_member_id, st.admin_member_id) limit 1;

    got := pg_temp.try_as(adm2, format('select public.record_agent_action(%L, null, %L)', 'closed_out', st.id));
    insert into x_results (test, expect, got, pass) values ('cannot record a close-out before it happened', 'denied', got, got like 'denied%');

    got := pg_temp.try_as(adm2, format('update public.settlements set status = %L where id = %L', 'confirmed', st.id));
    insert into x_results (test, expect, got, pass) values ('SETUP: admin closes it out the ordinary way', 'ok', got, got = 'ok');

    got := pg_temp.try_as(adm2, format('select public.record_agent_action(%L, null, %L)', 'closed_out', st.id));
    insert into x_results (test, expect, got, pass) values ('admin can record the close-out', 'ok', got, got = 'ok');

    got := pg_temp.try_as(payer_uid, format('select public.record_agent_action(%L, null, %L)', 'closed_out', st.id));
    insert into x_results (test, expect, got, pass) values ('the payer cannot record a close-out', 'denied', got, got like 'denied%');

    n := pg_temp.count_as(payer_uid, format('select count(*) from public.agent_actions where settlement_id = %L', st.id));
    insert into x_results (test, expect, got, pass) values ('the payer sees the close-out marker', '1', n::text, n = 1);
    n := pg_temp.count_as(payee_uid, format('select count(*) from public.agent_actions where settlement_id = %L', st.id));
    insert into x_results (test, expect, got, pass) values ('the payee sees the close-out marker', '1', n::text, n = 1);
    n := pg_temp.count_as(bystander, format('select count(*) from public.agent_actions where settlement_id = %L', st.id));
    insert into x_results (test, expect, got, pass) values ('a bystander does NOT see who paid whom', '0', n::text, n = 0);
  end if;

  -- ---------- the shape rules, and the closed doors
  got := pg_temp.try_as(admin_uid, 'select public.record_agent_action(''nonsense'', null)');
  insert into x_results (test, expect, got, pass) values ('an unknown action is refused', 'denied', got, got like 'denied%');

  got := pg_temp.try_as(admin_uid, format('insert into public.agent_actions (profile_id, member_id, game_id, action) values (%L, %L, %L, %L)',
                         admin_uid, (select id from public.group_members where profile_id = admin_uid and group_id = grp limit 1), gid, 'created_game'));
  insert into x_results (test, expect, got, pass) values ('still no direct insert', 'denied', got, got like 'denied%');

  begin
    set local role anon;
    perform public.record_agent_action('created_game', gid);
    got := 'ALLOWED';
  exception when others then got := 'denied: ' || sqlstate;
  end;
  reset role;
  insert into x_results (test, expect, got, pass) values ('anon cannot call record_agent_action', 'denied', got, got like 'denied%');
end $$;

select 0 as n, 'SUMMARY' as test,
       count(*) filter (where not pass) || ' failed of ' || count(*) as expect,
       case when bool_and(pass) then 'ALL PASS' else 'FAILURES' end as got,
       bool_and(pass) as pass
from x_results
union all
select n, test, expect, got, pass from x_results
order by pass, n;

rollback;
