-- Feedback and bug reports from players.
--
-- Write-only for players: a signed-in user can add feedback as themselves and
-- nothing else. Nobody but the service role (behind the OWNER_USER_ID gate on
-- /admin) can read it, the author included. The author is stamped from the
-- session, never from the request: profile_id has no insert privilege, so it
-- always takes its default, and the policy checks it anyway.

create table public.feedback (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null default auth.uid()
    references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('idea', 'bug')),
  message text not null check (char_length(btrim(message)) between 1 and 2000),
  -- Where the sheet was opened, and the browser, so a bug can be reproduced.
  page_path text check (page_path is null or char_length(page_path) <= 200),
  user_agent text check (user_agent is null or char_length(user_agent) <= 400),
  created_at timestamptz not null default now()
);

create index feedback_created_at_idx on public.feedback (created_at desc);

alter table public.feedback enable row level security;

-- Supabase grants every new table to anon and authenticated by default. Take
-- that back, then grant exactly the insert columns a player may set.
revoke all on public.feedback from public, anon, authenticated;
grant insert (kind, message, page_path, user_agent) on public.feedback to authenticated;
grant select, delete on public.feedback to service_role;

create policy feedback_insert_own on public.feedback
  for insert to authenticated
  with check (profile_id = (select auth.uid()));

-- A flood guard, not a product rule: 20 per person per day is far above any
-- honest use and stops a script from filling the table.
create or replace function public.feedback_rate_limit()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if (
    select count(*) from public.feedback
    where profile_id = new.profile_id
      and created_at > now() - interval '1 day'
  ) >= 20 then
    raise exception 'feedback limit reached' using errcode = 'P0001';
  end if;
  return new;
end
$$;

revoke all on function public.feedback_rate_limit() from public, anon, authenticated;

create trigger feedback_rate_limit
  before insert on public.feedback
  for each row execute function public.feedback_rate_limit();
