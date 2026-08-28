-- Deleting and cancelling a game.
--
-- A settled game feeds other players' stats and may carry unpaid settlements,
-- so deleting one silently rewrites someone else's numbers and can erase a
-- debt they are owed. The rules below are RLS policies rather than UI checks,
-- so that holds no matter what a user calls from devtools.

create or replace function public.is_group_owner(gid uuid) returns boolean
language sql security definer stable set search_path = '' as $$
  select exists (
    select 1 from public.group_members
    where group_id = gid and profile_id = (select auth.uid())
      and role = 'owner' and is_active
  )
$$;

-- Hard delete is only ever for a game that never happened: still scheduled,
-- no buy-ins, no settlements. Children cascade from here.
create policy "game admin deletes a game that never happened"
  on public.games for delete to authenticated
  using (
    public.can_admin_game(id)
    and status = 'scheduled'
    and not exists (
      select 1 from public.buyins b where b.game_id = games.id
    )
    and not exists (
      select 1 from public.settlements s
      where s.game_id = games.id and s.status in ('pending', 'paid')
    )
  );

-- The group owner's one power over someone else's game: calling it off. The
-- with-check clause means this policy can only ever produce a cancelled row,
-- so it is not a general write grant.
create policy "group owner may cancel a game"
  on public.games for update to authenticated
  using (
    public.is_group_owner(group_id)
    and status <> 'settled'
  )
  with check (status = 'cancelled');

-- Cancelling keeps everything: the roster, the buy-ins, the audit trail. It
-- just means no settlement will be computed.
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

  update public.games set status = 'cancelled' where id = p_game_id;
end;
$$;

revoke execute on function public.cancel_game(uuid) from anon;
