-- log_mcp_call() was executable by anon.
--
-- The proof script for 20261005000000 caught it: `set role anon; select
-- log_mcp_call(...)` succeeded. It was harmless in effect — the function
-- returns at once when auth.uid() is null, so nothing was written — but the
-- 2026-09-17 rule is that a new function starts closed and is opened by an
-- explicit grant, and this one did not start closed.
--
-- The default-privilege revoke from that audit is scoped to functions created
-- by role postgres, and the SQL editor does not necessarily create them as
-- that role. So do not rely on the default: revoke by name, and grant to
-- exactly who should have it.

revoke execute on function public.log_mcp_call(text, boolean, integer)
  from public, anon;
grant execute on function public.log_mcp_call(text, boolean, integer)
  to authenticated;
