-- Owner-only analytics. Every function here reads across every group, so
-- execute is revoked from anon and authenticated outright: the only caller
-- that can reach them is the service role, used server-side behind the
-- OWNER_USER_ID gate. There is no role column and no owner row, so there is
-- nothing an RLS mistake or a compromised record could flip.

-- ============ Invite tracking ============
-- Clicks were not recorded anywhere, so the invite funnel could not be
-- measured. One append-only row per visit; no page can read it back.

create table if not exists public.invite_visits (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('group', 'game')),
  target_id uuid not null,
  profile_id uuid references public.profiles (id) on delete set null,
  outcome text not null,
  created_at timestamptz not null default now()
);
create index if not exists invite_visits_kind_created_idx
  on public.invite_visits (kind, created_at desc);

alter table public.invite_visits enable row level security;
-- No policies at all: nobody reads this through the API. The join routes
-- write through the definer function below.

create or replace function public.log_invite_visit(
  p_kind text,
  p_target_id uuid,
  p_outcome text
) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.invite_visits (kind, target_id, profile_id, outcome)
  values (p_kind, p_target_id, (select auth.uid()), p_outcome);
end;
$$;

revoke execute on function public.log_invite_visit(text, uuid, text) from anon;

-- ============ Who did something, and when ============
-- "Active" means produced an attributable event. last_sign_in_at is no use:
-- sessions persist for weeks, so it counts sign-ins rather than usage.

create or replace view public.admin_activity as
  select m.profile_id, b.created_at as at
    from public.buyins b
    join public.group_members m on m.id = b.created_by_member_id
   where m.profile_id is not null
  union all
  select m.profile_id, c.recorded_at
    from public.cashouts c
    join public.group_members m on m.id = c.recorded_by_member_id
   where m.profile_id is not null
  union all
  select m.profile_id, s.created_at
    from public.game_signups s
    join public.group_members m on m.id = s.member_id
   where m.profile_id is not null
  union all
  select m.profile_id, g.created_at
    from public.games g
    join public.group_members m on m.id = g.created_by_member_id
   where m.profile_id is not null
  union all
  select m.profile_id, t.confirmed_at
    from public.settlements t
    join public.group_members m on m.id = t.confirmed_by_member_id
   where m.profile_id is not null and t.confirmed_at is not null;

revoke all on public.admin_activity from anon, authenticated;

-- ============ The numbers ============

