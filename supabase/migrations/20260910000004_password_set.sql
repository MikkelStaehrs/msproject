-- Whether the password on an account was chosen by the person holding it.
--
-- A colleague is created in the Supabase dashboard, which means somebody else
-- typed their password and knows it. That is not a small thing: for as long as
-- it stands, two people can sign in as one, and every line written under that
-- name is written by an account two people can open.
--
-- Nothing in the schema can tell us whether they have since changed it.
-- `auth.users` is not exposed and would not answer this anyway - it holds a
-- hash and a timestamp of the last change, not who made it. So this is the
-- second fact in the application that has to be recorded rather than derived,
-- and like `standup.held_on` it is recorded by the act itself: setPassword
-- stamps it. Null means the password came from whoever created the account.
--
-- It is deliberately NOT a "has seen the welcome screen" flag. A flag like that
-- is cleared by clicking, and the gate would then be a thing you get past
-- rather than a thing you answer.
--
-- THE BACKFILL IS A DERIVATION, not a guess. `full_name` is written in exactly
-- one place - lib/auth-actions.ts - and that same function is the only thing in
-- the application that calls updateUser({ password }). So an account with a
-- name is an account whose holder set their own password, necessarily. Accounts
-- without one have not, and they are the ones who should be asked.

begin;

alter table profile
  add column password_set_at timestamptz;

comment on column profile.password_set_at is
  'When this person last chose their own password. Null means the one they '
  'have was typed by whoever created the account, and they are asked to '
  'replace it before they can use the app.';

update profile set password_set_at = now() where full_name is not null;

insert into schema_migration (version, applied_at, note)
values ('20260910000004_password_set', now(),
        'Whether the password on an account was chosen by the person holding it')
on conflict (version) do nothing;

commit;
