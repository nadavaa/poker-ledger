-- Support for the agent write tools (phase 2): single-use confirmations, a
-- phase on the call log, and the counts a rate limit needs.
--
-- Every function here is revoked from public and anon by name and granted to
-- authenticated by name. The 2026-09-17 default-privilege revoke does not
-- cover functions created through the SQL editor, so nothing in this file
-- relies on it.

-- ============ 1. Single-use confirmations ============
-- A confirmation token is signed and checked in the app (user, tool, exact
-- arguments, expiry). The one thing a signature cannot do is stop it being
-- used twice, so that is what this table is for: the second insert of the
-- same token id for the same user finds the row and says no.

create table public.mcp_used_confirmations (
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  jti         text not null check (length(jti) between 8 and 64),
  expires_at  timestamptz not null,
  used_at     timestamptz not null default now(),
  primary key (profile_id, jti)
);

create index mcp_used_confirmations_expires on public.mcp_used_confirmations (expires_at);

alter table public.mcp_used_confirmations enable row level security;
revoke all on public.mcp_used_confirmations from public, anon, authenticated;
grant select on public.mcp_used_confirmations to service_role;

-- True exactly once per (user, token id). False if it was used before or has
-- already expired.
create or replace function public.mcp_consume_confirmation(
  p_jti text,
  p_expires_at timestamptz
) returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  n integer;
begin
  if (select auth.uid()) is null then
    return false;
  end if;
  if p_jti is null or length(p_jti) not between 8 and 64
     or p_expires_at is null or p_expires_at <= now() then
    return false;
  end if;

  -- Tokens live minutes; a day-old row has nothing left to protect.
  delete from public.mcp_used_confirmations where expires_at < now() - interval '1 day';

  insert into public.mcp_used_confirmations (profile_id, jti, expires_at)
  values ((select auth.uid()), p_jti, p_expires_at)
  on conflict do nothing;
  get diagnostics n = row_count;
  return n = 1;
end;
$$;

revoke execute on function public.mcp_consume_confirmation(text, timestamptz) from public, anon;
grant execute on function public.mcp_consume_confirmation(text, timestamptz) to authenticated;

-- ============ 2. The call log learns what kind of call it was ============

alter table public.mcp_tool_calls
  add column phase text not null default 'read'
    check (phase in ('read', 'preview', 'commit'));

-- The signature changes, so the old function goes. Callers that still pass
-- three named arguments resolve to this one through the default.
drop function public.log_mcp_call(text, boolean, integer);

create or replace function public.log_mcp_call(
  p_tool text,
  p_ok boolean,
  p_latency_ms integer,
  p_phase text default 'read'
) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    return;
  end if;
  if p_tool is null or p_tool !~ '^[a-z_]{1,64}$' then
    return;
  end if;
  insert into public.mcp_tool_calls (profile_id, tool, ok, latency_ms, phase)
  values (
    (select auth.uid()),
    p_tool,
    coalesce(p_ok, false),
    greatest(coalesce(p_latency_ms, 0), 0),
    case when p_phase in ('read', 'preview', 'commit') then p_phase else 'read' end
  );
end;
$$;

revoke execute on function public.log_mcp_call(text, boolean, integer, text) from public, anon;
grant execute on function public.log_mcp_call(text, boolean, integer, text) to authenticated;

-- ============ 3. What a rate limit needs to know ============
-- The caller's own recent attempts, counted whether they worked or not: a
-- loop that keeps failing is still a loop. The numbers and the decision live
-- in the app (lib/mcp/limits.ts); this only counts.

create or replace function public.mcp_rate_counts()
returns table (commits integer, previews integer)
language sql security definer stable set search_path = ''
as $$
  select
    count(*) filter (where phase = 'commit')::integer,
    count(*) filter (where phase = 'preview')::integer
  from public.mcp_tool_calls
  where profile_id = (select auth.uid())
    and created_at > now() - interval '10 minutes'
$$;

revoke execute on function public.mcp_rate_counts() from public, anon;
grant execute on function public.mcp_rate_counts() to authenticated;
