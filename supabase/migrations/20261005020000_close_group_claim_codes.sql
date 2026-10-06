-- group_claim_codes() was executable by anon.
--
-- Found by listing every public function anon can execute, after the same
-- gap turned up on log_mcp_call. It was created inside the 2026-09-17
-- hardening migration, after that migration's blanket revoke, so it kept the
-- default grant. The default-privilege revoke there only covers functions
-- created by role postgres.
--
-- Nothing was readable: the function returns rows only when
-- is_group_owner_or_admin() is true, and that compares against auth.uid(),
-- which is null for anon. But a claim code is a working key to an identity,
-- and the function that hands them out should not be callable by the
-- anonymous role at all.

revoke execute on function public.group_claim_codes(uuid) from public, anon;
grant execute on function public.group_claim_codes(uuid) to authenticated;
