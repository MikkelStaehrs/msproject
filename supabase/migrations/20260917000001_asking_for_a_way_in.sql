-- Asking for a way in, and somebody who can answer.
--
-- Until now an account came into being in one place only: the Supabase
-- dashboard. `addMember` says so out loud when you try to add a colleague who
-- has no login yet, "Create the user in Supabase first, then add them", which
-- is honest and is also the sound of a hole in the application. Two things
-- were missing either side of it. Someone who has heard about this and wants
-- in has nowhere to say so, and whoever owns the place has no screen on which
-- to answer.
--
-- So: one table for the asking, one flag for the answering.
--
-- WHY A FLAG AND NOT A ROLE TABLE. There is exactly one privilege here, «may
-- open the admin module», and it is held by one or two people. A `role` table
-- with a `permission` table beside it is the shape you reach for when there
-- are several privileges that are held in different combinations, and
-- inventing that shape before there is a second privilege buys nothing and
-- costs a join on every page. A boolean can grow into a table the day a second
-- privilege exists.
--
-- WHY NOBODY SIGNED IN MAY WRITE THAT FLAG. `profile` already carries a policy
-- letting you update your own row, because you set your own name on it. RLS is
-- row level: a policy that lets you write your row lets you write every column
-- of it, so the moment `is_admin` sits on `profile`, `profile_own_name` is a
-- policy that lets anybody make themselves an administrator. That is not a
-- theoretical reading, it is what the policy says.
--
-- The fix is not a cleverer policy. It is column privileges, which sit under
-- RLS and cannot be argued with: UPDATE is revoked from `authenticated` and
-- granted back on the two columns a person sets about themselves. Every other
-- column on `profile`, `is_admin` first among them, is then unwritable from
-- any ordinary session no matter what policy is ever added above it. The flag
-- is written by the service role and by nothing else, from the two admin
-- actions that already hold that key in order to invite and to delete.

begin;

-- ---------------------------------------------------------------------------
-- The state of an ask. A closed set, so it is an enum: a comment does not stop
-- anything, and the audit checks that every closed set here is a real type.
--
-- Three values and no more. «new» is waiting for a human, «invited» means an
-- invitation has gone out and the account now exists, «declined» means it was
-- answered no. Declined rows stay: the point of keeping them is that the same
-- address asking a third time is a thing the owner should be able to see.
-- ---------------------------------------------------------------------------
create type access_request_state as enum ('new', 'invited', 'declined');

create table access_request (
  id           uuid primary key default gen_random_uuid(),
  full_name    text not null,
  email        text not null,
  -- Why they want in, in their words. Optional, because a person who cannot
  -- think what to write should still be able to ask.
  reason       text,
  requested_at timestamptz not null default now(),
  state        access_request_state not null default 'new',
  decided_at   timestamptz,
  decided_by   uuid references auth.users(id) on delete set null,
  -- What the owner wrote when answering. On a decline it is the reason, and it
  -- is for the owner reading the list in three months, not for the requester:
  -- nothing here is ever sent back.
  note         text,

  -- This form stands on the public side of the login, so the bounds are the
  -- table's own rather than the form's. A field with no ceiling reachable
  -- without a session is a field somebody will one day post a megabyte into.
  constraint access_request_name_length
    check (char_length(full_name) between 1 and 120),
  constraint access_request_email_shape
    check (char_length(email) between 3 and 320 and position('@' in email) > 1),
  constraint access_request_reason_length
    check (reason is null or char_length(reason) <= 600),
  -- A decision has a date, and a date means a decision. Neither alone.
  constraint access_request_decided_together
    check ((state = 'new') = (decided_at is null))
);

comment on table access_request is
  'Somebody asking for a login. Insertable without a session, readable only by '
  'an administrator. Answered rows stay, including the declined ones.';

-- One open ask per address. A second attempt while the first is still waiting
-- is refused by the database rather than piling up, and once the first is
-- answered the same person may ask again. This is the only brake on a form
-- that anyone can reach; it holds against the accidental double submit and the
-- impatient reload, which is what it is for, and not against somebody
-- determined with a supply of addresses.
create unique index access_request_open_idx
  on access_request (lower(email))
  where state = 'new';

create index access_request_state_idx
  on access_request (state, requested_at desc);

-- ---------------------------------------------------------------------------
-- Who may answer.
-- ---------------------------------------------------------------------------
alter table profile
  add column is_admin boolean not null default false;

comment on column profile.is_admin is
  'Whether this account may open the admin module. Readable by anyone signed '
  'in, on purpose: knowing who to ask is not a secret. Writable by the service '
  'role alone, enforced by column privilege rather than by policy.';

-- The same shape as can_see_node: security definer, so a policy that calls it
-- does not set off the recursion of reading a table to decide whether that
-- table may be read. Stable, so the planner calls it once per statement.
create or replace function is_admin()
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select coalesce((select p.is_admin from profile p where p.id = auth.uid()), false);
$$;

comment on function is_admin() is
  'Whether the current user may open the admin module. Security definer for '
  'the same reason can_see_node is: a policy on profile that read profile '
  'would call itself.';

revoke all on function is_admin() from public, anon;
grant execute on function is_admin() to authenticated;

-- ---------------------------------------------------------------------------
-- The column privileges that make the flag safe.
--
-- `profile_own_name` stays exactly as it is and is now harmless: a row you may
-- write is still a row whose columns you mostly may not. The two granted back
-- are the two a person sets about themselves on /auth/password.
-- ---------------------------------------------------------------------------
revoke update on profile from authenticated;
grant update (full_name, password_set_at) on profile to authenticated;

-- ---------------------------------------------------------------------------
-- The first administrator.
--
-- The oldest account, which is the one that created everything here and is
-- already the only account that could have. Read from auth.users rather than
-- from profile: the membership migration backfilled every profile row in a
-- single statement, so profile.created_at is the same instant for all of them
-- and says nothing about who came first.
--
-- Deliberately not an email written into a migration. A migration naming one
-- person is a migration that is wrong on the next database it is run against.
-- ---------------------------------------------------------------------------
update profile
   set is_admin = true
 where id = (select id from auth.users order by created_at asc limit 1);

-- ---------------------------------------------------------------------------
-- Policies.
--
-- Reading and answering stay under RLS and go through the ordinary session, so
-- the admin screen is subject to the same gate as every other screen. The
-- service role is used for the two things it is the only thing that can do:
-- creating a user, and deleting one.
-- ---------------------------------------------------------------------------
alter table access_request enable row level security;

-- Anyone, signed in or not, may ask. The check pins the row to an unanswered
-- one: an insert cannot arrive already invited, and cannot name who decided
-- it.
create policy access_request_ask on access_request
  for insert to anon, authenticated
  with check (state = 'new' and decided_at is null and decided_by is null);

create policy access_request_read on access_request
  for select to authenticated
  using (is_admin());

create policy access_request_answer on access_request
  for update to authenticated
  using (is_admin()) with check (is_admin());

create policy access_request_forget on access_request
  for delete to authenticated
  using (is_admin());

-- Table privileges under the policies. A signed-out request may put a row in
-- and may name only the three columns a person fills in; it may not read one
-- back, and there is no select policy for it either. Belt and braces on the
-- one table in this schema that is reachable without a session.
revoke all on access_request from anon;
grant insert (full_name, email, reason) on access_request to anon;

insert into schema_migration (version, applied_at, note)
values ('20260917000001_asking_for_a_way_in', now(),
        'Access requests from the login screen, and an admin flag to answer them')
on conflict (version) do nothing;

commit;
