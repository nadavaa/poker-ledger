-- A confirmed settlement is closed, and closed means closed.
--
-- The trigger already refused a transition out of 'confirmed', but that is a
-- rule about the change. This is a rule about the row: once the payee has
-- said the money arrived, neither party may update it at all. Hiding the Undo
-- button is a courtesy; this is the guarantee.

drop policy if exists "a party may move their own settlement along"
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
  );
