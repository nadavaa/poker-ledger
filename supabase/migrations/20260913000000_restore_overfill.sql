-- Seating a waitlisted player over the limit stopped working, and it was a
-- regression: game_signups_before_update() has been re-declared three times
-- since it learned to honour app.overfill_seats, and the last two rewrites
-- started from a copy that predated it. promote_to_confirmed() still set the
-- flag; nothing read it; the trigger raised "no seats available"; the write
-- rolled back.
--
-- This is the trigger with every rule it has accumulated, each one named, so
-- the next person to re-declare it can see what they'd be dropping:
--
--   1. seats_taken(), not a raw count — a player who cashed out mid-game is
--      not in a chair.                              (20260903040000)
--   2. app.join_as_waitlist — a link to a running game is a request, never
--      a seat.                                      (20260903050000)
--   3. app.overfill_seats — the admin may go over the limit, on purpose,
--      after being asked.                           (20260828020000)

create or replace function public.game_signups_before_update()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  g record;
  confirmed_count integer;
  overfill boolean :=
    coalesce(current_setting('app.overfill_seats', true), 'off') = 'on';
  as_waitlist boolean :=
    coalesce(current_setting('app.join_as_waitlist', true), 'off') = 'on';
begin
  perform pg_advisory_xact_lock(hashtext('game_signups'), hashtext(new.game_id::text));

  if new.status = 'withdrawn' and old.status <> 'withdrawn' then
    new.withdrawn_at := now();
    return new;
  end if;

  if old.status = 'withdrawn' and new.status <> 'withdrawn' then
    -- Re-joining goes to the back of the line and gets a computed status.
    select seat_limit into g from public.games where id = new.game_id;
    confirmed_count := public.seats_taken(new.game_id);            -- rule 1
    new.signup_order := (
      select coalesce(max(signup_order), 0) + 1
      from public.game_signups where game_id = new.game_id
    );
    new.status := case
      when as_waitlist then 'waitlist'                              -- rule 2
      when confirmed_count < g.seat_limit then 'confirmed'
      else 'waitlist'
    end::public.signup_status;
    new.withdrawn_at := null;
    return new;
  end if;

  if new.status = 'confirmed' and old.status = 'waitlist' and not overfill then  -- rule 3
    -- Promotion path (or a manual bump): only if a seat is actually free.
    select seat_limit into g from public.games where id = new.game_id;
    if public.seats_taken(new.game_id) >= g.seat_limit then       -- rule 1
      raise exception 'no seats available';
    end if;
  end if;

  return new;
end;
$$;

-- The RPC counted confirmed signups while the trigger counted seats_taken(),
-- so on an active game with a leaver the RPC could say "full" when the
-- trigger would have let the player through. One definition of a seat.
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
  seated integer;
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

  seated := public.seats_taken(p_game_id);

  if seated >= g.seat_limit and not p_allow_overfill then
    raise exception 'game is full: % of % seats taken', seated, g.seat_limit;
  end if;

  if p_allow_overfill then
    perform set_config('app.overfill_seats', 'on', true);
  end if;

  update public.game_signups set status = 'confirmed'
  where game_id = p_game_id and member_id = p_member_id;

  perform set_config('app.overfill_seats', 'off', true);

  -- Promoting into a running game seats them with nothing staked; the admin
  -- logs their buy-in with a tap like anyone else.
  return 'confirmed';
end;
$$;
