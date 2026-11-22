-- Proof for 20261122000000_unsettle_game.sql. Builds its own group, players
-- and game, then ROLLBACK, so nothing persists. Run AFTER the migration. Every
-- row in the result should match the expectation in its test name.

\set ON_ERROR_STOP on
begin;
create temp table r (n serial, test text, got text);
grant all on r to authenticated; grant usage on sequence r_n_seq to authenticated;
create function pg_temp.as_(uid uuid, sql text, test text) returns void language plpgsql as $f$
declare got text;
begin
  begin
    set local role authenticated;
    perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role','authenticated')::text, true);
    execute sql; got := 'ok';
  exception when others then got := 'ERR: ' || sqlerrm;
  end;
  reset role;
  insert into r (test, got) values (test, got);
end $f$;

insert into auth.users (id, email) values
 ('00000000-0000-0000-0000-00000000000a','a@x'),('00000000-0000-0000-0000-00000000000b','b@x');
insert into groups (id, name, created_by) values ('10000000-0000-0000-0000-000000000000','G','00000000-0000-0000-0000-00000000000a');
insert into group_members (id, group_id, display_name, role, profile_id) values
 ('20000000-0000-0000-0000-00000000000a','10000000-0000-0000-0000-000000000000','Ann','owner','00000000-0000-0000-0000-00000000000a'),
 ('20000000-0000-0000-0000-00000000000b','10000000-0000-0000-0000-000000000000','Ben','member','00000000-0000-0000-0000-00000000000b'),
 ('20000000-0000-0000-0000-00000000000c','10000000-0000-0000-0000-000000000000','Cal','member',null);
insert into games (id, group_id, scheduled_at, default_buyin_cents, chips_per_dollar, admin_member_id, created_by_member_id)
 values ('30000000-0000-0000-0000-000000000000','10000000-0000-0000-0000-000000000000', now(), 5000, 2,
   '20000000-0000-0000-0000-00000000000a','20000000-0000-0000-0000-00000000000a');
insert into game_signups (game_id, member_id) select '30000000-0000-0000-0000-000000000000', id from group_members;

\set A '''00000000-0000-0000-0000-00000000000a'''
\set B '''00000000-0000-0000-0000-00000000000b'''
\set G '''30000000-0000-0000-0000-000000000000'''
select pg_temp.as_(:A, $$select start_game('30000000-0000-0000-0000-000000000000', array['20000000-0000-0000-0000-00000000000a','20000000-0000-0000-0000-00000000000b','20000000-0000-0000-0000-00000000000c']::uuid[])$$, 'start game');
select pg_temp.as_(:A, $$select begin_reconciliation('30000000-0000-0000-0000-000000000000')$$, 'end game');
select pg_temp.as_(:A, $$select record_cashout('30000000-0000-0000-0000-000000000000','20000000-0000-0000-0000-00000000000a',0);
  select record_cashout('30000000-0000-0000-0000-000000000000','20000000-0000-0000-0000-00000000000b',200);
  select record_cashout('30000000-0000-0000-0000-000000000000','20000000-0000-0000-0000-00000000000c',100)$$, 'count chips');
-- Ann -50, Ben +50, Cal 0
select pg_temp.as_(:A, $$select settle_game('30000000-0000-0000-0000-000000000000', '[{"from":"20000000-0000-0000-0000-00000000000a","to":"20000000-0000-0000-0000-00000000000b","amount":5000}]')$$, 'settle #1');
select pg_temp.as_(:A, $$select unsettle_game('30000000-0000-0000-0000-000000000000', '  ')$$, 'unsettle w/o reason -> refuse');
select pg_temp.as_(:B, $$select unsettle_game('30000000-0000-0000-0000-000000000000', 'x')$$, 'unsettle by non-admin -> refuse');
select pg_temp.as_(:A, $$update settlements set status='paid' where game_id='30000000-0000-0000-0000-000000000000'$$, 'Ann marks paid');
select pg_temp.as_(:A, $$select unsettle_game('30000000-0000-0000-0000-000000000000', 'fix')$$, 'unsettle while paid -> refuse');
select pg_temp.as_(:B, $$update settlements set status='confirmed' where game_id='30000000-0000-0000-0000-000000000000'$$, 'Ben confirms');
select pg_temp.as_(:A, $$select unsettle_game('30000000-0000-0000-0000-000000000000', 'Cal rebuy was never logged')$$, 'unsettle');
select pg_temp.as_(:A, $$select unsettle_game('30000000-0000-0000-0000-000000000000', 'again')$$, 'unsettle twice -> refuse');
select pg_temp.as_(:A, $$select cancel_game('30000000-0000-0000-0000-000000000000')$$, 'cancel w/ confirmed -> refuse');
select pg_temp.as_(:A, $$select reopen_game('30000000-0000-0000-0000-000000000000');
  insert into buyins (game_id, member_id, amount_cents, chips) values ('30000000-0000-0000-0000-000000000000','20000000-0000-0000-0000-00000000000c',5000,100);
  select begin_reconciliation('30000000-0000-0000-0000-000000000000');
  select record_cashout('30000000-0000-0000-0000-000000000000','20000000-0000-0000-0000-00000000000b',300)$$, 'resume, add Cal buy-in, recount Ben');
-- nets now: Ann -50, Ben +100, Cal -50. Ann already paid Ben 50.
select pg_temp.as_(:A, $$select settle_game('30000000-0000-0000-0000-000000000000', '[{"from":"20000000-0000-0000-0000-00000000000a","to":"20000000-0000-0000-0000-00000000000b","amount":5000},{"from":"20000000-0000-0000-0000-00000000000c","to":"20000000-0000-0000-0000-00000000000b","amount":5000}]')$$, 're-settle ignoring confirmed -> refuse');
select pg_temp.as_(:A, $$select settle_game('30000000-0000-0000-0000-000000000000', '[{"from":"20000000-0000-0000-0000-00000000000c","to":"20000000-0000-0000-0000-00000000000b","amount":5000}]')$$, 're-settle residual');
select pg_temp.as_(:A, $$update settlements set status='pending' where status='confirmed'$$, 'reopen confirmed row -> refuse/no-op');
select * from r order by n;
select status, settled_at is not null as has_settled_at from games;
select f.display_name payer, t.display_name payee, amount_cents, s.status from settlements s join group_members f on f.id=from_member_id join group_members t on t.id=to_member_id order by s.created_at;
select field, old_value, new_value from game_edits;
rollback;
