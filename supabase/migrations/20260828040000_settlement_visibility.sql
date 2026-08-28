-- Who owes whom is between the two of them.
--
-- A settled game's scoreboard stays public — everyone sees every player's
-- buy-ins, cashout and net. The transfers do not: a player sees only the rows
-- they are personally party to. The game admin still sees all of them, since
-- chasing payments is their job.

drop policy if exists "group members read settlements" on public.settlements;

create policy "read settlements you are party to"
  on public.settlements for select to authenticated
  using (
    public.can_admin_game(game_id)
    or from_member_id = public.my_member_id(
      (select g.group_id from public.games g where g.id = settlements.game_id)
    )
    or to_member_id = public.my_member_id(
      (select g.group_id from public.games g where g.id = settlements.game_id)
    )
  );

-- Everyone still gets to know whether the game is closed out, without
-- learning who is carrying the outstanding debt. Counts only: no member ids,
-- no amounts, nothing that reconstructs a row the policy above hides.
create or replace function public.game_settlement_progress(p_game_id uuid)
returns table (total integer, confirmed integer)
language sql security definer stable set search_path = '' as $$
  select
    count(*)::integer,
    count(*) filter (where s.status = 'confirmed')::integer
  from public.settlements s
  join public.games g on g.id = s.game_id
  where s.game_id = p_game_id
    and public.is_group_member(g.group_id)
$$;

revoke execute on function public.game_settlement_progress(uuid) from anon;
