-- Cashing out mid-game. Someone leaves at 11pm, their chips are counted then,
-- and that count carries into the final settlement untouched.
--
-- No new table: this is the same cashouts row the counting screen writes, so
-- reconciliation, game_nets() and settle_game() need no changes at all. The
-- only new fact is *when* it was recorded, which is what frees the seat and
-- closes the player's buy-ins.

alter table public.cashouts
  add column if not exists left_table boolean not null default false;

comment on column public.cashouts.left_table is
  'Recorded while the game was still active: this player got up and left. '
  'End-of-game counts stay false, so reopening the game does not lock '
  'everyone out of buying in.';

-- ============ Seats ============
-- A seat is held by a confirmed player who is still at the table. Someone who
-- cashed out mid-game keeps their signup — they are in the settlement math
-- forever — but they are no longer sitting down, so the chair is free.

create or replace function public.seats_taken(p_game_id uuid)
returns integer
language sql security definer stable set search_path = ''
as $$
  select count(*)::integer
  from public.game_signups s
  where s.game_id = p_game_id
    and s.status = 'confirmed'
    and not exists (
      select 1 from public.cashouts c
      where c.game_id = s.game_id
        and c.member_id = s.member_id
        and c.left_table
    )
$$;

-- Promotion in one place now that two different events can open a seat:
-- someone leaving the roster, and someone cashing out of it.
create or replace function public.promote_from_waitlist(p_game_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  seat integer;
  promote_id uuid;
begin
  select seat_limit into seat from public.games where id = p_game_id;
  if public.seats_taken(p_game_id) >= seat then
    return;
  end if;

  select id into promote_id
  from public.game_signups
  where game_id = p_game_id and status = 'waitlist'
  order by signup_order
  limit 1;

  if promote_id is not null then
    update public.game_signups set status = 'confirmed' where id = promote_id;
  end if;
end;
$$;

-- The three seat-counting sites, all switched to seats_taken(). Bodies are
-- otherwise unchanged from 20260825000000.

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

  confirmed_count := public.seats_taken(new.game_id);

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
    confirmed_count := public.seats_taken(new.game_id);
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
    if public.seats_taken(new.game_id) >= g.seat_limit then
      raise exception 'no seats available';
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.game_signups_after_update()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if old.status = 'confirmed' and new.status <> 'confirmed' then
    perform public.promote_from_waitlist(new.game_id);
  end if;
  return null;
end;
$$;

-- A mid-game cashout empties a chair, so the same promotion runs.
create or replace function public.cashouts_after_write()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.left_table then
    perform public.promote_from_waitlist(new.game_id);
  end if;
  return null;
end;
$$;

drop trigger if exists cashouts_after_write on public.cashouts;
create trigger cashouts_after_write
  after insert or update on public.cashouts
  for each row execute function public.cashouts_after_write();

-- ============ No buy-ins after you've left ============
-- The disabled tap target is a courtesy. This is the guarantee.

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

  if exists (
    select 1 from public.cashouts
    where game_id = new.game_id and member_id = new.member_id and left_table
  ) then
    raise exception 'that player cashed out; undo the cash out to buy in again';
  end if;

  new.created_by_member_id := public.my_member_id(g.group_id);
  new.voided_at := null;
  new.voided_by_member_id := null;
  new.void_reason := null;
  return new;
end;
$$;

-- ============ Recording and undoing ============

create or replace function public.record_cashout(
  p_game_id uuid,
  p_member_id uuid,
  p_chips integer
) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  g record;
  me uuid;
begin
  if not public.can_admin_game(p_game_id) then
    raise exception 'only the game admin can record cashouts';
  end if;
  if p_chips < 0 then
    raise exception 'chips cannot be negative';
  end if;

  select group_id, status, chips_per_dollar into g
  from public.games where id = p_game_id;

  -- 'active' is allowed so a player can leave early and cash out mid-game.
  if g.status not in ('active', 'reconciling') then
    raise exception 'this game is not counting chips';
  end if;

  if not exists (
    select 1 from public.game_signups
    where game_id = p_game_id and member_id = p_member_id and status = 'confirmed'
  ) then
    raise exception 'that player does not have a seat in this game';
  end if;

  me := public.my_member_id(g.group_id);

  insert into public.cashouts (
    game_id, member_id, chips, amount_cents, recorded_by_member_id, left_table
  ) values (
    p_game_id, p_member_id, p_chips,
    public.chips_to_cents(p_chips, g.chips_per_dollar), me,
    g.status = 'active'
  )
  on conflict (game_id, member_id) do update
  set chips = excluded.chips,
      amount_cents = excluded.amount_cents,
      recorded_at = now(),
      recorded_by_member_id = excluded.recorded_by_member_id,
      -- Editing a leaver's count on the counting screen doesn't seat them
      -- again: they still left.
      left_table = public.cashouts.left_table or excluded.left_table;
end;
$$;

-- Someone announces they're out, cashes out, then sits back down for one more
-- hand. Deleting the row is right: there is nothing to audit about a cash out
-- that didn't happen, and the buy-ins it was blocking are the real record.
create or replace function public.undo_cashout(
  p_game_id uuid,
  p_member_id uuid
) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  g record;
  taker text;
begin
  if not public.can_admin_game(p_game_id) then
    raise exception 'only the game admin can undo a cash out';
  end if;

  select status, seat_limit into g from public.games where id = p_game_id;

  -- Once chips are being counted, the counting screen is the place to fix a
  -- number, and every player needs a count anyway.
  if g.status <> 'active' then
    raise exception 'the game is being counted; edit the chip count instead';
  end if;

  if not exists (
    select 1 from public.cashouts
    where game_id = p_game_id and member_id = p_member_id and left_table
  ) then
    raise exception 'that player has not cashed out';
  end if;

  -- Their chair may already have someone in it. Silently over-seating the
  -- game would break the only invariant the waitlist has.
  if public.seats_taken(p_game_id) >= g.seat_limit then
    select m.display_name into taker
    from public.game_signups s
    join public.group_members m on m.id = s.member_id
    where s.game_id = p_game_id and s.status = 'confirmed'
      and not exists (
        select 1 from public.cashouts c
        where c.game_id = s.game_id and c.member_id = s.member_id and c.left_table
      )
    order by s.signup_order desc
    limit 1;
    raise exception
      'the table is full — % took the seat. Remove them first.',
      coalesce(taker, 'someone else');
  end if;

  delete from public.cashouts
  where game_id = p_game_id and member_id = p_member_id;
end;
$$;

-- Writes stay on the RPCs, which check can_admin_game() themselves. cashouts
-- has RLS on with no insert/update/delete policy, so a direct write from a
-- client is refused outright — a stricter guarantee than a policy that has to
-- describe who may write.
revoke execute on function
  public.seats_taken(uuid),
  public.promote_from_waitlist(uuid),
  public.undo_cashout(uuid, uuid)
from anon;
