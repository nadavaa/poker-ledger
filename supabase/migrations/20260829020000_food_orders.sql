-- Food orders: one person fronts the delivery, everyone who ate pays them
-- back. Settles as its own line item, never netted into the poker maths.

create type public.settlement_kind as enum ('poker', 'food');

alter table public.settlements
  add column kind public.settlement_kind not null default 'poker';

create table public.food_orders (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games (id) on delete cascade,
  paid_by_member_id uuid not null references public.group_members (id),
  description text,
  total_cents integer not null check (total_cents > 0),
  created_by_member_id uuid not null references public.group_members (id),
  created_at timestamptz not null default now()
);
create index on public.food_orders (game_id);

create table public.food_order_shares (
  id uuid primary key default gen_random_uuid(),
  food_order_id uuid not null references public.food_orders (id) on delete cascade,
  member_id uuid not null references public.group_members (id),
  share_cents integer not null check (share_cents >= 0),
  is_fixed boolean not null default false,
  unique (food_order_id, member_id)
);
create index on public.food_order_shares (food_order_id);

-- Ties a food settlement back to the order that produced it, so an edit can
-- regenerate exactly its own rows and deleting the order takes them with it.
alter table public.settlements
  add column food_order_id uuid references public.food_orders (id) on delete cascade;

-- ============ Who can see and touch an order ============

create or replace function public.can_see_food_order(oid uuid) returns boolean
language sql security definer stable set search_path = '' as $$
  select exists (
    select 1
    from public.food_orders o
    join public.games g on g.id = o.game_id
    where o.id = oid
      and (
        public.can_admin_game(o.game_id)
        or o.paid_by_member_id = public.my_member_id(g.group_id)
        or exists (
          select 1 from public.food_order_shares s
          where s.food_order_id = o.id
            and s.member_id = public.my_member_id(g.group_id)
        )
      )
  )
$$;

create or replace function public.can_edit_food_order(oid uuid) returns boolean
language sql security definer stable set search_path = '' as $$
  select exists (
    select 1
    from public.food_orders o
    join public.games g on g.id = o.game_id
    where o.id = oid
      and (
        public.can_admin_game(o.game_id)
        or o.created_by_member_id = public.my_member_id(g.group_id)
      )
  )
$$;

alter table public.food_orders enable row level security;

create policy "participants and the game admin read a food order"
  on public.food_orders for select to authenticated
  using (public.can_see_food_order(id));

create policy "a confirmed player adds their own order"
  on public.food_orders for insert to authenticated
  with check (
    exists (
      select 1 from public.games g
      where g.id = game_id
        and created_by_member_id = public.my_member_id(g.group_id)
        and (
          -- Paying for it yourself, or running the game and covering for
          -- whoever did.
          public.can_admin_game(game_id)
          or paid_by_member_id = public.my_member_id(g.group_id)
        )
    )
  );

create policy "the creator or the game admin edits an order"
  on public.food_orders for update to authenticated
  using (public.can_edit_food_order(id));

create policy "the creator or the game admin deletes an order"
  on public.food_orders for delete to authenticated
  using (public.can_edit_food_order(id));

alter table public.food_order_shares enable row level security;

create policy "read shares of an order you can see"
  on public.food_order_shares for select to authenticated
  using (public.can_see_food_order(food_order_id));

-- ============ Saving an order ============
-- Shares are computed by lib/split.ts and checked here, the same shape as
-- settle_game: the app does the arithmetic, the database refuses anything
-- that doesn't add up.

