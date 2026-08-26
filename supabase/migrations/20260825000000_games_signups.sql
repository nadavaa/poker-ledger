-- Phase 2: games and signups with seat limit, waitlist ordering, and
-- trigger-based auto-promotion.

create type public.game_status as enum
  ('scheduled', 'active', 'reconciling', 'settled', 'cancelled');

create table public.games (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  name text,                                  -- optional, e.g. "Labor Day game"
  scheduled_at timestamptz not null,
  location text,
  seat_limit integer not null default 9,
  -- snapshotted from group at creation so history never changes:
  default_buyin_cents integer not null check (default_buyin_cents > 0),
  chips_per_dollar numeric(10,4) not null check (chips_per_dollar > 0),
  status public.game_status not null default 'scheduled',
  -- exactly one admin per game, enforced by the shape of the schema:
  admin_member_id uuid not null references public.group_members (id),
  created_at timestamptz not null default now(),
  created_by_member_id uuid not null references public.group_members (id),
  started_at timestamptz,
  settled_at timestamptz
);
create index on public.games (group_id, scheduled_at desc);

create type public.signup_status as enum ('confirmed', 'waitlist', 'withdrawn');

create table public.game_signups (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games (id) on delete cascade,
  member_id uuid not null references public.group_members (id) on delete cascade,
  -- status and signup_order are computed by triggers; the defaults only
  -- exist so inserts don't have to supply values that get overwritten.
  status public.signup_status not null default 'waitlist',
  signup_order integer not null default 0,   -- monotonic per game
  created_at timestamptz not null default now(),
  withdrawn_at timestamptz,
  unique (game_id, member_id)
);
create index on public.game_signups (game_id);

-- ============ Helpers ============

-- Strictly the one admin. Group owner/admin role does NOT grant game write
-- access.
create or replace function public.can_admin_game(g uuid) returns boolean
language sql security definer stable set search_path = '' as $$
  select exists (
    select 1 from public.games ga
    join public.group_members gm on gm.id = ga.admin_member_id
    where ga.id = g and gm.profile_id = (select auth.uid())
  )
$$;

-- ============ RLS ============

alter table public.games enable row level security;

create policy "group members read games"
  on public.games for select to authenticated
  using (public.is_group_member(group_id));

create policy "members create games as their own admin"
  on public.games for insert to authenticated
  with check (
    public.is_group_member(group_id)
    and admin_member_id = public.my_member_id(group_id)
    and created_by_member_id = public.my_member_id(group_id)
  );

create policy "only the game admin updates a game"
  on public.games for update to authenticated
  using (public.can_admin_game(id));

alter table public.game_signups enable row level security;

create policy "group members read signups"
  on public.game_signups for select to authenticated
  using (exists (
    select 1 from public.games g
    where g.id = game_signups.game_id and public.is_group_member(g.group_id)
  ));

create policy "own signup or game admin inserts"
  on public.game_signups for insert to authenticated
  with check (
    public.can_admin_game(game_id)
    or member_id = (
      select public.my_member_id(g.group_id)
      from public.games g where g.id = game_signups.game_id
    )
  );

create policy "own signup or game admin updates"
  on public.game_signups for update to authenticated
  using (
    public.can_admin_game(game_id)
    or member_id = (
      select public.my_member_id(g.group_id)
      from public.games g where g.id = game_signups.game_id
    )
  );

-- ============ Signup triggers ============
-- signup_order and status are always computed here, never trusted from the
-- client. The advisory lock serializes concurrent signups per game so two
-- people can't both grab the last seat.

create or replace function public.game_signups_before_insert()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  g record;
  confirmed_count integer;
begin
  perform pg_advisory_xact_lock(hashtext('game_signups'), hashtext(new.game_id::text));

  select seat_limit, status, group_id into g
  from public.games where id = new.game_id;

  if g.status not in ('scheduled', 'active') then
    raise exception 'game is not open for signups';
  end if;

  if not exists (
    select 1 from public.group_members
    where id = new.member_id and group_id = g.group_id
  ) then
    raise exception 'member is not in this group';
  end if;

  select count(*) into confirmed_count
  from public.game_signups
  where game_id = new.game_id and status = 'confirmed';

  new.signup_order := (
    select coalesce(max(signup_order), 0) + 1
    from public.game_signups where game_id = new.game_id
  );
  new.status := case
    when confirmed_count < g.seat_limit then 'confirmed'
    else 'waitlist'
  end::public.signup_status;
  new.withdrawn_at := null;
  return new;
end;
$$;

create trigger game_signups_before_insert
  before insert on public.game_signups
  for each row execute function public.game_signups_before_insert();

create or replace function public.game_signups_before_update()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  g record;
  confirmed_count integer;
