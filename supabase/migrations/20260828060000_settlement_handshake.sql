-- The two-party handshake: the payer marks paid, the payee confirms received.
-- Neither can do the other's half, and that is enforced here rather than by
-- which button each of them is shown.

create policy "a party may move their own settlement along"
  on public.settlements for update to authenticated
  using (
    from_member_id = public.my_member_id(
      (select g.group_id from public.games g where g.id = settlements.game_id)
    )
    or to_member_id = public.my_member_id(
      (select g.group_id from public.games g where g.id = settlements.game_id)
    )
  );

-- The policy says who may touch the row at all. This says what a touch is
-- allowed to do: RLS can see the old row or the new one, but not compare
-- them, and every rule here is about the transition.
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
    -- Undo a mistaken "paid", but only by the person who claimed it.
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
    if old.status <> 'paid' then
      raise exception 'the payer has not marked this paid yet';
    end if;
    if me is distinct from old.to_member_id then
      raise exception 'only the person being paid can confirm this';
    end if;
    new.confirmed_at := now();
    return new;
  end if;

  -- 'deferred' rolls into the next game's inputs; that is Phase 6.
  raise exception 'settlement status % is not supported yet', new.status;
end;
$$;

create trigger settlements_enforce_handshake
  before update on public.settlements
  for each row execute function public.settlements_enforce_handshake();

-- A Venmo link is only useful if the other person's handle is on their member
-- row, and a plain member cannot edit that row. This lets someone set their
-- own handle everywhere they play, without granting them any other write.
create or replace function public.set_my_venmo_handle(p_handle text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  clean text;
begin
  if (select auth.uid()) is null then
    raise exception 'not authenticated';
  end if;

  clean := nullif(trim(leading '@' from trim(coalesce(p_handle, ''))), '');

  update public.profiles set venmo_handle = clean where id = (select auth.uid());
  update public.group_members
  set venmo_handle = clean
  where profile_id = (select auth.uid());
end;
$$;

revoke execute on function public.set_my_venmo_handle(text) from anon;