create or replace function public.save_food_order(
  p_game_id uuid,
  p_order_id uuid,
  p_paid_by uuid,
  p_description text,
  p_total_cents integer,
  p_shares jsonb
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  g record;
  me uuid;
  oid uuid;
  share_total integer;
  bad integer;
  confirmed_blocking integer;
begin
  select group_id, status into g from public.games where id = p_game_id;
  if g.group_id is null then
    raise exception 'game not found';
  end if;
  if g.status not in ('active', 'reconciling', 'settled') then
    raise exception 'this game is not open for food orders';
  end if;

  me := public.my_member_id(g.group_id);
  if me is null then
    raise exception 'you are not in this group';
  end if;

  if p_order_id is null then
    -- New: you pay for it, or you run the game.
    if p_paid_by <> me and not public.can_admin_game(p_game_id) then
      raise exception 'you can only add an order you paid for';
    end if;
  else
    if not public.can_edit_food_order(p_order_id) then
      raise exception 'only whoever added this order, or the game admin, can change it';
    end if;
    select count(*) into confirmed_blocking
    from public.settlements
    where food_order_id = p_order_id and status = 'confirmed';
    if confirmed_blocking > 0 then
      raise exception 'this order already has % confirmed payment(s); it cannot be changed', confirmed_blocking;
    end if;
  end if;

  if p_total_cents <= 0 then
    raise exception 'the total must be more than zero';
  end if;

  if not exists (
    select 1 from public.game_signups
    where game_id = p_game_id and member_id = p_paid_by and status = 'confirmed'
  ) then
    raise exception 'whoever paid has to be in the game';
  end if;

  create temporary table _shares on commit drop as
  select (x ->> 'member_id')::uuid as member_id,
         (x ->> 'share_cents')::integer as share_cents,
         coalesce((x ->> 'is_fixed')::boolean, false) as is_fixed
  from jsonb_array_elements(coalesce(p_shares, '[]'::jsonb)) x;

  select count(*) into bad from _shares
  where member_id is null or share_cents is null or share_cents < 0;
  if bad > 0 then
    raise exception 'every share needs a person and an amount of zero or more';
  end if;

  select count(*) into bad from _shares s
  where not exists (
    select 1 from public.game_signups gs
    where gs.game_id = p_game_id and gs.member_id = s.member_id
      and gs.status = 'confirmed'
  );
  if bad > 0 then
    raise exception 'everyone splitting this has to be in the game';
  end if;

  select coalesce(sum(share_cents), 0) into share_total from _shares;
  if share_total <> p_total_cents then
    raise exception 'the shares add up to % but the total is %',
      share_total, p_total_cents;
  end if;
  if (select count(*) from _shares) = 0 then
    raise exception 'pick at least one person to split this with';
  end if;

  if p_order_id is null then
    insert into public.food_orders (
      game_id, paid_by_member_id, description, total_cents,
      created_by_member_id
    ) values (
      p_game_id, p_paid_by, nullif(trim(coalesce(p_description, '')), ''),
      p_total_cents, me
    ) returning id into oid;
  else
    oid := p_order_id;
    update public.food_orders
    set paid_by_member_id = p_paid_by,
        description = nullif(trim(coalesce(p_description, '')), ''),
        total_cents = p_total_cents
    where id = oid;
    delete from public.food_order_shares where food_order_id = oid;
    delete from public.settlements where food_order_id = oid;
  end if;

  insert into public.food_order_shares (food_order_id, member_id, share_cents, is_fixed)
  select oid, member_id, share_cents, is_fixed from _shares;

  -- One settlement per person who owes the payer. The payer's own share and
  -- anyone down for nothing produce no row.
  insert into public.settlements (
    game_id, from_member_id, to_member_id, amount_cents, kind, food_order_id
  )
  select p_game_id, s.member_id, p_paid_by, s.share_cents, 'food', oid
  from _shares s
  where s.member_id <> p_paid_by and s.share_cents > 0;

  return oid;
end;
$$;

create or replace function public.delete_food_order(p_order_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  blocking integer;
begin
  if not public.can_edit_food_order(p_order_id) then
    raise exception 'only whoever added this order, or the game admin, can delete it';
  end if;

  select count(*) into blocking
  from public.settlements
  where food_order_id = p_order_id and status = 'confirmed';
  if blocking > 0 then
    raise exception 'this order already has % confirmed payment(s); it cannot be deleted', blocking;
  end if;

  -- Settlements cascade from the order.
  delete from public.food_orders where id = p_order_id;
end;
$$;

-- Named, so a blocked edit can say who has already paid rather than only how
-- many. Restricted to whoever may edit the order.
create or replace function public.food_order_confirmed_payers(p_order_id uuid)
returns table (display_name text, amount_cents integer)
language sql security definer stable set search_path = '' as $$
  select gm.display_name, s.amount_cents
  from public.settlements s
  join public.group_members gm on gm.id = s.from_member_id
  where s.food_order_id = p_order_id
    and s.status = 'confirmed'
    and public.can_edit_food_order(p_order_id)
$$;

-- ============ Keep poker settlement away from food ============
-- Re-settling a game must not touch the food rows: they are a separate debt
-- that happens to live in the same game.

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

  select status into g from public.games where id = p_game_id;
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
         (x ->> 'amount')::integer as amount
  from jsonb_array_elements(coalesce(p_transfers, '[]'::jsonb)) x;

  select count(*) into bad from _transfers
  where amount is null or amount <= 0 or from_id = to_id
     or from_id is null or to_id is null;
  if bad > 0 then
    raise exception 'transfers must be positive amounts between two players';
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

  insert into public.settlements (game_id, from_member_id, to_member_id, amount_cents, kind)
  select p_game_id, from_id, to_id, amount, 'poker' from _transfers;
  get diagnostics written = row_count;

  update public.games
  set status = 'settled', settled_at = now()
  where id = p_game_id;

  return written;
end;
$$;

revoke execute on function
  public.save_food_order(uuid, uuid, uuid, text, integer, jsonb),
  public.delete_food_order(uuid),
  public.food_order_confirmed_payers(uuid)
from anon;
