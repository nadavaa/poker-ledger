-- Auto buy-in on join, and admin removal of a player from a game.
--
-- Two behaviour changes:
--   1. Confirming a seat stakes the game's buy-in automatically, so the admin
--      only ever taps for re-buys.
--   2. The game admin can remove a confirmed player, which frees the seat and
--      lets the existing promotion trigger pull up the first waitlister.

-- Auto rows are system-created, not logged by a person. The flag keeps the
-- activity feed honest about which is which.
alter table public.buyins
  add column is_auto boolean not null default false;

-- The one place chips are derived from cents inside Postgres. Mirrors
-- centsToChips() in lib/money.ts, which stays authoritative for the app.
create or replace function public.cents_to_chips(
  p_cents integer,
  p_chips_per_dollar numeric
) returns integer
language sql immutable set search_path = '' as $$
  select round(p_cents * p_chips_per_dollar / 100)::integer
$$;

-- created_by_member_id is still stamped as the caller for anything a human
-- logs. Auto rows arrive through the signup trigger, which announces itself
-- with a transaction-local flag so a client can't forge one.
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

  if coalesce(current_setting('app.auto_buyin', true), 'off') <> 'on' then
    new.is_auto := false;
    new.created_by_member_id := public.my_member_id(g.group_id);
  end if;

  new.voided_at := null;
  new.voided_by_member_id := null;
  new.void_reason := null;
  return new;
end;
$$;

-- Taking a seat stakes the buy-in; losing the seat before the game starts
-- takes it back off the books.
create or replace function public.game_signups_sync_auto_buyin()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  g record;
  became_confirmed boolean;
  left_confirmed boolean;
begin
  select default_buyin_cents, chips_per_dollar, started_at
  into g from public.games where id = new.game_id;

  if tg_op = 'INSERT' then
    became_confirmed := new.status = 'confirmed';
    left_confirmed := false;
  else
    became_confirmed := new.status = 'confirmed' and old.status <> 'confirmed';
    left_confirmed := old.status = 'confirmed' and new.status <> 'confirmed';
  end if;

  if became_confirmed then
    -- Guard against double-staking someone who leaves and rejoins a game
    -- that is already under way.
    if not exists (
      select 1 from public.buyins
      where game_id = new.game_id
        and member_id = new.member_id
        and voided_at is null
    ) then
      perform set_config('app.auto_buyin', 'on', true);
      insert into public.buyins (
        game_id, member_id, amount_cents, chips, created_by_member_id, is_auto
      ) values (
        new.game_id,
        new.member_id,
        g.default_buyin_cents,
        public.cents_to_chips(g.default_buyin_cents, g.chips_per_dollar),
        new.member_id,
        true
      );
      perform set_config('app.auto_buyin', 'off', true);
    end if;
  end if;

  if left_confirmed and g.started_at is null then
    -- They never sat down. Once the game has started the money stays in:
    -- a player who leaves early is still in the settlement math.
    update public.buyins
    set void_reason = 'left before the game started'
    where game_id = new.game_id
      and member_id = new.member_id
      and is_auto
      and voided_at is null;
  end if;

  return null;
end;
$$;

create trigger game_signups_sync_auto_buyin_insert
  after insert on public.game_signups
  for each row execute function public.game_signups_sync_auto_buyin();

-- Named to sort after game_signups_after_update so waitlist promotion runs
-- first and the promoted player gets staked by their own trigger pass.
create trigger game_signups_sync_auto_buyin_update
  after update on public.game_signups
  for each row execute function public.game_signups_sync_auto_buyin();

-- Backfill: existing confirmed players in games that are still open get the
-- stake they would have received under the new rule.
do $$
declare
  s record;
begin
  for s in
    select gs.game_id, gs.member_id, g.default_buyin_cents, g.chips_per_dollar
    from public.game_signups gs
    join public.games g on g.id = gs.game_id
    where gs.status = 'confirmed'
      and g.status in ('scheduled', 'active')
      and not exists (
        select 1 from public.buyins b
        where b.game_id = gs.game_id
          and b.member_id = gs.member_id
          and b.voided_at is null
      )
  loop
    perform set_config('app.auto_buyin', 'on', true);
    insert into public.buyins (
      game_id, member_id, amount_cents, chips, created_by_member_id, is_auto
    ) values (
      s.game_id, s.member_id, s.default_buyin_cents,
      public.cents_to_chips(s.default_buyin_cents, s.chips_per_dollar),
      s.member_id, true
    );
    perform set_config('app.auto_buyin', 'off', true);
  end loop;
end
$$;
