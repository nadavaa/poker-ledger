-- Phase 3: append-only buy-ins, void-by-update, admin handoff audit trail,
-- and Realtime on the two tables that need it.

create table public.buyins (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games (id) on delete cascade,
  member_id uuid not null references public.group_members (id),
  amount_cents integer not null check (amount_cents > 0),
  chips integer not null check (chips > 0),
  note text,
  created_at timestamptz not null default now(),
  created_by_member_id uuid not null references public.group_members (id),
  voided_at timestamptz,
  voided_by_member_id uuid references public.group_members (id),
  void_reason text
);
create index on public.buyins (game_id) where voided_at is null;
create index on public.buyins (game_id, created_at desc);

-- Admin handoff audit trail. Every move is logged and shows in the feed.
create table public.game_admin_transfers (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games (id) on delete cascade,
  from_member_id uuid not null references public.group_members (id),
  to_member_id uuid not null references public.group_members (id),
  transferred_by_member_id uuid not null references public.group_members (id),
  was_forced boolean not null default false,   -- true = group owner override
  reason text,
  created_at timestamptz not null default now()
);
create index on public.game_admin_transfers (game_id);

-- ============ RLS ============

alter table public.buyins enable row level security;

create policy "group members read buyins"
  on public.buyins for select to authenticated
  using (exists (
    select 1 from public.games g
    where g.id = buyins.game_id and public.is_group_member(g.group_id)
  ));

create policy "only game admins write buyins"
  on public.buyins for insert to authenticated
  with check (public.can_admin_game(game_id));

create policy "only game admins void buyins"
  on public.buyins for update to authenticated
  using (public.can_admin_game(game_id));

alter table public.game_admin_transfers enable row level security;

create policy "group members read transfers"
  on public.game_admin_transfers for select to authenticated
  using (exists (
    select 1 from public.games g
    where g.id = game_admin_transfers.game_id
      and public.is_group_member(g.group_id)
  ));

-- No insert policy: transfers only happen through transfer_game_admin(),
-- which writes the games row and the audit row together.

-- ============ Append-only enforcement ============
-- The audit trail is the product. A buyin row is written once; the only
-- permitted mutation is the void transition, and the trigger stamps who and
-- when rather than trusting the client.

create or replace function public.buyins_enforce_append_only()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'buyins are append-only; void instead of deleting';
  end if;

  if new.id is distinct from old.id
     or new.game_id is distinct from old.game_id
     or new.member_id is distinct from old.member_id
     or new.amount_cents is distinct from old.amount_cents
     or new.chips is distinct from old.chips
     or new.note is distinct from old.note
     or new.created_at is distinct from old.created_at
     or new.created_by_member_id is distinct from old.created_by_member_id then
    raise exception 'buyins are append-only; correct with a void and a new buyin';
  end if;

  if old.voided_at is not null then
    raise exception 'this buyin is already voided';
  end if;

  -- Stamp the void server-side so the client can't attribute it to someone
  -- else. Any update to a buyin is a void.
  new.voided_at := now();
  new.voided_by_member_id := public.my_member_id(
    (select group_id from public.games where id = new.game_id)
  );
  return new;
end;
$$;

create trigger buyins_enforce_append_only
  before update or delete on public.buyins
  for each row execute function public.buyins_enforce_append_only();

-- created_by_member_id is who logged it: always the caller, never the client's
-- claim. Also validates the player and the game state.
create or replace function public.buyins_before_insert()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  g record;
begin
  select group_id, status into g from public.games where id = new.game_id;

  if g.status not in ('scheduled', 'active') then
    raise exception 'game is not open for buy-ins';
  end if;

  if not exists (
    select 1 from public.group_members
    where id = new.member_id and group_id = g.group_id
  ) then
    raise exception 'player is not in this group';
  end if;

  new.created_by_member_id := public.my_member_id(g.group_id);
  new.voided_at := null;
  new.voided_by_member_id := null;
  new.void_reason := null;
  return new;
end;
$$;

create trigger buyins_before_insert
  before insert on public.buyins
  for each row execute function public.buyins_before_insert();

-- ============ Admin handoff ============

create or replace function public.transfer_game_admin(
  p_game_id uuid,
  p_to_member_id uuid,
  p_reason text default null
) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  g record;
  me uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'not authenticated';
  end if;

  select group_id, admin_member_id, status into g
  from public.games where id = p_game_id;
  if g.group_id is null then
    raise exception 'game not found';
  end if;
  if g.status in ('settled', 'cancelled') then
    raise exception 'this game is closed';
  end if;

  me := public.my_member_id(g.group_id);
  if me is null or me <> g.admin_member_id then
    raise exception 'only the current game admin can hand off';
  end if;

  if p_to_member_id = g.admin_member_id then
    raise exception 'that member already runs this game';
  end if;

  if not exists (
    select 1 from public.group_members
    where id = p_to_member_id and group_id = g.group_id and is_active
  ) then
    raise exception 'pick an active member of this group';
  end if;

  update public.games
  set admin_member_id = p_to_member_id
  where id = p_game_id;

  insert into public.game_admin_transfers (
    game_id, from_member_id, to_member_id, transferred_by_member_id,
    was_forced, reason
  ) values (
    p_game_id, g.admin_member_id, p_to_member_id, me, false, p_reason
  );
end;
$$;

revoke execute on function public.transfer_game_admin(uuid, uuid, text) from anon;

-- ============ Realtime ============
-- Only buyins and game_signups. Realtime respects RLS, so subscribers see
-- exactly what they could have read.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'buyins'
  ) then
    alter publication supabase_realtime add table public.buyins;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'game_signups'
  ) then
    alter publication supabase_realtime add table public.game_signups;
  end if;
end
$$;

-- Voids arrive as UPDATEs; full replica identity makes them deliverable.
alter table public.buyins replica identity full;
alter table public.game_signups replica identity full;
