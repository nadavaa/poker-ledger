-- Assigning owners, and deleting a group.
--
-- A group can already hold any number of owners — role lives on each member
-- row with nothing forcing it unique — there was simply no way to grant it.

-- Only an owner can hand out roles. An admin managing the roster is not the
-- same as an admin promoting themselves to owner.
create or replace function public.set_member_role(
  p_member_id uuid,
  p_role public.member_role
) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  gid uuid;
  cur public.member_role;
  active boolean;
  owners integer;
begin
  select group_id, role, is_active into gid, cur, active
  from public.group_members where id = p_member_id;
  if gid is null then
    raise exception 'that member does not exist';
  end if;

  if not public.is_group_owner(gid) then
    raise exception 'only a group owner can change roles';
  end if;

  if cur = p_role then
    return;
  end if;

  if p_role = 'owner' and not active then
    raise exception 'reactivate them before making them an owner';
  end if;

  -- A group without an owner cannot be administered or deleted by anyone.
  if cur = 'owner' then
    select count(*) into owners
    from public.group_members
    where group_id = gid and role = 'owner' and is_active;
    if owners <= 1 then
      raise exception 'a group needs at least one owner; make someone else an owner first';
    end if;
  end if;

  update public.group_members set role = p_role where id = p_member_id;
end;
$$;

-- Deleting a group destroys every game under it, and buyins refuse DELETE by
-- design — including through a cascade. The flag is transaction-local and set
-- only by delete_group below, so the audit trail still can't be edited: it can
-- only be destroyed wholesale, deliberately, by an owner.
create or replace function public.buyins_enforce_append_only()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if coalesce(current_setting('app.deleting_group', true), 'off') = 'on' then
      return old;
    end if;
    raise exception 'buyins are append-only; void instead of deleting';
  end if;

  if new.id is distinct from old.id
     or new.game_id is distinct from old.game_id
     or new.member_id is distinct from old.member_id
     or new.amount_cents is distinct from old.amount_cents
     or new.chips is distinct from old.chips
     or new.note is distinct from old.note
     or new.created_at is distinct from old.created_at
     or new.created_by_member_id is distinct from old.created_by_member_id then
    raise exception 'buyins are append-only; correct with a void and a new buyin';
  end if;

  if old.voided_at is not null then
    raise exception 'this buyin is already voided';
  end if;

  new.voided_at := now();
  new.voided_by_member_id := public.my_member_id(
    (select group_id from public.games where id = new.game_id)
  );
  return new;
end;
$$;

create or replace function public.delete_group(p_group_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_group_owner(p_group_id) then
    raise exception 'only a group owner can delete the group';
  end if;

  perform set_config('app.deleting_group', 'on', true);
  delete from public.groups where id = p_group_id;
  perform set_config('app.deleting_group', 'off', true);
end;
$$;

-- What the confirmation has to state before someone types the name.
create or replace function public.group_delete_preview(p_group_id uuid)
returns table (
  members integer,
  games integer,
  open_settlements integer
)
language sql security definer stable set search_path = '' as $$
  select
    (select count(*)::integer from public.group_members
      where group_id = p_group_id),
    (select count(*)::integer from public.games
      where group_id = p_group_id),
    (select count(*)::integer from public.settlements s
      join public.games g on g.id = s.game_id
      where g.group_id = p_group_id and s.status in ('pending', 'paid'))
  where public.is_group_owner(p_group_id)
$$;

revoke execute on function
  public.set_member_role(uuid, public.member_role),
  public.delete_group(uuid),
  public.group_delete_preview(uuid)
from anon;
