-- Security audit, 2026-09-17. Three root causes, each fixed at the root.
--
-- 1. EXECUTE on functions is granted to PUBLIC by default in Postgres, and
--    every "revoke execute ... from anon" in this schema was therefore a
--    no-op: anon and authenticated kept EXECUTE through PUBLIC. Live probe
--    with only the publishable key and no session returned admin_overview()
--    and admin_groups() in full, and promote_from_waitlist() answered 204.
--    Functions that check auth.uid() or membership inside were protected by
--    that check; functions that relied on the revoke were open.
--
-- 2. UPDATE and INSERT privileges were table-wide, so a policy that said WHO
--    could write a row said nothing about WHICH COLUMNS. A group admin could
--    set role = 'owner' on their own row, rewrite another member's Venmo
--    override so payments went elsewhere, or force-claim an unclaimed
--    identity; a waitlisted player could set signup_order = 0 and jump the
--    queue; a game admin could set status = 'settled' and skip the whole
--    reconciliation gate. RLS filters rows; column privileges filter columns.
--
-- 3. claim_code was in the column grant on group_members, so any member of a
--    group could read every unclaimed member's code and claim that identity
--    and its history. The UI showed the link only to owners and admins, which
--    is exactly the "hiding a button is not a permission" mistake CLAUDE.md
--    names.

-- ===================== 1. Function execute privileges =====================

revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;
revoke execute on all functions in schema public from authenticated;

-- New functions start closed. A function nobody can call fails loudly on
-- first use; a function everybody can call fails silently forever.
alter default privileges in schema public revoke execute on functions from public;
alter default privileges for role postgres in schema public
  revoke execute on functions from anon, authenticated;

-- What a signed-in user may call: every RPC the app invokes as the user.
-- Each of these checks the caller inside.
grant execute on function
  public.add_player_to_game(uuid, uuid, text),
  public.begin_reconciliation(uuid),
  public.cancel_game(uuid),
  public.claim_member(text),
  public.complete_onboarding(),
  public.create_game(timestamptz, uuid, text, text, text, integer, integer, numeric, boolean),
  public.create_group(text),
  public.delete_food_order(uuid),
  public.delete_group(uuid),
  public.demote_from_confirmed(uuid, uuid, text),
  public.food_order_confirmed_payers(uuid),
  public.game_nets(uuid),
  public.game_payment_details(uuid),
  public.group_delete_preview(uuid),
  public.group_preview_by_invite(text),
  public.join_game_by_link(uuid),
  public.join_group_by_invite(text),
  public.log_invite_visit(text, uuid, text),
  public.log_onboarding(text, text),
  public.member_preview_by_claim(text),
  public.member_removal_preview(uuid),
  public.my_payment_details(),
  public.promote_to_confirmed(uuid, uuid, boolean),
  public.reactivate_group_member(uuid),
  public.record_cashout(uuid, uuid, integer),
  public.remove_group_member(uuid),
  public.reopen_game(uuid),
  public.resolve_discrepancy(uuid, text, uuid, text),
  public.save_food_order(uuid, uuid, uuid, text, integer, jsonb),
  public.set_member_role(uuid, public.member_role),
  public.set_my_payment_details(text, text, text),
  public.settle_game(uuid, jsonb),
  public.start_game(uuid, uuid[]),
  public.transfer_game_admin(uuid, uuid, text),
  public.undo_cashout(uuid, uuid)
to authenticated;

-- Helpers that RLS and storage policies evaluate as the querying user. All
-- return a boolean or the caller's own id; none reads data on its own.
grant execute on function
  public.avatar_folder_uuid(text),
  public.can_admin_game(uuid),
  public.can_edit_food_order(uuid),
  public.can_see_food_order(uuid),
  public.can_withdraw_from_game(uuid, uuid),
  public.is_group_member(uuid),
  public.is_group_owner(uuid),
  public.is_group_owner_or_admin(uuid),
  public.member_has_history(uuid),
  public.member_removal_block(uuid),
  public.my_member_id(uuid),
  public.shares_a_group_with(uuid)
to authenticated;

