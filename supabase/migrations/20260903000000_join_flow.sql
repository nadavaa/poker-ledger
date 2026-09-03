-- Clicking an invite you've already accepted should take you into the group,
-- not offer you a Join button that appears to do nothing.
--
-- The page can't work this out for itself: an inactive member fails
-- is_group_member(), so RLS hides their own row from them and "removed" is
-- indistinguishable from "never joined". Only a definer function can tell
-- them apart.

drop function if exists public.group_preview_by_invite(text);

create or replace function public.group_preview_by_invite(code text)
returns table (
  group_id uuid,
  group_name text,
  member_count bigint,
  -- 'active' | 'inactive' | null
  my_member_status text
)
language sql security definer stable set search_path = '' as $$
  select
    g.id,
    g.name,
    (
      select count(*) from public.group_members m
      where m.group_id = g.id and m.is_active
    ),
    (
      select case when mm.is_active then 'active' else 'inactive' end
      from public.group_members mm
      where mm.group_id = g.id and mm.profile_id = (select auth.uid())
      -- Oldest wins, and the limit means a duplicate row can't error this out.
      order by mm.created_at
      limit 1
    )
  from public.groups g
  where g.invite_code = code
$$;

-- Idempotent in the strong sense: calling it twice produces one membership,
-- and a member who was removed gets their original row back rather than a
-- second one — which is what kept their game history attached to a row their
-- session no longer resolved to.
create or replace function public.join_group_by_invite(code text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  gid uuid;
  existing record;
  uname text;
begin
  if (select auth.uid()) is null then
    raise exception 'not authenticated';
  end if;

  select id into gid from public.groups where invite_code = code;
  if gid is null then
    raise exception 'invalid invite code';
  end if;

  select id, is_active into existing
  from public.group_members
  where group_id = gid and profile_id = (select auth.uid())
  order by created_at
  limit 1;

  if existing.id is not null then
    if not existing.is_active then
      update public.group_members set is_active = true where id = existing.id;
    end if;
    return gid;
  end if;

  select display_name into uname
  from public.profiles where id = (select auth.uid());

  insert into public.group_members (group_id, profile_id, display_name)
  values (gid, (select auth.uid()), coalesce(uname, 'Player'));

  return gid;
end;
$$;

revoke execute on function public.join_group_by_invite(text) from anon;
