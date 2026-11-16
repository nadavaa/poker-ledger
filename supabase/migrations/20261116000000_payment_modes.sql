-- Payment modes: how a game's settlement gets paid.
--
--   online  every transfer goes over Venmo or Zelle (what the app did before)
--   cash    every transfer is cash at the table; no Venmo or Zelle buttons
--   hybrid  each player says cash or app for the night; a transfer is an app
--           transfer only when both sides pay by app, otherwise it is cash
--
-- The group holds the default and each game snapshots it at creation, like
-- the buy-in and chip ratio. The admin can change a game's mode until it is
-- settled. Nothing here moves money; it only decides what the transfer cards
-- offer.

create type public.payment_mode as enum ('online', 'cash', 'hybrid');
create type public.settlement_method as enum ('app', 'cash');

alter table public.groups
  add column payment_mode public.payment_mode not null default 'online';
alter table public.games
  add column payment_mode public.payment_mode not null default 'online';

-- Null means "use the default": app if the player has a Venmo handle or a
-- Zelle number, cash if not.
alter table public.game_signups
  add column pays_cash boolean;

alter table public.settlements
  add column method public.settlement_method not null default 'app';

-- The admin edits a game's mode through the same column grant as the other
-- settings. The existing update policy already refuses settled and
-- cancelled games, and only lets the game admin through.
grant update (payment_mode) on public.games to authenticated;
-- The group default goes with the other group defaults; the existing group
-- update policy decides who may change it.
grant update (payment_mode) on public.groups to authenticated;

-- ===================== create_game =====================
-- One new parameter. A different argument list is a different function in
-- Postgres, so the old one is dropped rather than left as an overload.

drop function public.create_game(
  timestamptz, uuid, text, text, text, integer, integer, numeric, boolean
);

