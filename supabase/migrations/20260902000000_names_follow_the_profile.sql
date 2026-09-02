-- A claimed member's name comes from their profile, not the snapshot.
--
-- group_members.display_name is written once when the row is created and never
-- updated, so changing your name in Settings changed nothing anyone else saw —
-- including on games already played. For an unclaimed member there is no
-- profile and the snapshot remains the only source.

create or replace view public.game_player_totals
with (security_invoker = true) as
select
  g.id                              as game_id,
  g.group_id                        as group_id,
  gm.id                             as member_id,
  coalesce(nullif(trim(p.display_name), ''), gm.display_name) as display_name,
  coalesce(b.buyin_cents, 0)::integer  as buyin_cents,
  coalesce(b.buyin_chips, 0)::integer  as buyin_chips,
  coalesce(b.buyin_count, 0)::integer  as buyin_count,
  c.amount_cents                    as cashout_cents,
  c.chips                           as cashout_chips,
  coalesce(a.adjustment_cents, 0)::integer as adjustment_cents,
  (coalesce(c.amount_cents, 0)
    - coalesce(b.buyin_cents, 0)
    + coalesce(a.adjustment_cents, 0))::integer as net_cents
from public.games g
join public.game_signups s on s.game_id = g.id and s.status = 'confirmed'
join public.group_members gm on gm.id = s.member_id
left join public.profiles p on p.id = gm.profile_id
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
