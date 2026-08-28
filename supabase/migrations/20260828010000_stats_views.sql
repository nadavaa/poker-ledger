-- Per-game and lifetime stats, for the group and home screens.
--
-- game_player_totals is now the single row-level definition of a player's
-- money in a game; game_nets() is rewritten as a thin wrapper over it so the
-- settle gate and the screens cannot drift apart.

create or replace view public.game_player_totals
with (security_invoker = true) as
select
  g.id                              as game_id,
  g.group_id                        as group_id,
  gm.id                             as member_id,
  gm.display_name                   as display_name,
  coalesce(b.buyin_cents, 0)::integer  as buyin_cents,
  coalesce(b.buyin_chips, 0)::integer  as buyin_chips,
  coalesce(b.buyin_count, 0)::integer  as buyin_count,
  c.amount_cents                    as cashout_cents,   -- null = not counted
  c.chips                           as cashout_chips,
  coalesce(a.adjustment_cents, 0)::integer as adjustment_cents,
  (coalesce(c.amount_cents, 0)
    - coalesce(b.buyin_cents, 0)
    + coalesce(a.adjustment_cents, 0))::integer as net_cents
from public.games g
join public.game_signups s on s.game_id = g.id and s.status = 'confirmed'
join public.group_members gm on gm.id = s.member_id
left join lateral (
  select sum(amount_cents) as buyin_cents,
         sum(chips)        as buyin_chips,
         count(*)          as buyin_count
  from public.buyins
  where game_id = g.id and member_id = gm.id and voided_at is null
) b on true
left join public.cashouts c on c.game_id = g.id and c.member_id = gm.id
left join lateral (
  select sum(amount_cents) as adjustment_cents
  from public.game_adjustments
  where game_id = g.id and member_id = gm.id
) a on true;

-- Lifetime is per group: your net with the Tuesday crew and your net with the
-- college friends are separate numbers that never merge. Only settled games
-- count, because a game in progress would read as a loss the size of the
-- buy-ins.
create or replace view public.member_lifetime
with (security_invoker = true) as
select
  t.group_id,
  t.member_id,
  t.display_name,
  count(*) filter (where g.status = 'settled')::integer as games_played,
  coalesce(
    sum(t.net_cents) filter (where g.status = 'settled'), 0
  )::integer as lifetime_net_cents
from public.game_player_totals t
join public.games g on g.id = t.game_id
group by t.group_id, t.member_id, t.display_name;

-- Same numbers the screens read, with the membership check the gate needs.
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
    t.member_id,
    t.display_name,
    t.buyin_cents,
    coalesce(t.cashout_cents, 0)::integer,
    t.adjustment_cents,
    t.net_cents,
    t.cashout_cents is not null
  from public.game_player_totals t
  where t.game_id = p_game_id
    and public.is_group_member(t.group_id)
  order by t.display_name
$$;
