-- Welcome email from Nadav, once per account.
--
-- welcome_email_sent_at is the claim: the server sets it (service role) in
-- the same statement that checks it is empty, so a user gets the email at
-- most once however many times the trigger fires. No grant to anon or
-- authenticated: players can't read or reset it.
--
-- Everyone who already has an account is marked as sent, so only people who
-- sign up from now on get the welcome.

alter table public.profiles
  add column if not exists welcome_email_sent_at timestamptz;

update public.profiles
  set welcome_email_sent_at = now()
  where welcome_email_sent_at is null;
