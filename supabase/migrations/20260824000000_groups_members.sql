-- Phase 1: groups and group members, RLS, invite + claim flows.

-- gen_random_bytes lives in pgcrypto. Postgres encode() has no 'base64url'
-- format, so translate +/ to -_ (6 bytes = exactly 8 base64 chars, no padding).
create extension if not exists pgcrypto with schema extensions;

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  invite_code text not null unique
    default translate(encode(extensions.gen_random_bytes(6), 'base64'), '+/', '-_'),
  chips_per_dollar numeric(10,4) not null default 2,
  default_buyin_cents integer not null default 5000,
  default_seat_limit integer not null default 9,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);

create type public.member_role as enum ('owner', 'admin', 'member');

create table public.group_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  profile_id uuid references public.profiles (id) on delete set null,  -- null = unclaimed
  display_name text not null,
  role public.member_role not null default 'member',
  claim_code text unique
    default translate(encode(extensions.gen_random_bytes(6), 'base64'), '+/', '-_'),
  venmo_handle text,          -- overrides profile handle if set
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (group_id, profile_id)
);
create index on public.group_members (group_id);
create index on public.group_members (profile_id);

-- ============ Helpers (security definer so RLS policies don't recurse) ============

create or replace function public.my_member_id(gid uuid) returns uuid
language sql security definer stable set search_path = '' as $$
  select id from public.group_members
  where group_id = gid and profile_id = (select auth.uid())
$$;

create or replace function public.is_group_member(gid uuid) returns boolean
language sql security definer stable set search_path = '' as $$
  select exists (
    select 1 from public.group_members
    where group_id = gid and profile_id = (select auth.uid()) and is_active
  )
$$;

create or replace function public.is_group_owner_or_admin(gid uuid) returns boolean
language sql security definer stable set search_path = '' as $$
  select exists (
    select 1 from public.group_members
    where group_id = gid and profile_id = (select auth.uid())
      and role in ('owner', 'admin') and is_active
  )
$$;

-- ============ RLS ============

alter table public.groups enable row level security;

create policy "members read their groups"
  on public.groups for select to authenticated
  using (public.is_group_member(id));

create policy "owner or admin updates group"
  on public.groups for update to authenticated
  using (public.is_group_owner_or_admin(id))
  with check (public.is_group_owner_or_admin(id));

-- No insert policy on groups: creation goes through create_group() so the
-- group row and its owner membership are written atomically.

alter table public.group_members enable row level security;

create policy "members read the roster"
  on public.group_members for select to authenticated
  using (public.is_group_member(group_id));

create policy "owner or admin adds members"
  on public.group_members for insert to authenticated
  with check (public.is_group_owner_or_admin(group_id));

create policy "owner or admin updates members"
  on public.group_members for update to authenticated
  using (public.is_group_owner_or_admin(group_id))
  with check (public.is_group_owner_or_admin(group_id));

-- ============ RPCs ============
-- Multi-row transactional flows (create, join, claim). Table access is still
-- guarded by the policies above; these are the only doors around them and
-- each one re-checks identity itself.

create or replace function public.create_group(group_name text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  gid uuid;
  uname text;
begin
  if (select auth.uid()) is null then
    raise exception 'not authenticated';
  end if;
  if coalesce(trim(group_name), '') = '' then
    raise exception 'group name is required';
  end if;
  select display_name into uname from public.profiles where id = (select auth.uid());
  if uname is null then
    raise exception 'profile not found';
  end if;
  insert into public.groups (name, created_by)
  values (trim(group_name), (select auth.uid()))
  returning id into gid;
  insert into public.group_members (group_id, profile_id, display_name, role)
  values (gid, (select auth.uid()), uname, 'owner');
  return gid;
end;
$$;

create or replace function public.join_group_by_invite(code text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  gid uuid;
  uname text;
begin
  if (select auth.uid()) is null then
    raise exception 'not authenticated';
  end if;
  select id into gid from public.groups where invite_code = code;
  if gid is null then
    raise exception 'invalid invite code';
  end if;
  if exists (select 1 from public.group_members
             where group_id = gid and profile_id = (select auth.uid())) then
    return gid;  -- already a member, joining is idempotent
  end if;
  select display_name into uname from public.profiles where id = (select auth.uid());
  insert into public.group_members (group_id, profile_id, display_name)
  values (gid, (select auth.uid()), coalesce(uname, 'Player'));
  return gid;
end;
$$;

create or replace function public.claim_member(code text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  m record;
begin
  if (select auth.uid()) is null then
    raise exception 'not authenticated';
  end if;
  select id, group_id, profile_id into m
  from public.group_members where claim_code = code;
  if m.id is null then
    raise exception 'invalid claim code';
  end if;
  if m.profile_id is not null then
    if m.profile_id = (select auth.uid()) then
      return m.group_id;  -- clicking your own claim link twice is fine
    end if;
    raise exception 'this member has already been claimed';
  end if;
  if exists (select 1 from public.group_members
             where group_id = m.group_id and profile_id = (select auth.uid())) then
    raise exception 'you are already a member of this group';
  end if;
  update public.group_members set profile_id = (select auth.uid()) where id = m.id;
  return m.group_id;
end;
$$;

-- Read-only previews so the /join and /claim pages can show what the link is
-- for before the user commits. Only name-level info leaks, and only to
-- someone holding a valid code.

create or replace function public.group_preview_by_invite(code text)
returns table (group_id uuid, group_name text, member_count bigint)
language sql security definer stable set search_path = '' as $$
  select g.id, g.name, count(gm.id)
  from public.groups g
  left join public.group_members gm on gm.group_id = g.id and gm.is_active
  where g.invite_code = code
  group by g.id, g.name
$$;

create or replace function public.member_preview_by_claim(code text)
returns table (member_name text, group_name text, already_claimed boolean)
language sql security definer stable set search_path = '' as $$
  select gm.display_name, g.name, gm.profile_id is not null
  from public.group_members gm
  join public.groups g on g.id = gm.group_id
  where gm.claim_code = code
$$;

revoke execute on function
  public.create_group(text),
  public.join_group_by_invite(text),
  public.claim_member(text)
from anon;
