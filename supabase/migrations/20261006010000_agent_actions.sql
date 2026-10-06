-- A record that an AI agent did something on a player's behalf.
--
-- The app's trust model is that every money-related action is visible: every
-- buy-in shows who logged it, and an admin logging their own gets a marker.
-- An agent acting for a player is the same kind of fact. This table is what
-- the screens read to say "via AI agent" next to a signup, a withdrawal, a
-- payment marked paid, or one confirmed received.
--
-- Append-only, and written only through record_agent_action(), which checks
-- that the thing it is being asked to record actually happened — so a marker
-- cannot be made up for an action that did not occur. The action itself goes
-- through the ordinary tables and triggers; this only labels it.

create table public.agent_actions (
  id            bigint generated always as identity primary key,
  profile_id    uuid not null references public.profiles(id) on delete cascade,
  member_id     uuid not null references public.group_members(id) on delete cascade,
  game_id       uuid not null references public.games(id) on delete cascade,
  settlement_id uuid references public.settlements(id) on delete cascade,
  -- For a signup action: which signup. A rejoin gets a new signup_order, so a
  -- marker on the old signup never labels the new one.
  signup_order  integer,
  action        text not null check (action in ('joined', 'withdrew', 'marked_paid', 'confirmed_received')),
  created_at    timestamptz not null default now(),
  check ((action in ('marked_paid', 'confirmed_received')) = (settlement_id is not null)),
  check ((action in ('joined', 'withdrew')) = (signup_order is not null))
);

create index agent_actions_game on public.agent_actions (game_id, created_at desc);
create unique index agent_actions_signup_once
  on public.agent_actions (member_id, game_id, action, signup_order)
  where signup_order is not null;
create unique index agent_actions_transfer_once
  on public.agent_actions (settlement_id, action)
  where settlement_id is not null;

alter table public.agent_actions enable row level security;
revoke all on public.agent_actions from public, anon, authenticated;
grant select on public.agent_actions to authenticated;
grant select on public.agent_actions to service_role;
-- No insert, update or delete for anyone but the definer function below.

-- Signups are visible to the whole group, like the roster itself.
create policy "group members read signup markers"
  on public.agent_actions for select to authenticated
  using (
    settlement_id is null
    and public.is_group_member(
      (select g.group_id from public.games g where g.id = agent_actions.game_id)
    )
  );

-- A payment marker is visible to exactly the people who can see the payment:
-- the subquery runs under the settlements policy, so the two parties and the
-- game admin. It must never reveal who owes whom to anyone else.
create policy "people who can see a transfer read its markers"
  on public.agent_actions for select to authenticated
  using (
    settlement_id is not null
    and exists (select 1 from public.settlements s where s.id = agent_actions.settlement_id)
  );

create or replace function public.record_agent_action(
  p_action text,
  p_game_id uuid default null,
  p_settlement_id uuid default null
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
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  if p_action in ('marked_paid', 'confirmed_received') then
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

    -- Only record what the table says just happened, to this caller.
    if p_action = 'marked_paid' then
      if not (st.from_member_id = mid
              and st.status in ('paid', 'confirmed')
              and st.paid_at > now() - interval '5 minutes') then
        raise exception 'that payment was not just marked paid by you';
      end if;
    else
      if not (st.to_member_id = mid
              and st.status = 'confirmed'
              and st.confirmed_by_member_id = mid
              and st.confirmed_at > now() - interval '5 minutes') then
        raise exception 'that payment was not just confirmed by you';
      end if;
    end if;

    insert into public.agent_actions (profile_id, member_id, game_id, settlement_id, action)
    values (uid, mid, gid, p_settlement_id, p_action)
    on conflict do nothing;
    return;
  end if;

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

  raise exception 'unknown action';
end;
$$;

revoke execute on function public.record_agent_action(text, uuid, uuid) from public, anon;
grant execute on function public.record_agent_action(text, uuid, uuid) to authenticated;
