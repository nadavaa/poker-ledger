-- Proof for 20261006000000_mcp_write_support.sql.
--
-- Run in the SQL editor with "Run without RLS" (as postgres). One
-- transaction, ending in ROLLBACK. Read the last table: row 0 is the
-- summary, failures sort to the top.

begin;

create temp table w_results (n serial, test text, expect text, got text, pass boolean) on commit drop;
-- The script records results while it is impersonating a role, so that role
-- has to be allowed to write them. (The temp table, and nothing real.)
grant all on w_results to authenticated, anon, service_role;
grant usage, select on sequence w_results_n_seq to authenticated, anon, service_role;

do $$
declare
  uid_a uuid;
  uid_b uuid;
  r boolean;
  n int;
  got text;
  c record;
  before_c record;
  b_before record;
  before_read int;
begin
  select id into uid_a from public.profiles order by created_at limit 1;
  select id into uid_b from public.profiles where id <> uid_a order by created_at limit 1;

  -- ---- single use
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', uid_a, 'role', 'authenticated')::text, true);
  r := public.mcp_consume_confirmation('token-aaaa-1111', now() + interval '5 minutes');
  insert into w_results (test, expect, got, pass) values ('first use of a token is accepted', 'true', r::text, r);

  r := public.mcp_consume_confirmation('token-aaaa-1111', now() + interval '5 minutes');
  insert into w_results (test, expect, got, pass) values ('second use of the same token is refused', 'false', r::text, not r);

  r := public.mcp_consume_confirmation('token-aaaa-2222', now() + interval '5 minutes');
  insert into w_results (test, expect, got, pass) values ('a different token is accepted', 'true', r::text, r);

  r := public.mcp_consume_confirmation('token-aaaa-3333', now() - interval '1 second');
  insert into w_results (test, expect, got, pass) values ('an already-expired token is refused', 'false', r::text, not r);

  r := public.mcp_consume_confirmation('x', now() + interval '5 minutes');
  insert into w_results (test, expect, got, pass) values ('a malformed token id is refused, not raised', 'false', r::text, not r);
  reset role;

  -- ---- a token used by one user does not burn another user's
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', uid_b, 'role', 'authenticated')::text, true);
  r := public.mcp_consume_confirmation('token-aaaa-1111', now() + interval '5 minutes');
  reset role;
  insert into w_results (test, expect, got, pass) values ('use is per user', 'true', r::text, r);

  -- ---- table is closed
  begin
    set local role authenticated;
    perform set_config('request.jwt.claims', json_build_object('sub', uid_a, 'role', 'authenticated')::text, true);
    perform count(*) from public.mcp_used_confirmations;
    got := 'ALLOWED';
  exception when others then got := 'denied: ' || sqlstate;
  end;
  reset role;
  insert into w_results (test, expect, got, pass) values ('user cannot read used confirmations', 'denied', got, got like 'denied%');

  begin
    set local role authenticated;
    perform set_config('request.jwt.claims', json_build_object('sub', uid_a, 'role', 'authenticated')::text, true);
    delete from public.mcp_used_confirmations;
    got := 'ALLOWED';
  exception when others then got := 'denied: ' || sqlstate;
  end;
  reset role;
  insert into w_results (test, expect, got, pass) values ('user cannot delete used confirmations', 'denied', got, got like 'denied%');

  -- ---- anon cannot call any of the new functions
  begin
    set local role anon;
    perform public.mcp_consume_confirmation('token-anon-0001', now() + interval '5 minutes');
    got := 'ALLOWED';
  exception when others then got := 'denied: ' || sqlstate;
  end;
  reset role;
  insert into w_results (test, expect, got, pass) values ('anon cannot consume', 'denied', got, got like 'denied%');

  begin
    set local role anon;
    perform * from public.mcp_rate_counts();
    got := 'ALLOWED';
  exception when others then got := 'denied: ' || sqlstate;
  end;
  reset role;
  insert into w_results (test, expect, got, pass) values ('anon cannot read rate counts', 'denied', got, got like 'denied%');

  begin
    set local role anon;
    perform public.log_mcp_call('list_my_groups', true, 1, 'read');
    got := 'ALLOWED';
  exception when others then got := 'denied: ' || sqlstate;
  end;
  reset role;
  insert into w_results (test, expect, got, pass) values ('anon cannot log', 'denied', got, got like 'denied%');

  -- ---- the log carries a phase, and the old three-argument call still works
  -- Measured as a change, with a tool name nobody uses, so real usage already
  -- in the table (this user's own connector calls) cannot skew it.
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', uid_a, 'role', 'authenticated')::text, true);
  select * into before_c from public.mcp_rate_counts();
  reset role;
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', uid_b, 'role', 'authenticated')::text, true);
  select * into b_before from public.mcp_rate_counts();
  reset role;
  select count(*) into before_read from public.mcp_tool_calls
   where profile_id = uid_a and tool = 'zz_proof_read' and phase = 'read';

  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', uid_a, 'role', 'authenticated')::text, true);
  perform public.log_mcp_call('zz_proof_write', true, 5, 'preview');
  perform public.log_mcp_call('zz_proof_write', true, 5, 'commit');
  perform public.log_mcp_call('zz_proof_write', true, 5, 'commit');
  perform public.log_mcp_call('zz_proof_read', true, 5);
  perform public.log_mcp_call('zz_proof_read', true, 5, 'nonsense');
  select * into c from public.mcp_rate_counts();
  reset role;

  insert into w_results (test, expect, got, pass)
  values ('rate counts: two more commits', '+2', '+' || (c.commits - before_c.commits), c.commits - before_c.commits = 2);
  insert into w_results (test, expect, got, pass)
  values ('rate counts: one more preview', '+1', '+' || (c.previews - before_c.previews), c.previews - before_c.previews = 1);

  select count(*) - before_read into n from public.mcp_tool_calls
   where profile_id = uid_a and tool = 'zz_proof_read' and phase = 'read';
  insert into w_results (test, expect, got, pass)
  values ('a 3-argument call and an unknown phase both log as read', '+2', '+' || n, n = 2);

  -- ---- the rate counts are the caller's own
  -- uid_b's counts, read now, must be exactly what they were before uid_a
  -- logged anything above.
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', uid_b, 'role', 'authenticated')::text, true);
  select * into c from public.mcp_rate_counts();
  reset role;
  insert into w_results (test, expect, got, pass)
  values ('another user''s counts did not move when this user logged',
          b_before.commits || '/' || b_before.previews,
          c.commits || '/' || c.previews,
          c.commits = b_before.commits and c.previews = b_before.previews);

  -- ---- nobody else can read the log
  begin
    set local role authenticated;
    perform set_config('request.jwt.claims', json_build_object('sub', uid_a, 'role', 'authenticated')::text, true);
    perform count(*) from public.mcp_tool_calls;
    got := 'ALLOWED';
  exception when others then got := 'denied: ' || sqlstate;
  end;
  reset role;
  insert into w_results (test, expect, got, pass) values ('user still cannot read the call log', 'denied', got, got like 'denied%');
end $$;

select 0 as n, 'SUMMARY' as test,
       count(*) filter (where not pass) || ' failed of ' || count(*) as expect,
       case when bool_and(pass) then 'ALL PASS' else 'FAILURES' end as got,
       bool_and(pass) as pass
from w_results
union all
select n, test, expect, got, pass from w_results
order by pass, n;

rollback;
