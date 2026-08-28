-- Phase 4: cashouts, the reconciliation gate, and settlements.

-- The SQL counterpart to chipsToCents() in lib/money.ts, alongside
-- cents_to_chips(). One home per runtime.
create or replace function public.chips_to_cents(
  p_chips integer,
  p_chips_per_dollar numeric
) returns integer
language sql immutable set search_path = '' as $$
  select round(p_chips * 100 / p_chips_per_dollar)::integer
$$;

create table public.cashouts (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games (id) on delete cascade,
  member_id uuid not null references public.group_members (id),
  chips integer not null check (chips >= 0),
  amount_cents integer not null,          -- computed on write from game ratio
  recorded_at timestamptz not null default now(),
  recorded_by_member_id uuid not null references public.group_members (id),
  unique (game_id, member_id)
);

create table public.game_adjustments (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games (id) on delete cascade,
  member_id uuid references public.group_members (id),   -- null = whole table
  amount_cents integer not null,
  reason text not null,
  created_at timestamptz not null default now(),
  created_by_member_id uuid not null references public.group_members (id)
);
create index on public.game_adjustments (game_id);

create type public.settlement_status as enum
  ('pending', 'paid', 'confirmed', 'deferred');

create table public.settlements (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games (id) on delete cascade,
  from_member_id uuid not null references public.group_members (id),
  to_member_id uuid not null references public.group_members (id),
  amount_cents integer not null check (amount_cents > 0),
  status public.settlement_status not null default 'pending',
  paid_at timestamptz,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  check (from_member_id <> to_member_id)
);
create index on public.settlements (game_id);
create index on public.settlements (from_member_id, status);

-- ============ RLS ============
-- Reads are open to the group. Every write goes through an RPC below, which
-- checks the game admin itself, so there are deliberately no write policies.

alter table public.cashouts enable row level security;

create policy "group members read cashouts"
  on public.cashouts for select to authenticated
  using (exists (
    select 1 from public.games g
    where g.id = cashouts.game_id and public.is_group_member(g.group_id)
  ));

alter table public.game_adjustments enable row level security;

create policy "group members read adjustments"
  on public.game_adjustments for select to authenticated
  using (exists (
    select 1 from public.games g
    where g.id = game_adjustments.game_id and public.is_group_member(g.group_id)
  ));

alter table public.settlements enable row level security;

create policy "group members read settlements"
  on public.settlements for select to authenticated
  using (exists (
    select 1 from public.games g
    where g.id = settlements.game_id and public.is_group_member(g.group_id)
  ));

-- ============ The arithmetic, in one place ============
-- Both the reconciliation screen and the settle gate read from here, so the
-- app and the database can never disagree about what someone is owed.

create or replace function public.game_nets(p_game_id uuid)
returns table (
  member_id uuid,
  display_name text,
  buyin_cents integer,
  cashout_cents integer,
  adjustment_cents integer,
  net_cents integer,
  has_cashout boolean
)
language sql security definer stable set search_path = '' as $$
  select
    gm.id,
    gm.display_name,
    coalesce(b.total, 0)::integer,
    coalesce(c.amount_cents, 0)::integer,
    coalesce(a.total, 0)::integer,
    (coalesce(c.amount_cents, 0) - coalesce(b.total, 0)
      + coalesce(a.total, 0))::integer,
    c.id is not null
  from public.game_signups gs
  join public.group_members gm on gm.id = gs.member_id
  left join lateral (
    select sum(amount_cents) as total from public.buyins
    where game_id = p_game_id and member_id = gs.member_id and voided_at is null
  ) b on true
  left join public.cashouts c
    on c.game_id = p_game_id and c.member_id = gs.member_id
  left join lateral (
    select sum(amount_cents) as total from public.game_adjustments
    where game_id = p_game_id and member_id = gs.member_id
  ) a on true
  where gs.game_id = p_game_id
    and gs.status = 'confirmed'
    and public.is_group_member((select group_id from public.games where id = p_game_id))
  order by gm.display_name
$$;

-- ============ Reconciliation ============

