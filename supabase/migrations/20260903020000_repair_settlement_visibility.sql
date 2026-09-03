-- Repair: production still has the broad settlement read policy.
--
-- 20260828040000 was meant to replace "group members read settlements" with a
-- policy limited to the two parties and the game admin. Every function from
-- that file exists, so it ran — but the old policy is still live and the new
-- one is absent, which means every member of a group can currently read every
-- settlement in it, including amounts between two other people.
--
-- Rather than assume how that happened, this asserts the intended end state:
-- both names are dropped first, so it converges whether one, both, or neither
-- is present, and it is safe to run again.

drop policy if exists "group members read settlements" on public.settlements;
drop policy if exists "read settlements you are party to" on public.settlements;

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
