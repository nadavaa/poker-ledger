-- Editing a game after it exists: the time moves, the venue changes, someone
-- typed 5000 chips instead of 500.
--
-- What may be edited depends on what the game is doing, and that rule cannot
-- live in a policy: RLS filters rows, not columns, and WITH CHECK cannot see
-- the old row to know what changed. So the policy says WHO (the game admin,
-- and never on a finished game) and a BEFORE trigger says WHAT. Both are the
-- database; neither is a hidden button.

-- ============ Who ============

drop policy if exists "only the game admin updates a game" on public.games;

-- WITH CHECK spelled out rather than left to Postgres to infer from USING.
-- Inferring it is what broke the settlement confirm policy once already.
create policy "only the game admin updates a game"
  on public.games for update to authenticated
  using (
    public.can_admin_game(id)
    and status not in ('settled', 'cancelled')
  )
  with check (public.can_admin_game(id));

-- ============ What ============

create table if not exists public.game_edits (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games (id) on delete cascade,
  edited_by_member_id uuid references public.group_members (id),
  field text not null,
  old_value text,
  new_value text,
  created_at timestamptz not null default now()
);
create index if not exists game_edits_game_id_created_at_idx
  on public.game_edits (game_id, created_at desc);

alter table public.game_edits enable row level security;

-- Read-only to the group; the trigger below is the only writer. Players see
-- that the start time moved without having to be told in the chat.
create policy "group members read game edits"
  on public.game_edits for select to authenticated
  using (exists (
    select 1 from public.games g
    where g.id = game_edits.game_id and public.is_group_member(g.group_id)
  ));

create or replace function public.games_before_update()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  seated integer;
begin
  -- Buy-in amount and chip ratio are snapshotted onto this row at creation
  -- and every buyin is priced against them. Changing the ratio mid-game would
  -- silently rewrite what every stack on the table is worth.
  if new.scheduled_at is distinct from old.scheduled_at
     or new.seat_limit is distinct from old.seat_limit
     or new.default_buyin_cents is distinct from old.default_buyin_cents
     or new.chips_per_dollar is distinct from old.chips_per_dollar then
    if old.status <> 'scheduled' then
      raise exception
        'the game has started — only the name and location can change now';
    end if;
  end if;

  if (new.name is distinct from old.name
      or new.location is distinct from old.location)
     and old.status not in ('scheduled', 'active') then
    raise exception 'this game is finished; nothing can be edited';
  end if;

  if new.default_buyin_cents <= 0 then
    raise exception 'the buy-in has to be more than nothing';
  end if;
  if new.chips_per_dollar <= 0 then
    raise exception 'the chip ratio has to be more than zero';
  end if;
  if new.seat_limit < 1 then
    raise exception 'a game needs at least one seat';
  end if;

  -- Lowering the limit never demotes anybody behind the admin's back. Who
  -- loses their seat is a decision about people, not a number.
  if new.seat_limit < old.seat_limit then
    seated := public.seats_taken(old.id);
    if new.seat_limit < seated then
      raise exception
        '% players are confirmed. Move someone to the waitlist first.', seated;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists games_before_update on public.games;
create trigger games_before_update
  before update on public.games
  for each row execute function public.games_before_update();

-- ============ Logging, and the seats that open up ============

create or replace function public.games_after_update()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid;
  guard integer := 0;
  waiting integer;
begin
  me := public.my_member_id(new.group_id);

  -- One row per field that actually moved, so the feed can say what changed
  -- rather than "the game was edited".
  if new.name is distinct from old.name then
    insert into public.game_edits (game_id, edited_by_member_id, field, old_value, new_value)
    values (new.id, me, 'name', old.name, new.name);
  end if;
  if new.location is distinct from old.location then
    insert into public.game_edits (game_id, edited_by_member_id, field, old_value, new_value)
    values (new.id, me, 'location', old.location, new.location);
  end if;
  if new.scheduled_at is distinct from old.scheduled_at then
    insert into public.game_edits (game_id, edited_by_member_id, field, old_value, new_value)
    values (new.id, me, 'scheduled_at', old.scheduled_at::text, new.scheduled_at::text);
  end if;
  if new.seat_limit is distinct from old.seat_limit then
    insert into public.game_edits (game_id, edited_by_member_id, field, old_value, new_value)
    values (new.id, me, 'seat_limit', old.seat_limit::text, new.seat_limit::text);
  end if;
  if new.default_buyin_cents is distinct from old.default_buyin_cents then
    insert into public.game_edits (game_id, edited_by_member_id, field, old_value, new_value)
    values (new.id, me, 'default_buyin_cents', old.default_buyin_cents::text, new.default_buyin_cents::text);
  end if;
  if new.chips_per_dollar is distinct from old.chips_per_dollar then
    insert into public.game_edits (game_id, edited_by_member_id, field, old_value, new_value)
    values (new.id, me, 'chips_per_dollar', old.chips_per_dollar::text, new.chips_per_dollar::text);
  end if;

  -- More seats means the people already waiting for one get it, in order,
  -- without the admin having to seat them by hand.
  if new.seat_limit > old.seat_limit and new.status = 'scheduled' then
    loop
      guard := guard + 1;
      exit when guard > 100;
      exit when public.seats_taken(new.id) >= new.seat_limit;
      select count(*) into waiting
      from public.game_signups
      where game_id = new.id and status = 'waitlist';
      exit when waiting = 0;
      perform public.promote_from_waitlist(new.id);
    end loop;
  end if;

  return null;
end;
$$;

drop trigger if exists games_after_update on public.games;
create trigger games_after_update
  after update on public.games
  for each row execute function public.games_after_update();
