-- Admin-driven roster moves: seat a waitlisted player, or send a confirmed
-- player back to the waitlist before the game starts.
--
-- Both go through security-definer functions that re-check can_admin_game()
-- with the same helper the RLS policy uses, so a member cannot move anyone
-- but themselves no matter what they call from devtools.

-- The seat limit still applies to everyone, but an admin deliberately seating
-- a tenth player is a decision, not a mistake. The flag is transaction-local
-- and only promote_to_confirmed() sets it.
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

  if new.status = 'confirmed' and old.status = 'waitlist'
     and coalesce(current_setting('app.overfill_seats', true), 'off') <> 'on' then
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

-- Seat a waitlisted player. Idempotent: if the withdrawal trigger promoted
-- them a moment earlier, this returns their status instead of promoting
-- twice. The advisory lock is the same one the triggers take, so a manual
-- promote and a triggered one serialise rather than race.
create or replace function public.promote_to_confirmed(
  p_game_id uuid,
  p_member_id uuid,
  p_allow_overfill boolean default false
) returns text
language plpgsql security definer set search_path = ''
as $$
declare
  g record;
  cur public.signup_status;
  confirmed_count integer;
begin
  if not public.can_admin_game(p_game_id) then
    raise exception 'only the game admin can change the roster';
  end if;

  select group_id, status, seat_limit into g
  from public.games where id = p_game_id;
  if g.group_id is null then
    raise exception 'game not found';
  end if;
  if g.status not in ('scheduled', 'active') then
    raise exception 'this game is closed';
  end if;

  perform pg_advisory_xact_lock(hashtext('game_signups'), hashtext(p_game_id::text));

  select status into cur from public.game_signups
  where game_id = p_game_id and member_id = p_member_id;

  if cur is null then
    raise exception 'that player is not in this game';
  end if;
  if cur = 'confirmed' then
    return 'confirmed';   -- already seated, nothing to do
  end if;
  if cur <> 'waitlist' then
    raise exception 'that player is not on the waitlist';
  end if;

  select count(*) into confirmed_count
  from public.game_signups
  where game_id = p_game_id and status = 'confirmed';

  if confirmed_count >= g.seat_limit and not p_allow_overfill then
    raise exception 'game is full: % of % seats taken',
      confirmed_count, g.seat_limit;
  end if;

  if p_allow_overfill then
    perform set_config('app.overfill_seats', 'on', true);
  end if;

  update public.game_signups
  set status = 'confirmed'
  where game_id = p_game_id and member_id = p_member_id;

  perform set_config('app.overfill_seats', 'off', true);

  -- Promoting into a running game seats them with nothing staked; the admin
  -- logs their buy-in with a tap like anyone else.
  return 'confirmed';
end;
$$;

-- The reverse, before the game starts only. Money already on the table is a
-- harder problem than a roster mistake, so this refuses rather than guessing.
create or replace function public.demote_from_confirmed(
  p_game_id uuid,
  p_member_id uuid,
  p_to text default 'waitlist'      -- 'waitlist' | 'withdrawn'
) returns text
language plpgsql security definer set search_path = ''
as $$
declare
  g record;
  cur public.signup_status;
begin
  if not public.can_admin_game(p_game_id) then
    raise exception 'only the game admin can change the roster';
  end if;
  if p_to not in ('waitlist', 'withdrawn') then
    raise exception 'unknown target status %', p_to;
  end if;

  select group_id, status into g from public.games where id = p_game_id;
  if g.group_id is null then
    raise exception 'game not found';
  end if;
  if g.status <> 'scheduled' then
    raise exception 'the game has already started';
  end if;

  perform pg_advisory_xact_lock(hashtext('game_signups'), hashtext(p_game_id::text));

  select status into cur from public.game_signups
  where game_id = p_game_id and member_id = p_member_id;
  if cur is null then
    raise exception 'that player is not in this game';
  end if;
  if cur <> 'confirmed' then
    return cur::text;   -- already off the table
  end if;

  if exists (
    select 1 from public.buyins
    where game_id = p_game_id and member_id = p_member_id and voided_at is null
  ) then
    raise exception 'they already have buy-ins logged; void those first';
  end if;

  if p_to = 'waitlist' then
    -- Back of the line. Keeping their old order would let the promotion
    -- trigger seat them again immediately.
    update public.game_signups
    set status = 'waitlist',
        signup_order = (
          select coalesce(max(signup_order), 0) + 1
          from public.game_signups where game_id = p_game_id
        )
    where game_id = p_game_id and member_id = p_member_id;
  else
    update public.game_signups
    set status = 'withdrawn'
    where game_id = p_game_id and member_id = p_member_id;
  end if;

  return p_to;
end;
$$;

revoke execute on function
  public.promote_to_confirmed(uuid, uuid, boolean),
  public.demote_from_confirmed(uuid, uuid, text)
from anon;
