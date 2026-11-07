-- Proof for 20261106000000_admin_tracking.sql.
--
-- Run in the SQL editor with "Run without RLS" (as postgres), after the
-- migration. One transaction, ending in ROLLBACK: nothing persists.
--
-- Read the last table: failures sort to the top.

begin;

create temp table t_results (n serial, test text, expect text, got text, pass boolean) on commit drop;

-- 1. Who can call what.
insert into t_results (test, expect, got)
select x.test, x.expect, x.got from (values
  ('authenticated cannot read users list', 'false',
    has_function_privilege('authenticated', 'public.admin_users_detail(uuid)', 'execute')::text),
  ('anon cannot read users list', 'false',
    has_function_privilege('anon', 'public.admin_users_detail(uuid)', 'execute')::text),
  ('service_role can read users list', 'true',
    has_function_privilege('service_role', 'public.admin_users_detail(uuid)', 'execute')::text),
  ('authenticated cannot read groups list', 'false',
    has_function_privilege('authenticated', 'public.admin_groups_detail(uuid)', 'execute')::text),
  ('service_role can read groups list', 'true',
    has_function_privilege('service_role', 'public.admin_groups_detail(uuid)', 'execute')::text),
  ('authenticated can record own source', 'true',
    has_function_privilege('authenticated', 'public.record_signup_source(text)', 'execute')::text),
  ('anon cannot record a source', 'false',
    has_function_privilege('anon', 'public.record_signup_source(text)', 'execute')::text),
  ('client cannot write signup_source directly', 'false',
    has_column_privilege('authenticated', 'public.profiles', 'signup_source', 'update')::text)
) as x(test, expect, got);

-- 2. An existing account signing in again records nothing.
do $$
declare uid uuid; before text; after text;
begin
  select id, signup_source into uid, before
    from public.profiles where created_at < now() - interval '2 days'
   order by created_at limit 1;
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform public.record_signup_source('ref:proof');
  reset role;
  select signup_source into after from public.profiles where id = uid;
  insert into t_results (test, expect, got)
  values ('old account is not stamped', coalesce(before, 'null'), coalesce(after, 'null'));
end $$;

-- 3. The lists return every profile and every group, with nothing private.
insert into t_results (test, expect, got)
values
  ('users list covers every profile',
    (select count(*) from public.profiles)::text,
    (select count(*) from public.admin_users_detail(gen_random_uuid()))::text),
  ('groups list covers every group',
    (select count(*) from public.groups)::text,
    (select count(*) from public.admin_groups_detail(gen_random_uuid()))::text),
  ('unknown owner: every group is outside',
    (select count(*) from public.groups)::text,
    (select count(*) from public.admin_groups_detail(gen_random_uuid()) where outside)::text),
  ('users list has no email, phone or handle columns', '0',
    (select count(*) from information_schema.routines r
       join information_schema.parameters p using (specific_schema, specific_name)
      where r.routine_name = 'admin_users_detail' and p.parameter_mode = 'OUT'
        and p.parameter_name ~ '(email|phone|venmo|handle|zelle)')::text);

update t_results set pass = (expect = got);

select n, test, expect, got, pass from t_results order by pass, n;

rollback;
