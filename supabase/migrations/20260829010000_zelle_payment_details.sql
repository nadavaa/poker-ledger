-- Zelle alongside Venmo.
--
-- A phone number is more sensitive than a Venmo handle: a handle is a payment
-- alias, a phone number reaches you. So it is never granted to `authenticated`
-- at all, on either table. RLS cannot make one column visible to some readers
-- and not others — it filters rows, not columns — so the enforcement is a
-- column grant that nobody has, plus a security-definer function that hands
-- the number only to the person who owes it, or the game admin.

alter table public.profiles
  add column phone_number text,
  add column preferred_payment_method text
    check (preferred_payment_method in ('venmo', 'zelle'));

-- The guest override, same shape as venmo_handle: an admin can put a number
-- on a member row for someone who has no account.
alter table public.group_members
  add column phone_number text;

-- One canonical stored format. Input is never stored as typed.
create or replace function public.normalize_us_phone(raw text)
returns text
language plpgsql immutable set search_path = ''
as $$
declare
  d text;
begin
  if raw is null then return null; end if;
  d := regexp_replace(raw, '[^0-9]', '', 'g');
  if d = '' then return null; end if;
  if length(d) = 11 and left(d, 1) = '1' then
    d := substr(d, 2);
  end if;
  if length(d) <> 10 then
    raise exception 'enter a 10-digit US phone number';
  end if;
  -- Neither the area code nor the exchange may start with 0 or 1.
  if substr(d, 1, 1) in ('0', '1') or substr(d, 4, 1) in ('0', '1') then
    raise exception 'that is not a valid US phone number';
  end if;
  return '+1' || d;
end;
$$;

-- ============ Column privileges ============
-- Restated rather than assumed: phone_number appears in neither list, so no
-- query by any signed-in user can read it from either table.

revoke select on public.profiles from authenticated;
grant select (id, display_name, avatar_url, venmo_handle)
  on public.profiles to authenticated;

revoke select on public.group_members from authenticated;
grant select (
  id, group_id, profile_id, display_name, role,
  claim_code, venmo_handle, is_active, created_at
) on public.group_members to authenticated;

-- ============ Reading your own ============

create or replace function public.my_payment_details()
returns table (
  venmo_handle text,
  phone_number text,
  preferred_payment_method text
)
language sql security definer stable set search_path = '' as $$
  select venmo_handle, phone_number, preferred_payment_method
  from public.profiles
  where id = (select auth.uid())
$$;

create or replace function public.set_my_payment_details(
  p_venmo_handle text,
  p_phone text,
  p_preferred text
) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  handle text;
  phone text;
begin
  if (select auth.uid()) is null then
    raise exception 'not authenticated';
  end if;
  if p_preferred is not null and p_preferred not in ('venmo', 'zelle') then
    raise exception 'unknown payment method %', p_preferred;
  end if;

  handle := nullif(trim(leading '@' from trim(coalesce(p_venmo_handle, ''))), '');
  phone := public.normalize_us_phone(
    nullif(trim(coalesce(p_phone, '')), '')
  );

  update public.profiles
  set venmo_handle = handle,
      phone_number = phone,
      preferred_payment_method = p_preferred
  where id = (select auth.uid());

  -- Mirrored onto every member row, because a plain member cannot write their
  -- own, and that is where the other player's screen reads from.
  update public.group_members
  set venmo_handle = handle,
      phone_number = phone
  where profile_id = (select auth.uid());
end;
$$;

-- ============ Reading someone else's, narrowly ============
-- One row per settlement the caller may act on: their own debts, or all of
-- them if they run the game. Everything else in the game is invisible here,
-- so a group mate cannot learn a number by asking for the wrong game.

create or replace function public.game_payment_details(p_game_id uuid)
returns table (
  settlement_id uuid,
  payee_member_id uuid,
  member_venmo text,
  profile_venmo text,
  member_phone text,
  profile_phone text,
  preferred text
)
language sql security definer stable set search_path = '' as $$
  select
    s.id,
    s.to_member_id,
    payee.venmo_handle,
    pp.venmo_handle,
    payee.phone_number,
    pp.phone_number,
    pp.preferred_payment_method
  from public.settlements s
  join public.games g on g.id = s.game_id
  join public.group_members payee on payee.id = s.to_member_id
  left join public.profiles pp on pp.id = payee.profile_id
  where s.game_id = p_game_id
    and (
      s.from_member_id = public.my_member_id(g.group_id)
      or public.can_admin_game(p_game_id)
    )
$$;

revoke execute on function
  public.my_payment_details(),
  public.set_my_payment_details(text, text, text),
  public.game_payment_details(uuid)
from anon;
