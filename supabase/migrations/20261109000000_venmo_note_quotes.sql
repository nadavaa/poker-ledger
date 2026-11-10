-- Venmo payment note, per group.
--
-- The Hebrew poker quotes (lib/quotes.ts) are an inside joke of one group,
-- Poker @ NYC. Every other group's Venmo note is just the spade. Off by
-- default, so every existing and future group gets the spade unless turned
-- on here.
--
-- No update grant to authenticated (see 20260917000000_security_hardening.sql:
-- groups updates are column-granted), so this is changed only from the
-- database, not from the app. There is no settings screen for it.

alter table public.groups
  add column if not exists venmo_note_quotes boolean not null default false;

comment on column public.groups.venmo_note_quotes is
  'true: Venmo notes use the Hebrew quotes in lib/quotes.ts. false: just the spade.';

update public.groups
  set venmo_note_quotes = true
  where id = 'ad771ae2-5958-405f-b37c-97f928555b69';  -- Poker @ NYC
