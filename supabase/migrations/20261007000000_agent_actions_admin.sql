-- Agent markers for the game-admin actions (phase 3): a game created, edited
-- or cancelled, a player added or seated, a transfer closed out.
--
-- Same rule as the player actions: the label is written only after the action
-- has committed, and only if the table says it really happened to the caller.
-- Where a timestamp exists (a created game, a game_edits row, a transfer's
-- confirmed_at) recency is checked too. Where none does (adding, seating,
-- cancelling) the check is that the caller is the person allowed to do it and
-- the state is as claimed, and a repeat inside a minute is ignored.

-- ============ 1. The table learns the new kinds ============

alter table public.agent_actions
  add column target_member_id uuid references public.group_members(id) on delete cascade;

-- The constraints were unnamed and numbered by Postgres. Drop whatever check
-- constraints are there and state them by name.
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.agent_actions'::regclass and contype = 'c'
  loop
    execute format('alter table public.agent_actions drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.agent_actions
  add constraint agent_actions_action_known check (action in (
    'joined', 'withdrew', 'marked_paid', 'confirmed_received',
    'created_game', 'edited_game', 'added_player', 'seated_player',
    'cancelled_game', 'closed_out'
  )),
  add constraint agent_actions_transfer_shape check (
    (action in ('marked_paid', 'confirmed_received', 'closed_out')) = (settlement_id is not null)
  ),
  add constraint agent_actions_signup_shape check (
    (action in ('joined', 'withdrew')) = (signup_order is not null)
  ),
  add constraint agent_actions_target_shape check (
    (action in ('added_player', 'seated_player')) = (target_member_id is not null)
  );

-- A game is created once and cancelled once.
create unique index agent_actions_game_once
  on public.agent_actions (game_id, action)
  where action in ('created_game', 'cancelled_game');

-- ============ 2. Recording, with each action checked ============
-- The signature gains a target, so the old function goes. Callers that pass
-- (p_action, p_game_id) or (p_action, p_settlement_id) by name resolve to
-- this one through the defaults.

drop function public.record_agent_action(text, uuid, uuid);

create or replace function public.record_agent_action(
  p_action text,
  p_game_id uuid default null,
  p_settlement_id uuid default null,
  p_target_member_id uuid default null
) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  gid uuid;
  grp uuid;
  mid uuid;
  sg record;
  st record;
  gm record;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  -- ---------------------------------------------- transfers
  if p_action in ('marked_paid', 'confirmed_received', 'closed_out') then
    select s.id, s.game_id, s.from_member_id, s.to_member_id, s.status,
           s.paid_at, s.confirmed_at, s.confirmed_by_member_id
      into st
    from public.settlements s where s.id = p_settlement_id;
    if st.id is null then
      raise exception 'no such transfer';
    end if;
    gid := st.game_id;
    select group_id into grp from public.games where id = gid;
    mid := public.my_member_id(grp);
    if mid is null then
      raise exception 'not a member of that group';
    end if;

    if p_action = 'marked_paid' then
      if not (st.from_member_id = mid
              and st.status in ('paid', 'confirmed')
              and st.paid_at > now() - interval '5 minutes') then
        raise exception 'that payment was not just marked paid by you';
      end if;
    elsif p_action = 'confirmed_received' then
      if not (st.to_member_id = mid
              and st.status = 'confirmed'
              and st.confirmed_by_member_id = mid
              and st.confirmed_at > now() - interval '5 minutes') then
        raise exception 'that payment was not just confirmed by you';
      end if;
    else
      -- Closed out by the game admin, who is neither side of it.
      if not (public.can_admin_game(gid)
              and mid not in (st.from_member_id, st.to_member_id)
              and st.status = 'confirmed'
              and st.confirmed_by_member_id = mid
              and st.confirmed_at > now() - interval '5 minutes') then
        raise exception 'that payment was not just closed out by you';
      end if;
    end if;

    insert into public.agent_actions (profile_id, member_id, game_id, settlement_id, action)
    values (uid, mid, gid, p_settlement_id, p_action)
    on conflict do nothing;
    return;
  end if;

  -- ---------------------------------------------- signups
  if p_action in ('joined', 'withdrew') then
    select group_id into grp from public.games where id = p_game_id;
    if grp is null then
      raise exception 'no such game';
    end if;
    mid := public.my_member_id(grp);
    if mid is null then
      raise exception 'not a member of that group';
    end if;

    select s.status, s.signup_order, s.withdrawn_at into sg
    from public.game_signups s
    where s.game_id = p_game_id and s.member_id = mid;
    if sg.signup_order is null then
      raise exception 'you are not signed up for that game';
    end if;

    if p_action = 'joined' then
      if sg.status not in ('confirmed', 'waitlist') then
        raise exception 'you are not signed up for that game';
      end if;
    else
      if not (sg.status = 'withdrawn' and sg.withdrawn_at > now() - interval '5 minutes') then
        raise exception 'you did not just withdraw from that game';
      end if;
    end if;

    insert into public.agent_actions (profile_id, member_id, game_id, signup_order, action)
    values (uid, mid, p_game_id, sg.signup_order, p_action)
    on conflict do nothing;
    return;
  end if;

  -- ---------------------------------------------- admin actions on a game
  if p_action in ('created_game', 'edited_game', 'added_player', 'seated_player', 'cancelled_game') then
    select id, group_id, status, created_by_member_id, created_at into gm
    from public.games where id = p_game_id;
    if gm.id is null then
      raise exception 'no such game';
    end if;
    mid := public.my_member_id(gm.group_id);
    if mid is null then
      raise exception 'not a member of that group';
    end if;

    if p_action = 'created_game' then
      if not (gm.created_by_member_id = mid and gm.created_at > now() - interval '5 minutes') then
        raise exception 'you did not just create that game';
      end if;

    elsif p_action = 'edited_game' then
      if not exists (
        select 1 from public.game_edits e
        where e.game_id = p_game_id
          and e.edited_by_member_id = mid
          and e.created_at > now() - interval '5 minutes'
      ) then
        raise exception 'you did not just edit that game';
      end if;

    elsif p_action = 'cancelled_game' then
      if not (gm.status = 'cancelled'
              and (public.can_admin_game(p_game_id) or public.is_group_owner(gm.group_id))) then
        raise exception 'you did not cancel that game';
      end if;

    else
      -- added_player / seated_player: the game admin, and a real signup.
      if not public.can_admin_game(p_game_id) then
        raise exception 'only the game admin does that';
      end if;
      select s.status into sg
      from public.game_signups s
      where s.game_id = p_game_id and s.member_id = p_target_member_id;
      if sg.status is null
         or (p_action = 'added_player' and sg.status = 'withdrawn')
         or (p_action = 'seated_player' and sg.status <> 'confirmed') then
        raise exception 'that player is not in the state you described';
      end if;
    end if;

    -- A retry of the label inside a minute is the same label.
    if p_action in ('edited_game', 'added_player', 'seated_player') and exists (
      select 1 from public.agent_actions a
      where a.game_id = p_game_id and a.action = p_action and a.member_id = mid
        and a.target_member_id is not distinct from p_target_member_id
        and a.created_at > now() - interval '1 minute'
    ) then
      return;
    end if;

    insert into public.agent_actions (profile_id, member_id, game_id, target_member_id, action)
    values (uid, mid, p_game_id, p_target_member_id, p_action)
    on conflict do nothing;
    return;
  end if;

  raise exception 'unknown action';
end;
$$;

revoke execute on function public.record_agent_action(text, uuid, uuid, uuid) from public, anon;
grant execute on function public.record_agent_action(text, uuid, uuid, uuid) to authenticated;
