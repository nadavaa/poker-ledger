-- One row per MCP tool call, so adoption of the AI connector can be measured.
--
-- Deliberately thin: who, which tool, did it work, how long, when. No
-- arguments, no amounts, no error text — the log must never be a second copy
-- of anyone's money.
--
-- Written by the signed-in user through log_mcp_call(), never by the service
-- role: the MCP code path does not hold that key. Read by the service role
-- alone (a future /admin panel), so no client can read anybody's usage,
-- including their own.

create table public.mcp_tool_calls (
  id          bigint generated always as identity primary key,
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  tool        text not null check (tool ~ '^[a-z_]{1,64}$'),
  ok          boolean not null,
  latency_ms  integer not null check (latency_ms >= 0),
  created_at  timestamptz not null default now()
);

create index mcp_tool_calls_created_at on public.mcp_tool_calls (created_at desc);
create index mcp_tool_calls_profile on public.mcp_tool_calls (profile_id, created_at desc);

-- RLS on and no policies: nothing a client sends can read or write the table
-- directly. The privileges are revoked as well, because a privilege is
-- checked before a policy and "no policy" is a weaker statement than "no
-- grant".
alter table public.mcp_tool_calls enable row level security;
revoke all on public.mcp_tool_calls from public, anon, authenticated;
grant select on public.mcp_tool_calls to service_role;

create or replace function public.log_mcp_call(
  p_tool text,
  p_ok boolean,
  p_latency_ms integer
) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    return;
  end if;
  -- A malformed name is dropped rather than raised: logging must never be
  -- the reason a tool call fails.
  if p_tool is null or p_tool !~ '^[a-z_]{1,64}$' then
    return;
  end if;
  insert into public.mcp_tool_calls (profile_id, tool, ok, latency_ms)
  values (
    (select auth.uid()),
    p_tool,
    coalesce(p_ok, false),
    greatest(coalesce(p_latency_ms, 0), 0)
  );
end;
$$;

-- New functions start closed; this one is for a signed-in user to call.
grant execute on function public.log_mcp_call(text, boolean, integer) to authenticated;
