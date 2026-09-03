-- Game times were being stored four hours late.
--
-- The column was always timestamptz; the values were wrong. The create action
-- read the datetime-local field — a naive "2026-09-06T20:00" — and ran
-- new Date(...).toISOString() inside a server action, where Node's zone is
-- UTC on Vercel. So 8pm typed became 20:00Z, which is 4pm in New York.
--
-- It looked right because the game page rendered with toLocaleString and no
-- timeZone, also in UTC, so the two errors cancelled on that one screen.

alter table public.groups
  add column if not exists timezone text not null default 'America/New_York';

comment on column public.groups.timezone is
  'IANA zone the group plays in. An identifier, never a fixed offset: a '
  'hardcoded -5 is wrong for half the year.';

-- One-time repair. Every affected row holds a wall-clock time that was meant
-- to be local, stamped as if it were UTC — so reinterpret it in the group''s
-- zone rather than shifting by a constant, which gets DST right per row.
--
-- Games whose date was set through the edit form are already correct: that
-- form converts in the browser, so it stored a real instant. game_edits tells
-- us exactly which those are.
do $$
begin
  alter table public.games disable trigger games_before_update;
  alter table public.games disable trigger games_after_update;

  update public.games g
  set scheduled_at =
    (g.scheduled_at at time zone 'UTC') at time zone gr.timezone
  from public.groups gr
  where gr.id = g.group_id
    and not exists (
      select 1 from public.game_edits e
      where e.game_id = g.id and e.field = 'scheduled_at'
    );

  alter table public.games enable trigger games_before_update;
  alter table public.games enable trigger games_after_update;
end $$;
