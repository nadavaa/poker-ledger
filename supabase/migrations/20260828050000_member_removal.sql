-- Removing a member without corrupting anyone else's history.
--
-- group_members is referenced by games, signups, buyins, cashouts,
-- settlements, adjustments and transfers. Hard-deleting someone who has
-- played would break other people's settled games, so a delete is only ever
-- allowed for a row nothing points at — the typo'd placeholder case. Everyone
-- else is deactivated, which hides them from the roster and from new signups
-- while every past game still renders their name and numbers.

-- Definer: the settlement check has to see rows the caller cannot read, now
-- that settlements are visible only to the two parties.
create or replace function public.member_has_history(mid uuid)
returns boolean
language sql security definer stable set search_path = '' as $$
  select exists (select 1 from public.game_signups where member_id = mid)
      or exists (
        select 1 from public.buyins
        where member_id = mid or created_by_member_id = mid
           or voided_by_member_id = mid
      )
      or exists (
        select 1 from public.cashouts
        where member_id = mid or recorded_by_member_id = mid
      )
      or exists (
        select 1 from public.settlements
        where from_member_id = mid or to_member_id = mid
      )
      or exists (
        select 1 from public.game_adjustments
        where member_id = mid or created_by_member_id = mid
      )
      or exists (
        select 1 from public.games
        where admin_member_id = mid or created_by_member_id = mid
      )
      or exists (
        select 1 from public.game_admin_transfers
        where from_member_id = mid or to_member_id = mid
           or transferred_by_member_id = mid
      )
$$;

-- Null means removable. Anything else is the sentence shown to the admin.
create or replace function public.member_removal_block(mid uuid)
returns text
language sql security definer stable set search_path = '' as $$
  select case
    when (select role from public.group_members where id = mid) = 'owner'
      then 'They own this group. Hand the group over first.'
    when exists (
      select 1 from public.games
      where admin_member_id = mid and status not in ('settled', 'cancelled')
    )
      then 'They are running a game that has not been settled yet. Hand that game over first.'
    when exists (
      select 1 from public.settlements
      where (from_member_id = mid or to_member_id = mid)
        and status in ('pending', 'paid')
    )
      then 'They still have money to pay or collect. Settle up first.'
  end
$$;

-- ============ RLS ============

-- A clean delete is only for a row nothing references.
create policy "owner or admin deletes a member with no history"
  on public.group_members for delete to authenticated
  using (
    public.is_group_owner_or_admin(group_id)
    and public.member_removal_block(id) is null
    and not public.member_has_history(id)
  );

-- Restrictive, so it ANDs with the existing update policy rather than
-- widening it. It only bites when the new row is inactive: reactivating and
-- ordinary edits are untouched.
create policy "block deactivating an entangled member"
  on public.group_members as restrictive for update to authenticated
  using (true)
  with check (
    is_active
    or public.member_removal_block(id) is null
  );

-- ============ What the confirmation dialog needs to say ============

create or replace function public.member_removal_preview(p_member_id uuid)
returns table (
  mode text,             -- 'delete' | 'deactivate' | 'blocked'
  blocked_reason text,
  games_played integer,
  display_name text
)
language sql security definer stable set search_path = '' as $$
  select
    case
      when public.member_removal_block(p_member_id) is not null then 'blocked'
      when public.member_has_history(p_member_id) then 'deactivate'
      else 'delete'
    end,
    public.member_removal_block(p_member_id),
    (
      select count(*)::integer from public.game_signups
      where member_id = p_member_id and status = 'confirmed'
    ),
    gm.display_name
  from public.group_members gm
  where gm.id = p_member_id
    and public.is_group_owner_or_admin(gm.group_id)
$$;

-- Security invoker on purpose: the policies above are the enforcement, and
-- this only exists to fail with a sentence instead of "0 rows affected".
create or replace function public.remove_group_member(p_member_id uuid)
returns text
language plpgsql set search_path = ''
as $$
declare
  gid uuid;
  reason text;
begin
  select group_id into gid from public.group_members where id = p_member_id;
  if gid is null then
    raise exception 'that member does not exist';
  end if;
  if not public.is_group_owner_or_admin(gid) then
    raise exception 'only a group owner or admin can remove members';
  end if;

  reason := public.member_removal_block(p_member_id);
  if reason is not null then
    raise exception '%', reason;
  end if;

  if public.member_has_history(p_member_id) then
    update public.group_members set is_active = false where id = p_member_id;
    return 'deactivated';
  end if;

  delete from public.group_members where id = p_member_id;
  return 'deleted';
end;
$$;

create or replace function public.reactivate_group_member(p_member_id uuid)
returns void
language plpgsql set search_path = ''
as $$
declare
  gid uuid;
begin
  select group_id into gid from public.group_members where id = p_member_id;
  if gid is null then
    raise exception 'that member does not exist';
  end if;
  if not public.is_group_owner_or_admin(gid) then
    raise exception 'only a group owner or admin can reactivate members';
  end if;
  -- The original row comes back, so their whole history comes with it.
  update public.group_members set is_active = true where id = p_member_id;
end;
$$;

revoke execute on function
  public.remove_group_member(uuid),
  public.reactivate_group_member(uuid),
  public.member_removal_preview(uuid)
from anon;
