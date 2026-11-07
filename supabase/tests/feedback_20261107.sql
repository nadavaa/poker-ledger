-- Proof for 20261107000000_feedback.sql.
--
-- Run in the SQL editor with "Run without RLS" (as postgres), after the
-- migration: the script impersonates users itself via request.jwt.claims,
-- which needs SET ROLE. One transaction, ending in ROLLBACK: nothing persists.
--
-- Read the last table: row 0 is the summary, failures sort to the top.

begin;

create temp table fb_results (n serial, test text, expect text, got text, pass boolean) on commit drop;

do $$
declare
  uid_a uuid;
  uid_b uuid;
  n int;
  got text;
begin
  select id into uid_a from public.profiles order by created_at limit 1;
  select id into uid_b from public.profiles where id <> uid_a order by created_at limit 1;

  -- 1. A signed-in user can send feedback, stamped with THEIR id.
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', uid_a, 'role', 'authenticated')::text, true);
  insert into public.feedback (kind, message, page_path, user_agent)
  values ('bug', 'proof row', '/settings', 'proof');
  reset role;
  select count(*) into n from public.feedback where profile_id = uid_a and message = 'proof row';
  insert into fb_results (test, expect, got, pass)
  values ('user sends feedback, stamped with own id', '1', n::text, n = 1);

  -- 2. A user cannot send as somebody else.
  begin
    set local role authenticated;
    perform set_config('request.jwt.claims',
      json_build_object('sub', uid_a, 'role', 'authenticated')::text, true);
    insert into public.feedback (profile_id, kind, message) values (uid_b, 'idea', 'spoof');
    got := 'ALLOWED';
  exception when others then got := 'denied: ' || sqlstate;
  end;
  reset role;
  insert into fb_results (test, expect, got, pass)
  values ('user cannot set profile_id', 'denied', got, got like 'denied%');

  -- 3. A user cannot read feedback, their own included.
  begin
    set local role authenticated;
    perform set_config('request.jwt.claims',
      json_build_object('sub', uid_a, 'role', 'authenticated')::text, true);
    perform count(*) from public.feedback;
    got := 'ALLOWED';
  exception when others then got := 'denied: ' || sqlstate;
  end;
  reset role;
  insert into fb_results (test, expect, got, pass)
  values ('user cannot read feedback', 'denied', got, got like 'denied%');

  -- 4. Signed-out visitors cannot send.
  begin
    set local role anon;
    perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
    insert into public.feedback (kind, message) values ('idea', 'anon');
    got := 'ALLOWED';
  exception when others then got := 'denied: ' || sqlstate;
  end;
  reset role;
  insert into fb_results (test, expect, got, pass)
  values ('anon cannot send feedback', 'denied', got, got like 'denied%');

  -- 5. Users cannot edit or delete feedback.
  insert into fb_results (test, expect, got)
  values ('authenticated has no update', 'false',
          has_table_privilege('authenticated', 'public.feedback', 'update')::text),
         ('authenticated has no delete', 'false',
          has_table_privilege('authenticated', 'public.feedback', 'delete')::text);

  -- 6. Empty and oversized messages and unknown kinds are rejected.
  begin
    insert into public.feedback (profile_id, kind, message) values (uid_a, 'bug', '   ');
    got := 'ALLOWED';
  exception when others then got := 'denied: ' || sqlstate;
  end;
  insert into fb_results (test, expect, got, pass)
  values ('blank message rejected', 'denied', got, got like 'denied%');
  begin
    insert into public.feedback (profile_id, kind, message) values (uid_a, 'bug', repeat('x', 2001));
    got := 'ALLOWED';
  exception when others then got := 'denied: ' || sqlstate;
  end;
  insert into fb_results (test, expect, got, pass)
  values ('2001-char message rejected', 'denied', got, got like 'denied%');
  begin
    insert into public.feedback (profile_id, kind, message) values (uid_a, 'rant', 'x');
    got := 'ALLOWED';
  exception when others then got := 'denied: ' || sqlstate;
  end;
  insert into fb_results (test, expect, got, pass)
  values ('unknown kind rejected', 'denied', got, got like 'denied%');

  -- 7. The 21st in a day is refused (1 sent above, 19 more, then one over).
  insert into public.feedback (profile_id, kind, message)
  select uid_a, 'idea', 'bulk ' || g from generate_series(1, 19) g;
  begin
    insert into public.feedback (profile_id, kind, message) values (uid_a, 'idea', 'one too many');
    got := 'ALLOWED';
  exception when others then got := 'denied: ' || sqlstate;
  end;
  insert into fb_results (test, expect, got, pass)
  values ('21st in a day refused', 'denied', got, got like 'denied%');

  -- 8. The service role can read it (what /admin uses).
  begin
    set local role service_role;
    perform count(*) from public.feedback;
    got := 'ok';
  exception when others then got := 'denied: ' || sqlstate;
  end;
  reset role;
  insert into fb_results (test, expect, got, pass)
  values ('service role can read', 'ok', got, got = 'ok');
end $$;

update fb_results set pass = (expect = got) where pass is null;

select 0 as n, 'SUMMARY' as test,
       count(*) filter (where not pass) || ' failed of ' || count(*) as expect,
       case when bool_and(pass) then 'ALL PASS' else 'FAILURES' end as got,
       bool_and(pass) as pass
from fb_results
union all
select n, test, expect, got, pass from fb_results
order by pass, n;

rollback;
