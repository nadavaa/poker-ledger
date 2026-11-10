-- Let a group's owner or admin set its time zone.
--
-- groups.timezone has existed since 20260903070000_game_times.sql, always
-- America/New_York, with no way to change it ("timezone has no UI yet" in
-- 20260917000000_security_hardening.sql). Groups outside Eastern time saw
-- every game at the wrong hour.
--
-- The column grant only lets authenticated users name the column; the
-- existing groups update policy still decides whose row (owner or admin).

grant update (timezone) on public.groups to authenticated;

-- Only real IANA names. A typo here would break every time on the group's
-- screens, and `at time zone` in SQL would throw.
create or replace function public.groups_check_timezone()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = new.timezone) then
    raise exception 'unknown time zone: %', new.timezone;
  end if;
  return new;
end
$$;

drop trigger if exists groups_check_timezone on public.groups;
create trigger groups_check_timezone
  before insert or update of timezone on public.groups
  for each row execute function public.groups_check_timezone();