create or replace function public.admin_overview()
returns jsonb
language sql security definer stable set search_path = ''
as $$
with
users as (select count(*)::int n from public.profiles),
groups_n as (select count(*)::int n from public.groups),
played as (
  select count(*)::int n from public.games where started_at is not null
),
active as (
  select
    count(distinct profile_id) filter (where at > now() - interval '1 day')::int  d,
    count(distinct profile_id) filter (where at > now() - interval '7 days')::int  w,
    count(distinct profile_id) filter (where at > now() - interval '30 days')::int m
  from public.admin_activity
),
provider as (
  select
    count(*) filter (
      where u.raw_app_meta_data->>'provider' = 'google'
    )::int google,
    count(*) filter (
      where coalesce(u.raw_app_meta_data->>'provider', 'email') <> 'google'
    )::int magic_link
  from auth.users u
),
setup as (
  select
    count(*)::int total,
    count(*) filter (where onboarding_completed_at is not null)::int finished,
    count(*) filter (where venmo_handle is not null or phone_number is not null)::int payable,
    count(*) filter (where preferred_payment_method = 'venmo')::int venmo,
    count(*) filter (where preferred_payment_method = 'zelle')::int zelle,
    count(*) filter (where avatar_url is not null)::int photo
  from public.profiles
),
-- Per settled game: seats, buy-ins, voids, duration, discrepancy.
per_game as (
  select
    g.id,
    g.status,
    g.started_at,
    g.settled_at,
    (select count(*) from public.game_signups s
      where s.game_id = g.id and s.status = 'confirmed')::numeric seats,
    (select count(*) from public.buyins b
      where b.game_id = g.id and b.voided_at is null)::numeric buyins,
    (select count(*) from public.buyins b
      where b.game_id = g.id and b.voided_at is not null)::numeric voids,
    (select coalesce(sum(abs(a.amount_cents)), 0) from public.game_adjustments a
      where a.game_id = g.id)::numeric discrepancy,
    exists (select 1 from public.food_orders f where f.game_id = g.id) has_food
  from public.games g
  where g.started_at is not null
),
engagement as (
  select
    percentile_cont(0.5) within group (order by seats) median_players,
    percentile_cont(0.5) within group (
      order by extract(epoch from (settled_at - started_at)) / 60
    ) filter (where settled_at is not null) median_minutes,
    percentile_cont(0.5) within group (
      order by case when seats > 0 then buyins / seats end
    ) filter (where seats > 0) median_buyins_per_player,
    percentile_cont(0.5) within group (order by voids) median_voids,
    count(*) filter (where has_food)::int with_food,
    count(*)::int n,
    count(*) filter (where discrepancy > 0)::int needed_adjustment,
    percentile_cont(0.5) within group (order by discrepancy)
      filter (where discrepancy > 0) median_discrepancy,
    count(*) filter (
      where status in ('active', 'reconciling')
        and started_at < now() - interval '2 days'
    )::int abandoned,
    count(*) filter (where status = 'settled')::int settled
  from per_game
),
money as (
  select coalesce(sum(t.amount_cents), 0)::bigint cents
  from public.settlements t
  join public.games g on g.id = t.game_id
  where g.status = 'settled'
),
handshake as (
  select
    count(*)::int total,
    count(*) filter (where t.status = 'confirmed')::int confirmed,
    count(*) filter (
      where t.status <> 'confirmed' and t.created_at < now() - interval '7 days'
    )::int stale,
    percentile_cont(0.5) within group (
      order by extract(epoch from (t.confirmed_at - g.settled_at)) / 3600
    ) filter (where t.confirmed_at is not null and g.settled_at is not null)
      median_hours
  from public.settlements t
  join public.games g on g.id = t.game_id
),
handoffs as (
  select count(distinct game_id)::int n from public.game_admin_transfers
),
invites as (
  select
    count(*) filter (where kind = 'group' and outcome = 'view')::int group_clicks,
    count(*) filter (where kind = 'group' and outcome = 'joined')::int group_joins,
    count(*) filter (where kind = 'game')::int game_clicks,
    count(*) filter (
      where kind = 'game' and outcome in ('confirmed', 'waitlisted', 'needs_approval')
    )::int game_joins
  from public.invite_visits
),
-- Of the people who arrived through a link, how many went on to play.
invite_played as (
  select count(distinct v.profile_id)::int n
  from public.invite_visits v
  where v.profile_id is not null
    and exists (
      select 1
      from public.game_signups s
      join public.group_members m on m.id = s.member_id
      join public.games g on g.id = s.game_id
      where m.profile_id = v.profile_id
        and s.status = 'confirmed'
        and g.started_at is not null
        and g.started_at > v.created_at
    )
)
select jsonb_build_object(
  'users', (select n from users),
  'groups', (select n from groups_n),
  'games_played', (select n from played),
  'dau', (select d from active),
  'wau', (select w from active),
  'mau', (select m from active),
  'signup_google', (select google from provider),
  'signup_magic_link', (select magic_link from provider),
  'onboarding_total', (select total from setup),
  'onboarding_finished', (select finished from setup),
  'payable', (select payable from setup),
  'pay_venmo', (select venmo from setup),
  'pay_zelle', (select zelle from setup),
  'with_photo', (select photo from setup),
  'median_players', (select median_players from engagement),
  'median_minutes', (select median_minutes from engagement),
  'median_buyins_per_player', (select median_buyins_per_player from engagement),
  'median_voids_per_game', (select median_voids from engagement),
  'games_with_food', (select with_food from engagement),
  'games_started', (select n from engagement),
  'games_settled', (select settled from engagement),
  'games_needing_adjustment', (select needed_adjustment from engagement),
  'median_discrepancy_cents', (select median_discrepancy from engagement),
  'games_abandoned', (select abandoned from engagement),
  'cents_settled', (select cents from money),
  'settlements_total', (select total from handshake),
  'settlements_confirmed', (select confirmed from handshake),
  'settlements_stale', (select stale from handshake),
  'median_confirm_hours', (select median_hours from handshake),
  'games_with_handoff', (select n from handoffs),
  'group_invite_clicks', (select group_clicks from invites),
  'group_invite_joins', (select group_joins from invites),
  'game_link_clicks', (select game_clicks from invites),
  'game_link_joins', (select game_joins from invites),
  'invited_who_played', (select n from invite_played)
);
$$;

