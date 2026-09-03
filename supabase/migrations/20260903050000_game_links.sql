-- Shareable game links. One URL, pasted into WhatsApp, that takes someone
-- from "never heard of this app" to a seat — or to the waitlist, or to the
-- group with an explanation, depending on what the game is doing.
--
-- Everything happens in this one function, which means one transaction:
-- nobody can end up in the group but not in the game, or the other way
-- round. Every step is a no-op the second time, because the link will be
-- clicked five times by the same person and forwarded to people who are
-- already in.

-- A signup made through a link while the game is ALREADY RUNNING must never
-- seat itself. The GUC is set only by join_game_by_link below, so every
-- existing path — the admin's Add player, a normal RSVP — keeps computing
-- the status exactly as before.
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
    -- Turning up through a link to a live game is a request, not a seat.
    when coalesce(current_setting('app.join_as_waitlist', true), '') = 'on'
      then 'waitlist'
    when confirmed_count < g.seat_limit then 'confirmed'
    else 'waitlist'
  end::public.signup_status;
  new.withdrawn_at := null;
  return new;
end;
$$;

-- Same rule on the rejoin path. Without this, somebody who withdrew earlier
-- and then opened a link to the now-running game would be recomputed straight
-- back into a seat.
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
      when coalesce(current_setting('app.join_as_waitlist', true), '') = 'on'
        then 'waitlist'
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

create or replace function public.join_game_by_link(p_game_id uuid)
returns table (
  group_id uuid,
  group_name text,
  game_name text,
  scheduled_at timestamptz,
  game_status text,
  outcome text,
  waitlist_position integer
)
language plpgsql security definer set search_path = ''
as $$
declare
  g record;
  mid uuid;
  existing record;
  sign record;
  uname text;
  result text;
  pos integer;
begin
  if (select auth.uid()) is null then
    raise exception 'not authenticated';
  end if;

  select gm.id, gm.group_id, gm.status, gm.name, gm.scheduled_at, gr.name as gname
  into g
  from public.games gm
  join public.groups gr on gr.id = gm.group_id
  where gm.id = p_game_id;

  if g.id is null then
    raise exception 'game not found';
  end if;

  -- ---- Membership. Reactivate, never duplicate: the partial unique index on
  -- (group_id, profile_id) is the backstop, this is the intent.
  select id, is_active into existing
  from public.group_members
  where group_members.group_id = g.group_id
    and profile_id = (select auth.uid())
  order by created_at
  limit 1;

  if existing.id is not null then
    mid := existing.id;
    if not existing.is_active then
      update public.group_members set is_active = true where id = mid;
    end if;
  else
    select display_name into uname
    from public.profiles where id = (select auth.uid());

    insert into public.group_members (group_id, profile_id, display_name)
    values (g.group_id, (select auth.uid()), coalesce(uname, 'Player'))
    returning id into mid;
  end if;

  -- ---- The game itself.
  select id, status into sign
  from public.game_signups
  where game_id = p_game_id and member_id = mid;

  if sign.id is not null and sign.status <> 'withdrawn' then
    -- Already in. Straight through, no message, no second row.
    result := 'already';

  elsif g.status not in ('scheduled', 'active') then
    -- Finished, being counted, or called off. They keep the group membership
    -- so the next game's link is a no-op, but nobody is signed up for a game
    -- that is over.
    result := 'over';

  elsif g.status = 'active' then
    -- Money is on the table. A forwarded link does not get to seat anyone —
    -- this lands in the waitlist, which is the admin's approval queue.
    perform set_config('app.join_as_waitlist', 'on', true);
    if sign.id is null then
      insert into public.game_signups (game_id, member_id)
      values (p_game_id, mid);
    else
      update public.game_signups set status = 'waitlist' where id = sign.id;
    end if;
    perform set_config('app.join_as_waitlist', 'off', true);
    result := 'needs_approval';

  else
    -- Scheduled. The trigger decides seat or waitlist against the limit, so a
    -- link can never confirm somebody over it.
    if sign.id is null then
      insert into public.game_signups (game_id, member_id)
      values (p_game_id, mid);
    else
      update public.game_signups set status = 'waitlist' where id = sign.id;
    end if;

    select status::text into result
    from public.game_signups
    where game_id = p_game_id and member_id = mid;

    result := case when result = 'confirmed' then 'confirmed' else 'waitlisted' end;
  end if;

  if result in ('waitlisted', 'needs_approval') then
    select count(*)::integer into pos
    from public.game_signups s
    where s.game_id = p_game_id
      and s.status = 'waitlist'
      and s.signup_order <= (
        select signup_order from public.game_signups
        where game_id = p_game_id and member_id = mid
      );
  end if;

  return query select
    g.group_id, g.gname, g.name, g.scheduled_at, g.status::text, result, pos;
end;
$$;

revoke execute on function public.join_game_by_link(uuid) from anon;
