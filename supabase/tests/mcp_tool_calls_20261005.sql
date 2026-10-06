-- Proof for 20261005000000_mcp_tool_calls.sql.
--
-- Run in the SQL editor with "Run without RLS" (as postgres): the script
-- impersonates users itself via request.jwt.claims, which needs SET ROLE.
-- One transaction, ending in ROLLBACK: nothing is left behind.
--
-- Read the last table: row 0 is the summary, failures sort to the top.

begin;

create temp table mcp_results (n serial, test text, expect text, got text, pass boolean) on commit drop;

do $$
declare
  uid_a uuid;
  uid_b uuid;
  n int;
  got text;
begin
  select id into uid_a from public.profiles order by created_at limit 1;
  select id into uid_b from public.profiles where id <> uid_a order by created_at limit 1;

  -- 1. A signed-in user can log a call, and it is stamped with THEIR id.
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', uid_a, 'role', 'authenticated')::text, true);
  perform public.log_mcp_call('list_my_groups', true, 42);
  reset role;
  select count(*) into n from public.mcp_tool_calls
   where profile_id = uid_a and tool = 'list_my_groups' and latency_ms = 42;
  insert into mcp_results (test, expect, got, pass)
  values ('user logs a call, stamped with own id', '1', n::text, n = 1);

  -- 2. There is no way to log as somebody else: the function takes no id.
  select count(*) into n from public.mcp_tool_calls where profile_id = uid_b;
  insert into mcp_results (test, expect, got, pass)
  values ('nothing recorded for another user', '0', n::text, n = 0);

  -- 3. A user cannot read the table, their own rows included.
  begin
    set local role authenticated;
    perform set_config('request.jwt.claims',
      json_build_object('sub', uid_a, 'role', 'authenticated')::text, true);
    perform count(*) from public.mcp_tool_calls;
    got := 'ALLOWED';
  exception when others then got := 'denied: ' || sqlstate;
  end;
  reset role;
  insert into mcp_results (test, expect, got, pass)
  values ('user cannot select from the table', 'denied', got, got like 'denied%');

  -- 4. A user cannot insert directly, skipping the function.
  begin
    set local role authenticated;
    perform set_config('request.jwt.claims',
      json_build_object('sub', uid_a, 'role', 'authenticated')::text, true);
    insert into public.mcp_tool_calls (profile_id, tool, ok, latency_ms)
    values (uid_a, 'x', true, 1);
    got := 'ALLOWED';
  exception when others then got := 'denied: ' || sqlstate;
  end;
  reset role;
  insert into mcp_results (test, expect, got, pass)
  values ('user cannot insert directly', 'denied', got, got like 'denied%');

  -- 5. Anonymous callers cannot reach the function at all.
  begin
    set local role anon;
    perform public.log_mcp_call('list_my_groups', true, 1);
    got := 'ALLOWED';
  exception when others then got := 'denied: ' || sqlstate;
  end;
  reset role;
  insert into mcp_results (test, expect, got, pass)
  values ('anon cannot call log_mcp_call', 'denied', got, got like 'denied%');

  -- 6. A junk tool name is dropped silently, never raised and never stored.
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', uid_a, 'role', 'authenticated')::text, true);
  perform public.log_mcp_call('DROP TABLE; --', true, 1);
  reset role;
  select count(*) into n from public.mcp_tool_calls where tool like '%DROP%';
  insert into mcp_results (test, expect, got, pass)
  values ('malformed tool name is dropped', '0', n::text, n = 0);

  -- 7. The service role can read it (for analytics).
  begin
    set local role service_role;
    perform count(*) from public.mcp_tool_calls;
    got := 'ok';
  exception when others then got := 'denied: ' || sqlstate;
  end;
  reset role;
  insert into mcp_results (test, expect, got, pass)
  values ('service role can read', 'ok', got, got = 'ok');
end $$;

select 0 as n, 'SUMMARY' as test,
       count(*) filter (where not pass) || ' failed of ' || count(*) as expect,
       case when bool_and(pass) then 'ALL PASS' else 'FAILURES' end as got,
       bool_and(pass) as pass
from mcp_results
union all
select n, test, expect, got, pass from mcp_results
order by pass, n;

rollback;
