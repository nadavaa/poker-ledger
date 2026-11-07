-- Admin tracking: who the users are, where they came from, what changed.
-- Spec: docs/GROWTH.md, section 1.
--
-- Same rules as 20260905000000_admin_analytics.sql: the read functions are
-- revoked from anon and authenticated, so only the service role behind the
-- OWNER_USER_ID gate can call them. They take the owner's id as an argument
-- because "outside" is defined relative to the owner, and the owner id lives
-- in an environment variable, not in the database.
--
-- Names are allowed on /admin (decided 2026-11-06). Emails, phone numbers and
-- payment handles are still never returned.

-- ============ Sign-up source ============
-- First touch, recorded once on the first sign-in of a new account. Values:
--   ref:<tag>     a ?ref= tag on the link they arrived through
--   web:<domain>  an external referrer (google.com, chatgpt.com, reddit.com)
--   invite        arrived on a group, game or claim link
--   direct        none of the above
--   unknown       new account, but the browser that signed in never saw the
--                 site before (magic link opened in a mail app's browser)
-- null means the account predates tracking.

alter table public.profiles
  add column signup_source text
  check (signup_source ~ '^[a-z0-9:._-]{1,64}$');

-- Called by the auth callbacks on every sign-in. Writes only for the caller's
-- own profile, only if nothing is recorded yet, and only while the account is
-- new (a magic link creates the profile when it is requested, so allow a day
-- for it to be clicked). An existing user signing in again changes nothing.
create or replace function public.record_signup_source(p_source text)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  update public.profiles
     set signup_source = case
           when p_source ~ '^[a-z0-9:._-]{1,64}$' then p_source
           else 'unknown'
         end
   where id = (select auth.uid())
     and signup_source is null
     and created_at > now() - interval '1 day';
end;
$$;

-- New functions start closed (20260917000000_security_hardening.sql), so the
-- grant is explicit. signup_source is not in the profiles column grant, so a
-- client cannot write it directly either.
revoke execute on function public.record_signup_source(text) from public, anon;
grant execute on function public.record_signup_source(text) to authenticated;

-- ============ Users ============
-- One row per account. "Outside" = an active member of at least one group the
-- owner is not an active member of. first_outside_at is when they first
-- joined such a group, so the page can count outside users at any past date.
-- Memberships record when they were created, not when they were deactivated,
-- so a past count uses today's active flag: close enough at this size.

create or replace function public.admin_users_detail(p_owner uuid)
returns table (
  display_name text,
  created_at timestamptz,
  signup_source text,
  groups int,
  outside_groups int,
  first_outside_at timestamptz,
  games int,
  last_game timestamptz
)
language sql security definer stable set search_path = ''
as $$
  with outside as (
    select g.id
      from public.groups g
     where not exists (
       select 1 from public.group_members o
        where o.group_id = g.id
          and o.profile_id = p_owner
          and o.is_active
     )
  ),
  played as (
    -- A game counts as played when the member has a buy-in that was not
    -- voided, in a game that started.
    select m.profile_id, b.game_id, max(x.started_at) started_at
      from public.buyins b
      join public.group_members m on m.id = b.member_id
      join public.games x on x.id = b.game_id
     where m.profile_id is not null
       and b.voided_at is null
       and x.started_at is not null
     group by m.profile_id, b.game_id
  )
  select
    p.display_name,
    p.created_at,
    p.signup_source,
    (select count(*)::int from public.group_members m
      where m.profile_id = p.id and m.is_active),
    (select count(*)::int from public.group_members m
      where m.profile_id = p.id and m.is_active
        and m.group_id in (select id from outside)),
    (select min(m.created_at) from public.group_members m
      where m.profile_id = p.id and m.is_active
        and m.group_id in (select id from outside)),
    (select count(*)::int from played pl where pl.profile_id = p.id),
    (select max(pl.started_at) from played pl where pl.profile_id = p.id)
  from public.profiles p
  order by p.created_at desc;
$$;

-- ============ Groups ============
-- One row per group, newest first. started is every game start, so the page
-- can count games in any window without another round trip.

create or replace function public.admin_groups_detail(p_owner uuid)
returns table (
  name text,
  created_at timestamptz,
  outside boolean,
  members int,
  claimed int,
  settled int,
  started timestamptz[],
  last_game timestamptz
)
language sql security definer stable set search_path = ''
as $$
  select
    g.name,
    g.created_at,
    not exists (
      select 1 from public.group_members o
       where o.group_id = g.id
         and o.profile_id = p_owner
         and o.is_active
    ),
    (select count(*)::int from public.group_members m
      where m.group_id = g.id and m.is_active),
    (select count(*)::int from public.group_members m
      where m.group_id = g.id and m.is_active and m.profile_id is not null),
    (select count(*)::int from public.games x
      where x.group_id = g.id and x.status = 'settled'),
    coalesce(
      (select array_agg(x.started_at order by x.started_at)
         from public.games x
        where x.group_id = g.id and x.started_at is not null),
      '{}'
    ),
    (select max(x.started_at) from public.games x
      where x.group_id = g.id and x.started_at is not null)
  from public.groups g
  order by g.created_at desc;
$$;

revoke execute on function
  public.admin_users_detail(uuid),
  public.admin_groups_detail(uuid)
from public, anon, authenticated;
grant execute on function
  public.admin_users_detail(uuid),
  public.admin_groups_detail(uuid)
to service_role;
