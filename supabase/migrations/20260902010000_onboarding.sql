-- A short setup flow for new accounts, and a flag so it never reappears.

alter table public.profiles add column onboarding_completed_at timestamptz;

-- Everyone who already has an account has, by definition, got past setup.
-- Without this they'd all be marched through it on their next sign-in.
update public.profiles set onboarding_completed_at = now()
where onboarding_completed_at is null;

-- Marked whether they finished or skipped: skipping is a decision, and
-- asking again every login would be nagging.
create or replace function public.complete_onboarding()
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'not authenticated';
  end if;
  update public.profiles
  set onboarding_completed_at = coalesce(onboarding_completed_at, now())
  where id = (select auth.uid());
end;
$$;

revoke execute on function public.complete_onboarding() from anon;

-- The flag is the caller's own business; it isn't in the group-mate grant.
grant select (onboarding_completed_at) on public.profiles to authenticated;
