-- Fix: confirming a settlement was rejected by its own policy.
--
-- The previous version declared only USING. Postgres reuses the USING
-- expression as WITH CHECK when none is given, so "the row must not already
-- be confirmed" was also applied to the row being written — making
-- 'confirmed' the one status an update could never produce.
--
-- USING guards the existing row: a closed settlement cannot be touched.
-- WITH CHECK guards the new one: it only has to still belong to a party.
-- Which transitions are legal, and who may make them, stays in the trigger.

drop policy if exists "a party may move an open settlement along"
  on public.settlements;

create policy "a party may move an open settlement along"
  on public.settlements for update to authenticated
  using (
    status <> 'confirmed'
    and (
      from_member_id = public.my_member_id(
        (select g.group_id from public.games g where g.id = settlements.game_id)
      )
      or to_member_id = public.my_member_id(
        (select g.group_id from public.games g where g.id = settlements.game_id)
      )
    )
  )
  with check (
    from_member_id = public.my_member_id(
      (select g.group_id from public.games g where g.id = settlements.game_id)
    )
    or to_member_id = public.my_member_id(
      (select g.group_id from public.games g where g.id = settlements.game_id)
    )
  );
