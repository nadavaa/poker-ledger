-- A player can't walk out on their own money.
--
-- Once someone has a live buy-in, their cash is in the pot and the
-- settlement maths depends on them being in the game. Withdrawing would
-- leave a pot nobody is accounted for. The admin path is untouched: removing
-- a player voids their buy-ins first, which is a deliberate act with an
-- audit trail behind it.

create or replace function public.can_withdraw_from_game(gid uuid, mid uuid)
returns boolean
language sql security definer stable set search_path = '' as $$
  select case
    -- Nothing has happened yet.
    when g.status = 'scheduled' then true
    -- Signed up but never actually played.
    when g.status = 'active' then not exists (
      select 1 from public.buyins
      where game_id = gid and member_id = mid and voided_at is null
    )
    -- Counting chips or done: the roster is what the maths was built on.
    else false
  end
  from public.games g
  where g.id = gid
$$;

-- Restrictive, so it ANDs with the existing permissive policy rather than
-- widening it, and it only bites on a withdrawal: ordinary signup updates and
-- waitlist promotions are unaffected.
create policy "no withdrawing once your money is in the pot"
  on public.game_signups as restrictive for update to authenticated
  using (true)
  with check (
    status <> 'withdrawn'
    or public.can_admin_game(game_id)
    or public.can_withdraw_from_game(game_id, member_id)
  );
