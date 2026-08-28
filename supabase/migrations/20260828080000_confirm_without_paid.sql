-- The payee can close a transfer out alone.
--
-- Requiring the payer to mark paid first assumed the money moves through the
-- app. It doesn't: people settle in cash at the table, or the payer simply
-- forgets to tap. The person who is owed knows better than anyone whether
-- they were paid, so let them confirm straight from pending.

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
    -- From pending or from paid: the payee is the authority on whether the
    -- money arrived, however it arrived.
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