begin
  perform pg_advisory_xact_lock(hashtext('game_signups'), hashtext(new.game_id::text));

  if new.status = 'withdrawn' and old.status <> 'withdrawn' then
    new.withdrawn_at := now();
    return new;
  end if;

  if old.status = 'withdrawn' and new.status <> 'withdrawn' then
    -- Re-joining goes to the back of the line and gets a computed status.
    select seat_limit into g from public.games where id = new.game_id;
    select count(*) into confirmed_count
    from public.game_signups
    where game_id = new.game_id and status = 'confirmed';
    new.signup_order := (
      select coalesce(max(signup_order), 0) + 1
      from public.game_signups where game_id = new.game_id
    );
    new.status := case
      when confirmed_count < g.seat_limit then 'confirmed'
      else 'waitlist'
    end::public.signup_status;
    new.withdrawn_at := null;
    return new;
  end if;

  if new.status = 'confirmed' and old.status = 'waitlist' then
    -- Promotion path (or a manual bump): only if a seat is actually free.
    select seat_limit into g from public.games where id = new.game_id;
    select count(*) into confirmed_count
    from public.game_signups
    where game_id = new.game_id and status = 'confirmed';
    if confirmed_count >= g.seat_limit then
      raise exception 'no seats available';
    end if;
  end if;

  return new;
end;
$$;

create trigger game_signups_before_update
  before update on public.game_signups
  for each row execute function public.game_signups_before_update();

-- Waitlist promotion (spec edge case 1): when a confirmed player stops being
-- confirmed, the lowest signup_order waitlister takes the seat. Runs in the
-- database so it can't race.
create or replace function public.game_signups_after_update()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  seat integer;
  confirmed_count integer;
  promote_id uuid;
begin
  if old.status = 'confirmed' and new.status <> 'confirmed' then
    select seat_limit into seat from public.games where id = new.game_id;
    select count(*) into confirmed_count
    from public.game_signups
    where game_id = new.game_id and status = 'confirmed';
    if confirmed_count < seat then
      select id into promote_id
      from public.game_signups
      where game_id = new.game_id and status = 'waitlist'
      order by signup_order
      limit 1;
      if promote_id is not null then
        update public.game_signups set status = 'confirmed' where id = promote_id;
      end if;
    end if;
  end if;
  return null;
end;
$$;

create trigger game_signups_after_update
  after update on public.game_signups
  for each row execute function public.game_signups_after_update();

-- ============ create_game RPC ============
-- The one-screen new-game flow: pick an existing group or name a new one,
-- creator becomes admin, group defaults are snapshotted onto the game, and
-- "I'm playing too" writes the first signup — all in one transaction.

create or replace function public.create_game(
  p_scheduled_at timestamptz,
  p_group_id uuid default null,
  p_new_group_name text default null,
  p_name text default null,
  p_location text default null,
  p_seat_limit integer default null,
  p_buyin_cents integer default null,
  p_chips_per_dollar numeric default null,
  p_playing boolean default true
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  gid uuid;
  mid uuid;
  grp record;
  v_game_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'not authenticated';
  end if;

  if p_group_id is not null then
    if not public.is_group_member(p_group_id) then
      raise exception 'not a member of this group';
    end if;
    gid := p_group_id;
  elsif coalesce(trim(p_new_group_name), '') <> '' then
    gid := public.create_group(p_new_group_name);
  else
    raise exception 'pick a group or name a new one';
  end if;

  select id into mid from public.group_members
  where group_id = gid and profile_id = (select auth.uid());

  select chips_per_dollar, default_buyin_cents, default_seat_limit
  into grp from public.groups where id = gid;

  if coalesce(p_seat_limit, grp.default_seat_limit) < 2 then
    raise exception 'seat limit must be at least 2';
  end if;

  insert into public.games (
    group_id, name, scheduled_at, location, seat_limit,
    default_buyin_cents, chips_per_dollar,
    admin_member_id, created_by_member_id
  ) values (
    gid,
    nullif(trim(coalesce(p_name, '')), ''),
    p_scheduled_at,
    nullif(trim(coalesce(p_location, '')), ''),
    coalesce(p_seat_limit, grp.default_seat_limit),
    coalesce(p_buyin_cents, grp.default_buyin_cents),
    coalesce(p_chips_per_dollar, grp.chips_per_dollar),
    mid, mid
  ) returning id into v_game_id;

  if p_playing then
    insert into public.game_signups (game_id, member_id)
    values (v_game_id, mid);
  end if;

  return v_game_id;
end;
$$;

revoke execute on function
  public.create_game(timestamptz, uuid, text, text, text, integer, integer, numeric, boolean)
from anon;
