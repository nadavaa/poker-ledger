-- Handles stored with a leading @ produce a payment link to venmo.com/@name,
-- which does not resolve — so anyone who typed the @ they see on their own
-- Venmo profile has had a dead Pay button ever since.
--
-- Both write paths already strip it. This is the backfill for rows written
-- before they did, and it is a no-op if there are none.

update public.profiles
set venmo_handle = nullif(trim(leading '@' from btrim(venmo_handle)), '')
where venmo_handle is not null
  and venmo_handle is distinct from
      nullif(trim(leading '@' from btrim(venmo_handle)), '');

-- The per-group override, same shape and the same problem.
update public.group_members
set venmo_handle = nullif(trim(leading '@' from btrim(venmo_handle)), '')
where venmo_handle is not null
  and venmo_handle is distinct from
      nullif(trim(leading '@' from btrim(venmo_handle)), '');
