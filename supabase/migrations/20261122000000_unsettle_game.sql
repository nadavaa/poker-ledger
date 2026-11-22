-- Unsettling a game.
--
-- Somebody's buy-in was logged twice, a stack was miscounted, and the game is
-- already settled. Until now the only fix was arguing in the group chat. The
-- game admin can now take a settled game back to counting chips, fix it with
-- the tools that already exist (Resume Game for buy-ins, the chip fields for
-- counts), and settle again.
--
-- What makes this safe, rule by rule:
--
-- 1. Confirmed payments are never erased. Money that moved stays recorded.
--    When the game settles again, confirmed poker transfers are applied to
--    the corrected nets first and the new transfers cover only what is still
--    owed (lib/settle.ts remainingNets). settle_game() checks that the
--    confirmed rows plus the new ones zero every player out, so a caller
--    that forgets them is refused.
--
-- 2. A payment marked paid but not yet confirmed blocks the unsettle. The
--    payer says money moved and the payee hasn't said it arrived; deleting
--    that row could make somebody pay twice. Either side resolves it first:
--    the payee confirms (or the admin closes it out), or the payer undoes it.
--
-- 3. Pending payments are deleted on unsettle, so nobody pays a number that
--    is about to change.
--
-- 4. Food debts are untouched. They were never part of the poker maths.
--
-- 5. A reason is required and recorded in game_edits, and the screen shows
--    it to every player. One person can rewrite a settled result; the
--    control on that is that everyone can see they did and why.
--
-- 6. A reopened game with confirmed poker payments cannot be cancelled.
--    Money changed hands on its result; it has to settle again.

-- ============ unsettle_game ============

create function public.unsettle_game(p_game_id uuid, p_reason text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  g record;
  me uuid;
  reason text := nullif(trim(coalesce(p_reason, '')), '');
  stuck record;
begin
  if not public.can_admin_game(p_game_id) then
    raise exception 'only the game admin can unsettle the game';
  end if;

  -- Lock the game so two unsettles, or an unsettle and a settle, can't
  -- interleave.
  select group_id, status into g
  from public.games where id = p_game_id
  for update;

  if g.status <> 'settled' then
    raise exception 'only a settled game can be unsettled';
  end if;
  if reason is null then
    raise exception 'say why the game is being unsettled; every player sees it';
  end if;
  if length(reason) > 200 then
    raise exception 'keep the reason under 200 characters';
  end if;

  -- Lock the poker rows too, so a payer can't mark one paid between the
  -- check below and the delete.
  perform 1 from public.settlements
  where game_id = p_game_id and kind = 'poker'
  for update;

  select s.amount_cents,
         coalesce(f.display_name, 'Someone') as from_name,
         coalesce(t.display_name, 'someone') as to_name
  into stuck
  from public.settlements s
  left join public.group_members f on f.id = s.from_member_id
  left join public.group_members t on t.id = s.to_member_id
  where s.game_id = p_game_id and s.kind = 'poker' and s.status = 'paid'
  order by s.amount_cents desc
  limit 1;

  if found then
    raise exception
      '% marked a payment to % as paid. % confirms it (or you close it out), or % undoes it, before the game can be unsettled.',
      stuck.from_name, stuck.to_name, stuck.to_name, stuck.from_name;
  end if;

  me := public.my_member_id(g.group_id);

  delete from public.settlements
  where game_id = p_game_id and kind = 'poker' and status = 'pending';

  update public.games
  set status = 'reconciling', settled_at = null
  where id = p_game_id;

  insert into public.game_edits (game_id, edited_by_member_id, field, old_value, new_value)
  values (p_game_id, me, 'unsettled', 'settled', reason);
end;
$$;

revoke execute on function public.unsettle_game(uuid, text) from public, anon;
grant execute on function public.unsettle_game(uuid, text) to authenticated;

-- ============ settle_game ============
-- Same checks as 20261116000000_payment_modes.sql, plus confirmed payments
-- from before an unsettle count toward zeroing each player out, and only
-- pending poker rows are replaced. Confirmed rows are never deleted.

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
  orphan record;
begin
  if not public.can_admin_game(p_game_id) then
    raise exception 'only the game admin can settle';
  end if;

  select status, payment_mode into g
  from public.games where id = p_game_id
  for update;
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

  -- unsettle_game() refuses while one of these exists, so this only fires
  -- if something went around it.
  select count(*) into bad from public.settlements
  where game_id = p_game_id and kind = 'poker' and status = 'paid';
  if bad > 0 then
    raise exception 'a payment is marked paid but not confirmed; resolve it first';
  end if;

  -- Somebody who already paid or was paid has to still be in the game, or
  -- their money has nowhere to land.
  select coalesce(gm.display_name, 'Someone') as name into orphan
  from public.settlements s
  cross join lateral (values (s.from_member_id), (s.to_member_id)) p(member_id)
  left join public.group_members gm on gm.id = p.member_id
  where s.game_id = p_game_id and s.kind = 'poker' and s.status = 'confirmed'
    and not exists (
      select 1 from public.game_nets(p_game_id) n where n.member_id = p.member_id
    )
  limit 1;
  if found then
    raise exception
      '% has a confirmed payment in this game; put them back in the game before settling', orphan.name;
  end if;

  -- Two settles in one transaction would otherwise collide here.
  drop table if exists pg_temp._transfers;
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

  -- Confirmed payments and the new transfers together must zero everyone.
  select count(*) into bad
  from public.game_nets(p_game_id) n
  where n.net_cents
      - coalesce((select sum(amount) from _transfers where to_id = n.member_id), 0)
      + coalesce((select sum(amount) from _transfers where from_id = n.member_id), 0)
      - coalesce((select sum(amount_cents) from public.settlements
                  where game_id = p_game_id and kind = 'poker' and status = 'confirmed'
                    and to_member_id = n.member_id), 0)
      + coalesce((select sum(amount_cents) from public.settlements
                  where game_id = p_game_id and kind = 'poker' and status = 'confirmed'
                    and from_member_id = n.member_id), 0)
      <> 0;
  if bad > 0 then
    raise exception 'these transfers do not settle the game';
  end if;

  -- Only pending poker rows. Confirmed payments and food debts stay.
  delete from public.settlements
  where game_id = p_game_id and kind = 'poker' and status = 'pending';

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

-- ============ cancel_game ============
-- Same as 20260828030000_delete_and_cancel_game.sql, plus rule 6 above.

create or replace function public.cancel_game(p_game_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  g record;
  blocking integer;
begin
  if (select auth.uid()) is null then
    raise exception 'not authenticated';
  end if;

  select group_id, status into g from public.games where id = p_game_id;
  if g.group_id is null then
    raise exception 'game not found';
  end if;

  if not (public.can_admin_game(p_game_id) or public.is_group_owner(g.group_id))
  then
    raise exception 'only the game admin or the group owner can cancel a game';
  end if;

  if g.status = 'settled' then
    raise exception 'a settled game cannot be cancelled; it holds results other players depend on';
  end if;
  if g.status = 'cancelled' then
    return;   -- already cancelled
  end if;

  select count(*) into blocking
  from public.settlements
  where game_id = p_game_id and status in ('pending', 'paid');
  if blocking > 0 then
    raise exception 'this game has % unpaid settlement(s); resolve them first', blocking;
  end if;

  if exists (
    select 1 from public.settlements
    where game_id = p_game_id and kind = 'poker' and status = 'confirmed'
  ) then
    raise exception 'payments on this game''s result were already confirmed; settle it again instead of cancelling';
  end if;

  update public.games set status = 'cancelled' where id = p_game_id;
end;
$$;
