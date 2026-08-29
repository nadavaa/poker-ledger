-- Avatars for people and groups, in Supabase Storage.
--
-- Public read, because these are 40px circles on a screen the group already
-- shares. Writes are the part that matters: a user may only write under their
-- own auth.uid(), and a group photo only by that group's owner or admin —
-- enforced by storage policies, not by which upload control the UI draws.

alter table public.groups add column avatar_url text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('avatars', 'avatars', true, 5242880,
   array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']),
  ('group-avatars', 'group-avatars', true, 5242880,
   array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])
on conflict (id) do nothing;

-- Path convention is {owner_id}/{uuid}.{ext}. This reads the first segment
-- and returns null unless it's shaped like a uuid, so a junk path fails the
-- policy instead of raising a cast error.
create or replace function public.avatar_folder_uuid(object_name text)
returns uuid
language sql immutable set search_path = '' as $$
  select case
    when split_part(object_name, '/', 1)
         ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    then split_part(object_name, '/', 1)::uuid
  end
$$;

-- ============ avatars: your own folder, nobody else's ============

create policy "anyone may read an avatar"
  on storage.objects for select
  using (bucket_id = 'avatars');

create policy "you write only under your own id"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and public.avatar_folder_uuid(name) = (select auth.uid())
  );

create policy "you replace only under your own id"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'avatars'
    and public.avatar_folder_uuid(name) = (select auth.uid())
  );

create policy "you delete only under your own id"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'avatars'
    and public.avatar_folder_uuid(name) = (select auth.uid())
  );

-- ============ group-avatars: the group's owners and admins ============

create policy "anyone may read a group avatar"
  on storage.objects for select
  using (bucket_id = 'group-avatars');

create policy "group owners and admins write the group photo"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'group-avatars'
    and public.is_group_owner_or_admin(public.avatar_folder_uuid(name))
  );

create policy "group owners and admins replace the group photo"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'group-avatars'
    and public.is_group_owner_or_admin(public.avatar_folder_uuid(name))
  );

create policy "group owners and admins delete the group photo"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'group-avatars'
    and public.is_group_owner_or_admin(public.avatar_folder_uuid(name))
  );