create function public.create_game(
  p_scheduled_at timestamptz,
  p_group_id uuid default null,
  p_new_group_name text default null,
  p_name text default null,
  p_location text default null,
  p_seat_limit integer default null,
  p_buyin_cents integer default null,
  p_chips_per_dollar numeric default null,
  p_playing boolean default true,
  p_payment_mode public.payment_mode default null
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  gid uuid;
  mid uuid;
  grp record;
  v_game_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'not authenticated';
  end if;

  if p_group_id is not null then
    if not public.is_group_member(p_group_id) then
      raise exception 'not a member of this group';
    end if;
    gid := p_group_id;
  elsif coalesce(trim(p_new_group_name), '') <> '' then
    gid := public.create_group(p_new_group_name);
  else
    raise exception 'pick a group or name a new one';
  end if;

  select id into mid from public.group_members
  where group_id = gid and profile_id = (select auth.uid());

  select chips_per_dollar, default_buyin_cents, default_seat_limit, payment_mode
  into grp from public.groups where id = gid;

  if coalesce(p_seat_limit, grp.default_seat_limit) < 2 then
    raise exception 'seat limit must be at least 2';
  end if;

  insert into public.games (
    group_id, name, scheduled_at, location, seat_limit,
    default_buyin_cents, chips_per_dollar, payment_mode,
    admin_member_id, created_by_member_id
  ) values (
    gid,
    nullif(trim(coalesce(p_name, '')), ''),
    p_scheduled_at,
    nullif(trim(coalesce(p_location, '')), ''),
    coalesce(p_seat_limit, grp.default_seat_limit),
    coalesce(p_buyin_cents, grp.default_buyin_cents),
    coalesce(p_chips_per_dollar, grp.chips_per_dollar),
    coalesce(p_payment_mode, grp.payment_mode),
    mid, mid
  ) returning id into v_game_id;

  if p_playing then
    insert into public.game_signups (game_id, member_id)
    values (v_game_id, mid);
  end if;

  return v_game_id;
end;
$$;

revoke execute on function public.create_game(
  timestamptz, uuid, text, text, text, integer, integer, numeric, boolean,
  public.payment_mode
) from public, anon;
grant execute on function public.create_game(
  timestamptz, uuid, text, text, text, integer, integer, numeric, boolean,
  public.payment_mode
) to authenticated;

-- ===================== Each player's method =====================

-- What the settle step and the game screen need: each signed-up player's
-- method for tonight, with the default already applied. Only booleans come
-- back, so no handle or phone number leaves the database here.
create function public.game_payment_methods(p_game_id uuid)
returns table (member_id uuid, pays_cash boolean, has_app boolean, chosen boolean)
language sql security definer stable set search_path = ''
as $$
  select
    s.member_id,
    coalesce(s.pays_cash, not h.has_app),
    h.has_app,
    s.pays_cash is not null
  from public.game_signups s
  join public.games g on g.id = s.game_id
  join public.group_members m on m.id = s.member_id
  left join public.profiles p on p.id = m.profile_id
  cross join lateral (
    select (
      nullif(trim(coalesce(m.venmo_handle, '')), '') is not null
      or nullif(trim(coalesce(p.venmo_handle, '')), '') is not null
      or nullif(trim(coalesce(m.phone_number, '')), '') is not null
      or nullif(trim(coalesce(p.phone_number, '')), '') is not null
    ) as has_app
  ) h
  where s.game_id = p_game_id
    and s.status = 'confirmed'
    and public.is_group_member(g.group_id)
$$;

revoke execute on function public.game_payment_methods(uuid) from public, anon;
grant execute on function public.game_payment_methods(uuid) to authenticated;

-- A player sets their own method; the game admin sets anyone's (guests with
-- no account can't). Locked once the game is settled or cancelled.
create function public.set_pays_cash(
  p_game_id uuid,
  p_member_id uuid,
  p_pays_cash boolean
) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  g record;
begin
  select group_id, status into g from public.games where id = p_game_id;
  if g is null then
    raise exception 'game not found';
  end if;

  if not (
    public.can_admin_game(p_game_id)
    or public.my_member_id(g.group_id) = p_member_id
  ) then
    raise exception 'you can only change your own payment method';
  end if;

  if g.status in ('settled', 'cancelled') then
    raise exception 'this game is finished; payment methods are locked';
  end if;

  update public.game_signups
  set pays_cash = p_pays_cash
  where game_id = p_game_id and member_id = p_member_id;

  if not found then
    raise exception 'that player is not in this game';
  end if;
end;
$$;

revoke execute on function public.set_pays_cash(uuid, uuid, boolean) from public, anon;
grant execute on function public.set_pays_cash(uuid, uuid, boolean) to authenticated;

-- ===================== settle_game =====================
-- Same checks as before. New: each transfer carries a method, and the
-- database decides it for the two fixed modes rather than trusting the
-- caller. Only a hybrid game takes the method the solver chose.

create or replace function public.settle_game(
  p_game_id uuid,
  p_transfers jsonb
) returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  g record;
  missing integer;
  diff integer;
  bad integer;
  written integer;
begin
  if not public.can_admin_game(p_game_id) then
    raise exception 'only the game admin can settle';
  end if;

  select status, payment_mode into g from public.games where id = p_game_id;
  if g.status <> 'reconciling' then
    raise exception 'this game is not counting chips';
  end if;

  select count(*) into missing
  from public.game_nets(p_game_id) where not has_cashout;
  if missing > 0 then
    raise exception 'still waiting on % chip count(s)', missing;
  end if;

  select coalesce(sum(net_cents), 0) into diff from public.game_nets(p_game_id);
  if diff <> 0 then
    raise exception 'the count is off by %; resolve it first', diff;
  end if;

  create temporary table _transfers on commit drop as
  select (x ->> 'from')::uuid as from_id,
         (x ->> 'to')::uuid as to_id,
         (x ->> 'amount')::integer as amount,
         x ->> 'method' as method
  from jsonb_array_elements(coalesce(p_transfers, '[]'::jsonb)) x;

  select count(*) into bad from _transfers
  where amount is null or amount <= 0 or from_id = to_id
     or from_id is null or to_id is null;
  if bad > 0 then
    raise exception 'transfers must be positive amounts between two players';
  end if;

  select count(*) into bad from _transfers
  where method is not null and method not in ('app', 'cash');
  if bad > 0 then
    raise exception 'a transfer is paid by app or in cash';
  end if;

  select count(*) into bad from _transfers t
  where not exists (select 1 from public.game_nets(p_game_id) n where n.member_id = t.from_id)
     or not exists (select 1 from public.game_nets(p_game_id) n where n.member_id = t.to_id);
  if bad > 0 then
    raise exception 'transfers reference somebody who is not in this game';
  end if;

  select count(*) into bad
  from public.game_nets(p_game_id) n
  where n.net_cents
      - coalesce((select sum(amount) from _transfers where to_id = n.member_id), 0)
      + coalesce((select sum(amount) from _transfers where from_id = n.member_id), 0)
      <> 0;
  if bad > 0 then
    raise exception 'these transfers do not settle the game';
  end if;

  -- Only the poker rows. Food debts survive a re-settle untouched.
  delete from public.settlements
  where game_id = p_game_id and kind = 'poker';

  insert into public.settlements (
    game_id, from_member_id, to_member_id, amount_cents, kind, method
  )
  select p_game_id, from_id, to_id, amount, 'poker',
    case g.payment_mode
      when 'cash' then 'cash'
      when 'online' then 'app'
      else coalesce(method, 'app')
    end::public.settlement_method
  from _transfers;
  get diagnostics written = row_count;

  update public.games
  set status = 'settled', settled_at = now()
  where id = p_game_id;

  return written;
end;
$$;
