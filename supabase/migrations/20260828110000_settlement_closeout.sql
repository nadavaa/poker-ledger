-- Closing out a payment nobody acknowledged.
--
-- The handshake assumes both people use the app. Plenty won't: an unclaimed
-- guest has no account at all, and a player who does can simply never open
-- it. Without an escape hatch those rows sit pending forever and the game
-- never reads as finished.
--
-- So the game admin can close a transfer out. Who did it is recorded, and
-- the screen says "closed out by Gilad" rather than pretending the payee
-- confirmed — the control on this is visibility, not permission.

alter table public.settlements
  add column confirmed_by_member_id uuid references public.group_members (id);

create or replace function public.settlements_enforce_handshake()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid;
begin
  if new.game_id is distinct from old.game_id
     or new.from_member_id is distinct from old.from_member_id
     or new.to_member_id is distinct from old.to_member_id
     or new.amount_cents is distinct from old.amount_cents then
    raise exception 'who owes what was decided at settlement; it cannot be edited';
  end if;

  if new.status = old.status then
    return new;
  end if;

  me := public.my_member_id(
    (select group_id from public.games where id = new.game_id)
  );

  if old.status = 'confirmed' then
    raise exception 'this payment is already confirmed';
  end if;

  if new.status = 'paid' then
    if old.status <> 'pending' then
      raise exception 'only a pending payment can be marked paid';
    end if;
    if me is distinct from old.from_member_id then
      raise exception 'only the payer can mark this paid';
    end if;
    new.paid_at := now();
    new.confirmed_at := null;
    return new;
  end if;

  if new.status = 'pending' then
    if old.status <> 'paid' then
      raise exception 'only a paid payment can go back to pending';
    end if;
    if me is distinct from old.from_member_id then
      raise exception 'only the payer can undo this';
    end if;
    new.paid_at := null;
    return new;
  end if;

  if new.status = 'confirmed' then
    -- The payee, from pending or paid, however the money actually moved. Or
    -- the game admin closing out a payment that was never acknowledged —
    -- but never their own debt, which would let them confirm themselves.
    if me is distinct from old.to_member_id
       and not (
         public.can_admin_game(new.game_id) and me is distinct from old.from_member_id
       ) then
      raise exception 'only the person being paid, or the game admin closing it out, can confirm this';
    end if;
    new.confirmed_at := now();
    new.confirmed_by_member_id := me;
    return new;
  end if;

  -- 'deferred' is not used: a debt is closed in the game it came from.
  raise exception 'settlement status % is not supported yet', new.status;
end;
$$;

-- The admin needs to reach rows they are not party to in order to close them.
drop policy if exists "a party may move an open settlement along"
  on public.settlements;

create policy "a party or the game admin may move an open settlement along"
  on public.settlements for update to authenticated
  using (
    status <> 'confirmed'
    and (
      public.can_admin_game(game_id)
      or from_member_id = public.my_member_id(
        (select g.group_id from public.games g where g.id = settlements.game_id)
      )
      or to_member_id = public.my_member_id(
        (select g.group_id from public.games g where g.id = settlements.game_id)
      )
    )
  )
  with check (
    public.can_admin_game(game_id)
    or from_member_id = public.my_member_id(
      (select g.group_id from public.games g where g.id = settlements.game_id)
    )
    or to_member_id = public.my_member_id(
      (select g.group_id from public.games g where g.id = settlements.game_id)
    )
  );
