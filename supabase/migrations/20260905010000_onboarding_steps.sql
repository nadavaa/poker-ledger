-- Onboarding recorded one timestamp, set whether you finished or skipped, and
-- nothing about where you got to. So the two questions worth asking of a
-- setup flow — do people finish it, and where do they give up — could not be
-- answered at all.
--
-- One append-only row per step per action. No read policy: this is analytics,
-- not something any screen shows back to the person.

create table if not exists public.onboarding_events (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  step text not null check (step in ('name', 'pay', 'photo')),
  action text not null check (action in ('viewed', 'saved', 'skipped')),
  created_at timestamptz not null default now()
);
create index if not exists onboarding_events_profile_idx
  on public.onboarding_events (profile_id, created_at);

alter table public.onboarding_events enable row level security;

create or replace function public.log_onboarding(p_step text, p_action text)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    return;
  end if;
  -- Viewing a step twice — going back, or a reload — is one view, not two.
  if p_action = 'viewed' and exists (
    select 1 from public.onboarding_events
    where profile_id = (select auth.uid())
      and step = p_step and action = 'viewed'
  ) then
    return;
  end if;
  insert into public.onboarding_events (profile_id, step, action)
  values ((select auth.uid()), p_step, p_action);
end;
$$;

revoke execute on function public.log_onboarding(text, text) from anon;

-- Per step: how many saw it, how many put something in, how many pressed
-- Skip, and how many were last seen there and never came back.
create or replace function public.admin_onboarding()
returns table (
  step text,
  viewed int,
  saved int,
  skipped int,
  dropped int
)
language sql security definer stable set search_path = ''
as $$
  with steps as (
    select unnest(array['name', 'pay', 'photo']) s
  ),
  -- The furthest step each person reached, for the ones who never finished.
  last_seen as (
    select e.profile_id,
      (array_agg(e.step order by e.created_at desc))[1] s
    from public.onboarding_events e
    where e.action = 'viewed'
    group by e.profile_id
  ),
  abandoned as (
    select l.s, count(*)::int n
    from last_seen l
    join public.profiles p on p.id = l.profile_id
    where p.onboarding_completed_at is null
    group by l.s
  )
  select
    steps.s,
    (select count(distinct profile_id)::int from public.onboarding_events e
      where e.step = steps.s and e.action = 'viewed'),
    (select count(distinct profile_id)::int from public.onboarding_events e
      where e.step = steps.s and e.action = 'saved'),
    (select count(distinct profile_id)::int from public.onboarding_events e
      where e.step = steps.s and e.action = 'skipped'),
    coalesce((select n from abandoned where abandoned.s = steps.s), 0)
  from steps;
$$;

revoke execute on function public.admin_onboarding() from anon, authenticated;

-- Finishing and finishing with something in the boxes are different results.
-- Somebody who pressed Skip three times completed the flow and still cannot
-- be paid, which is the failure the funnel exists to catch.
create or replace function public.admin_onboarding_totals()
returns jsonb
language sql security definer stable set search_path = ''
as $$
  with started as (
    select distinct profile_id from public.onboarding_events
  )
  select jsonb_build_object(
    'started', (select count(*)::int from started),
    'completed', (
      select count(*)::int from started s
      join public.profiles p on p.id = s.profile_id
      where p.onboarding_completed_at is not null
    ),
    'completed_with_input', (
      select count(*)::int from started s
      join public.profiles p on p.id = s.profile_id
      where p.onboarding_completed_at is not null
        and exists (
          select 1 from public.onboarding_events e
          where e.profile_id = s.profile_id and e.action = 'saved'
        )
    ),
    'skipped_everything', (
      select count(*)::int from started s
      join public.profiles p on p.id = s.profile_id
      where p.onboarding_completed_at is not null
        and not exists (
          select 1 from public.onboarding_events e
          where e.profile_id = s.profile_id and e.action = 'saved'
        )
    ),
    'abandoned', (
      select count(*)::int from started s
      join public.profiles p on p.id = s.profile_id
      where p.onboarding_completed_at is null
    )
  );
$$;

revoke execute on function public.admin_onboarding_totals() from anon, authenticated;
