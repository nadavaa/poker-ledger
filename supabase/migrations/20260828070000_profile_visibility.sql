-- Group mates can read each other's profile basics.
--
-- Until now the only select policy on profiles was "your own row", which meant
-- nobody could read anyone else's venmo_handle. Every Venmo button fell back
-- to "no handle" regardless of what the other player had saved.

create or replace function public.shares_a_group_with(pid uuid)
returns boolean
language sql security definer stable set search_path = '' as $$
  select exists (
    select 1
    from public.group_members mine
    join public.group_members theirs on theirs.group_id = mine.group_id
    where mine.profile_id = (select auth.uid())
      and mine.is_active
      and theirs.profile_id = pid
  )
$$;

drop policy if exists "users read own profile" on public.profiles;

create policy "read your own profile and your group mates'"
  on public.profiles for select
  to authenticated
  using (
    id = (select auth.uid())
    or public.shares_a_group_with(id)
  );

-- The policy grants the row; these grants limit it to the columns other
-- players actually need. created_at stays private, and any column added to
-- this table in future is private until deliberately granted.
revoke select on public.profiles from authenticated;
grant select (id, display_name, avatar_url, venmo_handle)
  on public.profiles to authenticated;
