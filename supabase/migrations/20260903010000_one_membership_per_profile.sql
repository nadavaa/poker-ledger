-- One membership per person per group, enforced.
--
-- `unique (group_id, profile_id)` on the table does not do this: Postgres
-- permits any number of NULLs in a unique index, so unclaimed rows never
-- collide — which is correct, since two different guests may share a group.
-- This partial index constrains only the claimed rows, where a second row for
-- the same profile is always a bug.
--
-- Both write paths are already guarded — join_group_by_invite returns the
-- existing row and claim_member refuses when you already have one — so this is
-- the backstop for a path that doesn't exist yet rather than a fix for one
-- that does.

create unique index if not exists group_members_one_claimed_per_group
  on public.group_members (group_id, profile_id)
  where profile_id is not null;

-- my_member_id() had no LIMIT: had a duplicate ever existed, it would have
-- returned an arbitrary one and different calls could have disagreed, which is
-- what would make somebody's own settlements invisible to them. The index makes
-- that unreachable; this makes it deterministic regardless.
create or replace function public.my_member_id(gid uuid) returns uuid
language sql security definer stable set search_path = '' as $$
  select id from public.group_members
  where group_id = gid and profile_id = (select auth.uid())
  order by created_at
  limit 1
$$;
