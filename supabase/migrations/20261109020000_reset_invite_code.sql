-- Reset a group's invite link.
--
-- The invite link never expired and couldn't be revoked (FUNCTIONALITY.md,
-- "Things that are deliberately not true"). Among friends that's fine; once a
-- link has been posted somewhere public, the owner needs a way to kill it.
-- A new code makes every old /join/<code> link dead. Members stay members,
-- and game links (/games/<id>/join) are unaffected: they don't use the code.

create or replace function public.reset_invite_code(p_group_id uuid)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  new_code text;
begin
  if not public.is_group_owner(p_group_id) then
    raise exception 'only a group owner can reset the invite link';
  end if;

  update public.groups
    set invite_code =
      translate(encode(extensions.gen_random_bytes(6), 'base64'), '+/', '-_')
    where id = p_group_id
    returning invite_code into new_code;

  return new_code;
end;
$$;

revoke execute on function public.reset_invite_code(uuid) from public, anon;
grant execute on function public.reset_invite_code(uuid) to authenticated;