-- Weekly series, bucketed in the app's zone rather than UTC so a Saturday
-- night signup lands in the week everybody thinks it did.
create or replace function public.admin_weekly()
returns table (week date, signups int, games int)
language sql security definer stable set search_path = ''
as $$
  with weeks as (
    select generate_series(
      date_trunc('week', (now() at time zone 'America/New_York') - interval '11 weeks'),
      date_trunc('week', (now() at time zone 'America/New_York')),
      interval '1 week'
    )::date w
  )
  select
    weeks.w,
    (select count(*)::int from public.profiles p
      where date_trunc('week', p.created_at at time zone 'America/New_York')::date = weeks.w),
    (select count(*)::int from public.games g
      where date_trunc('week', g.created_at at time zone 'America/New_York')::date = weeks.w)
  from weeks
  order by weeks.w;
$$;

create or replace function public.admin_monthly_signups()
returns table (month date, signups int)
language sql security definer stable set search_path = ''
as $$
  with months as (
    select generate_series(
      date_trunc('month', (now() at time zone 'America/New_York') - interval '5 months'),
      date_trunc('month', (now() at time zone 'America/New_York')),
      interval '1 month'
    )::date m
  )
  select
    months.m,
    (select count(*)::int from public.profiles p
      where date_trunc('month', p.created_at at time zone 'America/New_York')::date = months.m)
  from months
  order by months.m;
$$;

-- Retention measured as "came back and did something", by signup week.
-- Week 2 is days 7-14 after signup; week 4 is days 21-28.
create or replace function public.admin_cohorts()
returns table (cohort date, size int, week2 int, week4 int)
language sql security definer stable set search_path = ''
as $$
  select
    date_trunc('week', p.created_at at time zone 'America/New_York')::date,
    count(*)::int,
    count(*) filter (where exists (
      select 1 from public.admin_activity a
      where a.profile_id = p.id
        and a.at >= p.created_at + interval '7 days'
        and a.at <  p.created_at + interval '14 days'
    ))::int,
    count(*) filter (where exists (
      select 1 from public.admin_activity a
      where a.profile_id = p.id
        and a.at >= p.created_at + interval '21 days'
        and a.at <  p.created_at + interval '28 days'
    ))::int
  from public.profiles p
  group by 1
  order by 1;
$$;

-- Names of groups, never of people: this is about which groups are alive.
create or replace function public.admin_groups()
returns table (
  name text,
  members int,
  games int,
  last_game timestamptz
)
language sql security definer stable set search_path = ''
as $$
  select
    g.name,
    (select count(*)::int from public.group_members m
      where m.group_id = g.id and m.is_active),
    (select count(*)::int from public.games x
      where x.group_id = g.id and x.started_at is not null),
    (select max(coalesce(x.started_at, x.scheduled_at)) from public.games x
      where x.group_id = g.id and x.started_at is not null)
  from public.groups g
  order by 4 desc nulls last, 1;
$$;

revoke execute on function
  public.admin_overview(),
  public.admin_weekly(),
  public.admin_monthly_signups(),
  public.admin_cohorts(),
  public.admin_groups()
from anon, authenticated;
