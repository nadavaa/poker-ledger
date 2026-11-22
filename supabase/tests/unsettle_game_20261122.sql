-- Proof for 20261122000000_unsettle_game.sql. Paste into the Supabase SQL
-- editor AFTER applying the migration. Builds its own throwaway users, group
-- and game inside one transaction that ends in ROLLBACK, so nothing persists.
-- Read the final table: every row must show pass = true.

begin;
create temp table r (n serial, test text, got text) on commit drop;
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
insert into game_signups (game_id, member_id) select '30000000-0000-0000-0000-000000000000', id from group_members
  where group_id = '10000000-0000-0000-0000-000000000000';

select pg_temp.as_('00000000-0000-0000-0000-00000000000a', $$select start_game('30000000-0000-0000-0000-000000000000', array['20000000-0000-0000-0000-00000000000a','20000000-0000-0000-0000-00000000000b','20000000-0000-0000-0000-00000000000c']::uuid[])$$, 'start game');
select pg_temp.as_('00000000-0000-0000-0000-00000000000a', $$select begin_reconciliation('30000000-0000-0000-0000-000000000000')$$, 'end game');
select pg_temp.as_('00000000-0000-0000-0000-00000000000a', $$select record_cashout('30000000-0000-0000-0000-000000000000','20000000-0000-0000-0000-00000000000a',0);
  select record_cashout('30000000-0000-0000-0000-000000000000','20000000-0000-0000-0000-00000000000b',200);
  select record_cashout('30000000-0000-0000-0000-000000000000','20000000-0000-0000-0000-00000000000c',100)$$, 'count chips');
-- Ann -50, Ben +50, Cal 0
select pg_temp.as_('00000000-0000-0000-0000-00000000000a', $$select settle_game('30000000-0000-0000-0000-000000000000', '[{"from":"20000000-0000-0000-0000-00000000000a","to":"20000000-0000-0000-0000-00000000000b","amount":5000}]')$$, 'settle #1');
select pg_temp.as_('00000000-0000-0000-0000-00000000000a', $$select unsettle_game('30000000-0000-0000-0000-000000000000', '  ')$$, 'unsettle w/o reason -> refuse');
select pg_temp.as_('00000000-0000-0000-0000-00000000000b', $$select unsettle_game('30000000-0000-0000-0000-000000000000', 'x')$$, 'unsettle by non-admin -> refuse');
select pg_temp.as_('00000000-0000-0000-0000-00000000000a', $$update settlements set status='paid' where game_id='30000000-0000-0000-0000-000000000000'$$, 'Ann marks paid');
select pg_temp.as_('00000000-0000-0000-0000-00000000000a', $$select unsettle_game('30000000-0000-0000-0000-000000000000', 'fix')$$, 'unsettle while paid -> refuse');
select pg_temp.as_('00000000-0000-0000-0000-00000000000b', $$update settlements set status='confirmed' where game_id='30000000-0000-0000-0000-000000000000'$$, 'Ben confirms');
select pg_temp.as_('00000000-0000-0000-0000-00000000000a', $$select unsettle_game('30000000-0000-0000-0000-000000000000', 'Cal rebuy was never logged')$$, 'unsettle');
select pg_temp.as_('00000000-0000-0000-0000-00000000000a', $$select unsettle_game('30000000-0000-0000-0000-000000000000', 'again')$$, 'unsettle twice -> refuse');
select pg_temp.as_('00000000-0000-0000-0000-00000000000a', $$select cancel_game('30000000-0000-0000-0000-000000000000')$$, 'cancel w/ confirmed -> refuse');
select pg_temp.as_('00000000-0000-0000-0000-00000000000a', $$select reopen_game('30000000-0000-0000-0000-000000000000');
  insert into buyins (game_id, member_id, amount_cents, chips) values ('30000000-0000-0000-0000-000000000000','20000000-0000-0000-0000-00000000000c',5000,100);
  select begin_reconciliation('30000000-0000-0000-0000-000000000000');
  select record_cashout('30000000-0000-0000-0000-000000000000','20000000-0000-0000-0000-00000000000b',300)$$, 'resume, add Cal buy-in, recount Ben');
-- nets now: Ann -50, Ben +100, Cal -50. Ann already paid Ben 50.
select pg_temp.as_('00000000-0000-0000-0000-00000000000a', $$select settle_game('30000000-0000-0000-0000-000000000000', '[{"from":"20000000-0000-0000-0000-00000000000a","to":"20000000-0000-0000-0000-00000000000b","amount":5000},{"from":"20000000-0000-0000-0000-00000000000c","to":"20000000-0000-0000-0000-00000000000b","amount":5000}]')$$, 're-settle ignoring confirmed -> refuse');
select pg_temp.as_('00000000-0000-0000-0000-00000000000a', $$select settle_game('30000000-0000-0000-0000-000000000000', '[{"from":"20000000-0000-0000-0000-00000000000c","to":"20000000-0000-0000-0000-00000000000b","amount":5000}]')$$, 're-settle residual');
select pg_temp.as_('00000000-0000-0000-0000-00000000000a', $$update settlements set status='pending' where status='confirmed'$$, 'reopen confirmed row -> refuse/no-op');
-- One table, so the SQL editor shows everything. Every row must say pass = true.
with expect(n, want) as (values
  (1,'ok'),(2,'ok'),(3,'ok'),(4,'ok'),
  (5,'ERR'),(6,'ERR'),(7,'ok'),(8,'ERR'),(9,'ok'),(10,'ok'),(11,'ERR'),(12,'ERR'),
  (13,'ok'),(14,'ERR'),(15,'ok'),(16,'ok')
), checks as (
  select r.n, r.test, r.got, r.got like e.want || '%' as pass from r join expect e using (n)
  union all
  select 100, 'game is settled again with settled_at', (select status::text from games where id = '30000000-0000-0000-0000-000000000000'),
    (select status = 'settled' and settled_at is not null from games where id = '30000000-0000-0000-0000-000000000000')
  union all
  select 101, 'Ann->Ben 50 kept confirmed', null,
    exists (select 1 from settlements where game_id = '30000000-0000-0000-0000-000000000000' and from_member_id = '20000000-0000-0000-0000-00000000000a' and to_member_id = '20000000-0000-0000-0000-00000000000b' and amount_cents = 5000 and status = 'confirmed')
  union all
  select 102, 'only new transfer is Cal->Ben 50 pending', null,
    (select count(*) = 1 from settlements where game_id = '30000000-0000-0000-0000-000000000000' and status = 'pending' and from_member_id = '20000000-0000-0000-0000-00000000000c' and to_member_id = '20000000-0000-0000-0000-00000000000b' and amount_cents = 5000)
    and (select count(*) = 2 from settlements where game_id = '30000000-0000-0000-0000-000000000000')
  union all
  select 103, 'unsettle reason logged', null,
    exists (select 1 from game_edits where game_id = '30000000-0000-0000-0000-000000000000' and field = 'unsettled' and new_value = 'Cal rebuy was never logged')
)
select * from checks order by n;
rollback;