create or replace function public.begin_reconciliation(p_game_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  st public.game_status;
begin
  if not public.can_admin_game(p_game_id) then
    raise exception 'only the game admin can end the game';
  end if;
  select status into st from public.games where id = p_game_id;
  if st <> 'active' then
    raise exception 'only a running game can go to counting chips';
  end if;
  update public.games set status = 'reconciling' where id = p_game_id;
end;
$$;

create or replace function public.reopen_game(p_game_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  st public.game_status;
begin
  if not public.can_admin_game(p_game_id) then
    raise exception 'only the game admin can reopen the game';
  end if;
  select status into st from public.games where id = p_game_id;
  if st <> 'reconciling' then
    raise exception 'only a game being counted can reopen';
  end if;
  update public.games set status = 'active' where id = p_game_id;
end;
$$;

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
    game_id, member_id, chips, amount_cents, recorded_by_member_id
  ) values (
    p_game_id, p_member_id, p_chips,
    public.chips_to_cents(p_chips, g.chips_per_dollar), me
  )
  on conflict (game_id, member_id) do update
  set chips = excluded.chips,
      amount_cents = excluded.amount_cents,
      recorded_at = now(),
      recorded_by_member_id = excluded.recorded_by_member_id;
end;
$$;

-- The four resolutions from the spec. Each one replaces any previous
-- resolution, so re-counting a stack and resolving again is always sized to
-- the discrepancy as it stands right now.
--
-- All modes materialise per-player rows rather than leaving a table-level row
-- to be divided later: the split is then visible in the ledger, and nets sum
-- to zero by construction.
create or replace function public.resolve_discrepancy(
  p_game_id uuid,
  p_mode text,                       -- 'even' | 'player' | 'proportional'
  p_member_id uuid default null,
  p_reason text default null
) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  g record;
  me uuid;
  diff integer;
  total integer;
  ids uuid[];
  weights integer[];
  n integer;
  base integer;
  rem integer;
  step integer;
  weight_total bigint;
  allocated integer := 0;
  amt integer;
  i integer;
  reason text;
begin
  if not public.can_admin_game(p_game_id) then
    raise exception 'only the game admin can resolve the count';
  end if;

  select group_id, status into g from public.games where id = p_game_id;
  if g.status <> 'reconciling' then
    raise exception 'this game is not counting chips';
  end if;
  me := public.my_member_id(g.group_id);

  delete from public.game_adjustments where game_id = p_game_id;

  -- Every confirmed player, and what they are short or over by.
  select array_agg(member_id order by display_name),
         array_agg(buyin_cents order by display_name),
         count(*)
  into ids, weights, n
  from public.game_nets(p_game_id);

  if n = 0 then
    raise exception 'nobody is in this game';
  end if;

  select coalesce(sum(net_cents), 0) into diff from public.game_nets(p_game_id);
  if diff = 0 then
    return;   -- nothing to resolve
  end if;

  -- Adjustments must cancel the discrepancy exactly.
  total := -diff;
  reason := coalesce(nullif(trim(p_reason), ''), 'chip count discrepancy');

  if p_mode = 'player' then
    if p_member_id is null then
      raise exception 'pick the player who absorbs it';
    end if;
    if not (p_member_id = any(ids)) then
      raise exception 'that player is not in this game';
    end if;
    insert into public.game_adjustments (
      game_id, member_id, amount_cents, reason, created_by_member_id
    ) values (p_game_id, p_member_id, total, reason, me);

  elsif p_mode = 'even' then
    base := total / n;              -- truncates toward zero
    rem := total - base * n;
    step := case when total >= 0 then 1 else -1 end;
    for i in 1..n loop
      amt := base + case when i <= abs(rem) then step else 0 end;
      if amt <> 0 then
        insert into public.game_adjustments (
          game_id, member_id, amount_cents, reason, created_by_member_id
        ) values (p_game_id, ids[i], amt, reason, me);
      end if;
    end loop;

  elsif p_mode = 'proportional' then
    select coalesce(sum(w), 0) into weight_total from unnest(weights) w;
    if weight_total = 0 then
      -- Nobody bought in; proportional is meaningless, fall back to even.
      perform public.resolve_discrepancy(p_game_id, 'even', null, p_reason);
      return;
    end if;
    for i in 1..n loop
      if i = n then
        amt := total - allocated;   -- last player absorbs the rounding
      else
        amt := (total::bigint * weights[i] / weight_total)::integer;
      end if;
      allocated := allocated + amt;
      if amt <> 0 then
        insert into public.game_adjustments (
          game_id, member_id, amount_cents, reason, created_by_member_id
        ) values (p_game_id, ids[i], amt, reason, me);
      end if;
    end loop;

  else
    raise exception 'unknown resolution %', p_mode;
  end if;
end;
$$;

-- ============ Settling ============
-- The transfers are computed by lib/settle.ts, which is pure and tested. This
-- refuses anything that does not actually zero every player out, so a bad or
-- forged payload cannot write a wrong ledger.

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

  -- The reconciliation gate. Nothing settles while the table does not balance.
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

  -- Applying the transfers must leave every player on exactly zero.
  select count(*) into bad
  from public.game_nets(p_game_id) n
  where n.net_cents
      - coalesce((select sum(amount) from _transfers where to_id = n.member_id), 0)
      + coalesce((select sum(amount) from _transfers where from_id = n.member_id), 0)
      <> 0;
  if bad > 0 then
    raise exception 'these transfers do not settle the game';
  end if;

  delete from public.settlements where game_id = p_game_id;

  insert into public.settlements (game_id, from_member_id, to_member_id, amount_cents)
  select p_game_id, from_id, to_id, amount from _transfers;
  get diagnostics written = row_count;

  update public.games
  set status = 'settled', settled_at = now()
  where id = p_game_id;

  return written;
end;
$$;

revoke execute on function
  public.begin_reconciliation(uuid),
  public.reopen_game(uuid),
  public.record_cashout(uuid, uuid, integer),
  public.resolve_discrepancy(uuid, text, uuid, text),
  public.settle_game(uuid, jsonb)
from anon;
