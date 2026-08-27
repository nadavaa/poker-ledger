-- Replaces the auto buy-in on join with an explicit stake at Start, and makes
-- removal take a player's money back out of the pot.
--
-- Why the change: a game often starts before everyone has arrived. Signing up
-- is a plan, not a seat at the table with chips in front of you. The admin
-- stakes whoever actually showed up when they hit Start, and adds the
-- stragglers as they walk in.

-- ============ Revert the auto buy-in on join ============

drop trigger if exists game_signups_sync_auto_buyin_insert on public.game_signups;
drop trigger if exists game_signups_sync_auto_buyin_update on public.game_signups;
drop function if exists public.game_signups_sync_auto_buyin();

-- Buy-ins created at Start are logged by the admin like any other, so the
-- system-created flag has nothing left to mark.
alter table public.buyins drop column if exists is_auto;

-- Back to always stamping the caller: there is no longer a trigger-created
-- buy-in that needs to bypass it.
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

-- ============ Leaving the game takes the money with it ============
-- Removal means they are not playing, whether or not the game has started, so
-- their stake comes back out of the pot. This is not the same event as
-- cashing out early: a player who played and left records a cashout and stays
-- in the settlement math.

create or replace function public.game_signups_void_buyins_on_leave()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if old.status = 'confirmed' and new.status <> 'confirmed' then
    update public.buyins
    set void_reason = 'removed from the game'
    where game_id = new.game_id
      and member_id = new.member_id
      and voided_at is null;
  end if;
  return null;
end;
$$;

create trigger game_signups_void_buyins_on_leave
  after update on public.game_signups
  for each row execute function public.game_signups_void_buyins_on_leave();

-- ============ Start the game, staking whoever is at the table ============

create or replace function public.start_game(
  p_game_id uuid,
  p_member_ids uuid[] default '{}'
) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  g record;
  m uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'not authenticated';
  end if;

  select group_id, status, default_buyin_cents, chips_per_dollar
  into g from public.games where id = p_game_id;
  if g.group_id is null then
    raise exception 'game not found';
  end if;

  if not public.can_admin_game(p_game_id) then
    raise exception 'only the game admin can start the game';
  end if;

  if g.status <> 'scheduled' then
    raise exception 'this game has already started';
  end if;

  update public.games
  set status = 'active', started_at = now()
  where id = p_game_id;

  foreach m in array coalesce(p_member_ids, '{}'::uuid[])
  loop
    if not exists (
      select 1 from public.game_signups
      where game_id = p_game_id and member_id = m and status = 'confirmed'
    ) then
      raise exception 'that player does not have a seat in this game';
    end if;

    insert into public.buyins (
      game_id, member_id, amount_cents, chips, created_by_member_id
    ) values (
      p_game_id, m, g.default_buyin_cents,
      public.cents_to_chips(g.default_buyin_cents, g.chips_per_dollar),
      m  -- overwritten with the caller by buyins_before_insert
    );
  end loop;
end;
$$;

revoke execute on function public.start_game(uuid, uuid[]) from anon;

-- Undo the previous migration's backfill: any stake created purely by signing
-- up, in a game that has not started, was never a real buy-in.
update public.buyins b
set void_reason = 'auto buy-in on join reverted'
from public.games g
where g.id = b.game_id
  and g.status = 'scheduled'
  and b.voided_at is null;