-- Trigger functions. EXECUTE is checked when a trigger is created, not when
-- it fires, so this is belt-and-braces; the cost of being wrong about that
-- on the signup trigger is nobody being able to sign up.
grant execute on function public.handle_new_user() to supabase_auth_admin;
grant execute on function
  public.buyins_before_insert(),
  public.buyins_enforce_append_only(),
  public.cashouts_after_write(),
  public.game_signups_after_update(),
  public.game_signups_before_insert(),
  public.game_signups_before_update(),
  public.games_after_update(),
  public.games_before_update(),
  public.settlements_enforce_handshake()
to authenticated;

-- The analytics functions: service role only. This is what "owner-only"
-- was supposed to mean and did not.
grant execute on function
  public.admin_overview(),
  public.admin_weekly(),
  public.admin_monthly_signups(),
  public.admin_cohorts(),
  public.admin_groups(),
  public.admin_onboarding(),
  public.admin_onboarding_totals()
to service_role;

-- Deliberately granted to nobody: promote_from_waitlist(uuid) and
-- seats_taken(uuid) are called only from definer functions and triggers,
-- which run as the owner. game_settlement_progress(uuid) and
-- set_my_venmo_handle(text) are no longer called by the app.

-- ===================== 2. Column privileges =====================
-- Each grant lists exactly the columns the client writes today. Everything
-- else on these tables changes only through a definer RPC.

revoke insert, update on public.games from authenticated;
grant update (name, location, scheduled_at, seat_limit, default_buyin_cents, chips_per_dollar)
  on public.games to authenticated;
-- games are created by create_game(); status, started_at, settled_at,
-- admin_member_id and group_id move only through their RPCs.

revoke insert, update on public.game_signups from authenticated;
grant insert (game_id, member_id) on public.game_signups to authenticated;
grant update (status) on public.game_signups to authenticated;
-- signup_order is the queue. It is computed by the trigger and nobody
-- else's to set.

revoke insert, update on public.group_members from authenticated;
grant insert (group_id, display_name) on public.group_members to authenticated;
-- No client path updates a member row. role, profile_id, claim_code,
-- venmo_handle and is_active each have an RPC that checks who is asking.

revoke insert, update on public.buyins from authenticated;
grant insert (game_id, member_id, amount_cents, chips, note) on public.buyins to authenticated;
grant update (void_reason) on public.buyins to authenticated;
-- created_at and created_by_member_id are the audit trail; the trigger
-- stamps them and the admin does not get to backdate one.

revoke update on public.settlements from authenticated;
grant update (status) on public.settlements to authenticated;

revoke update on public.profiles from authenticated;
grant update (display_name, avatar_url) on public.profiles to authenticated;

revoke update on public.groups from authenticated;
grant update (name, avatar_url, default_seat_limit, default_buyin_cents, chips_per_dollar)
  on public.groups to authenticated;
-- invite_code is generated, never chosen. timezone has no UI yet.

-- ===================== 3. claim_code =====================

revoke select on public.group_members from authenticated;
grant select (
  id, group_id, profile_id, display_name, role, venmo_handle, is_active, created_at
) on public.group_members to authenticated;

-- Owners and admins get the codes for their own group's unclaimed members,
-- and nobody gets anything else.
create or replace function public.group_claim_codes(p_group_id uuid)
returns table (member_id uuid, claim_code text)
language sql security definer stable set search_path = ''
as $$
  select m.id, m.claim_code
  from public.group_members m
  where m.group_id = p_group_id
    and m.profile_id is null
    and m.is_active
    and m.claim_code is not null
    and public.is_group_owner_or_admin(p_group_id)
$$;

grant execute on function public.group_claim_codes(uuid) to authenticated;

-- A claimed identity has no further use for its code, and no reason to keep
-- a working one lying around.
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
  update public.group_members
  set profile_id = (select auth.uid()), claim_code = null
  where id = m.id;
  return m.group_id;
end;
$$;

grant execute on function public.claim_member(text) to authenticated;

-- log_invite_visit inserted with a null profile if ever reached without a
-- session. It cannot be reached that way any more, but the function should
-- not depend on that.
create or replace function public.log_invite_visit(
  p_kind text,
  p_target_id uuid,
  p_outcome text
) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    return;
  end if;
  insert into public.invite_visits (kind, target_id, profile_id, outcome)
  values (p_kind, p_target_id, (select auth.uid()), p_outcome);
end;
$$;

grant execute on function public.log_invite_visit(text, uuid, text) to authenticated;
