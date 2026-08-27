-- Admin adds a player to a game: an existing group member, or a guest who has
-- never used the app (spec edge case 3, late arrival).
--
-- A guest is not a special kind of row. They become an ordinary unclaimed
-- group_members record, so they get real history from their first hand and
-- can claim it later with a claim link.

create or replace function public.add_player_to_game(
  p_game_id uuid,
  p_member_id uuid default null,
  p_guest_name text default null
) returns text
language plpgsql security definer set search_path = ''
as $$
declare
  g record;
  mid uuid;
  existing record;
  final_status text;
begin
  if (select auth.uid()) is null then
    raise exception 'not authenticated';
  end if;

  select group_id, status into g from public.games where id = p_game_id;
  if g.group_id is null then
    raise exception 'game not found';
  end if;

  if not public.can_admin_game(p_game_id) then
    raise exception 'only the game admin can add players';
  end if;

  if g.status not in ('scheduled', 'active') then
    raise exception 'this game is closed';
  end if;

  if p_member_id is not null then
    if not exists (
      select 1 from public.group_members
      where id = p_member_id and group_id = g.group_id and is_active
    ) then
      raise exception 'pick an active member of this group';
    end if;
    mid := p_member_id;
  elsif coalesce(trim(p_guest_name), '') <> '' then
    -- Deliberate, narrow widening of who may create a member: running a game
    -- means being able to seat whoever walked in the door.
    insert into public.group_members (group_id, display_name)
    values (g.group_id, trim(p_guest_name))
    returning id into mid;
  else
    raise exception 'pick a member or name a guest';
  end if;

  select id, status into existing
  from public.game_signups
  where game_id = p_game_id and member_id = mid;

  if existing.id is null then
    -- Status is computed by the signup trigger: seated if there's room,
    -- waitlisted if there isn't.
    insert into public.game_signups (game_id, member_id)
    values (p_game_id, mid);
  elsif existing.status = 'withdrawn' then
    update public.game_signups set status = 'waitlist' where id = existing.id;
  else
    raise exception 'that player is already in this game';
  end if;

  select status::text into final_status
  from public.game_signups
  where game_id = p_game_id and member_id = mid;

  return final_status;
end;
$$;

revoke execute on function public.add_player_to_game(uuid, uuid, text) from anon;
