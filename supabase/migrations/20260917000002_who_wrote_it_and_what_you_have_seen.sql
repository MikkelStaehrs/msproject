-- Who wrote it, and what you have already seen.
--
-- The application has always recorded WHAT happened and WHEN, on every table
-- that matters, and never once who did it. That was honest while there was one
-- account: the answer was Mikkel, on every row, and a column saying so would
-- have been a column repeating itself thirty times.
--
-- It stops being honest the moment the admin module can invite a second person.
-- «A line was written on Master data» is a sentence nobody needs; «Anna wrote a
-- line on Master data» is the whole of what a notification is for.
--
-- WHY NOT AN EVENT TABLE. The obvious shape for notifications is a table of
-- events written by triggers, one row per person per thing. It was rejected for
-- the reason MASTER gives about stored derivations: every one of these events is
-- already a row with a date on it, and a second copy of it is a second thing to
-- keep true. A feed is a READ of the work, not a record beside it. So nothing is
-- written here that is not a fact about the row it sits on, and the feed is
-- assembled in lib/feed.ts from the rows themselves, which means it works
-- backwards over everything already in the database rather than starting empty
-- on the day it ships.
--
-- WHAT IS LOST, said plainly. There is no backfill and there cannot be one: the
-- author of a line written in August is not recorded anywhere, and inventing it
-- would put a name on work that name may not have done. Every row already here
-- carries null and will forever, and the feed says «somebody» for those. That
-- is worse than knowing and much better than guessing.
--
-- `on delete set null` throughout. Deleting an account must not delete the work
-- it wrote: a line on a project is a fact about that project, and the admin
-- module's delete already promises exactly this.

begin;

-- ---------------------------------------------------------------------------
-- The author, on the four tables a person writes to.
--
-- `default auth.uid()` rather than a column the application fills in. The
-- default is set by the database on every insert through a session, so no
-- server action can forget it and no future one can get it wrong. It is null
-- where there is no session, which is a real case and not a bug: /api/mcp
-- writes with a capture token and no user behind it, and a row that arrived
-- that way should say nobody rather than name whoever holds the token.
-- ---------------------------------------------------------------------------
alter table entry
  add column created_by uuid references auth.users(id) on delete set null
    default auth.uid();

comment on column entry.created_by is
  'Who wrote the line. Null for everything written before this column existed, '
  'and for anything written through /api/mcp, which has a token and no user. '
  'Never derived: a name on a line is read by other people.';

alter table blocker
  add column created_by uuid references auth.users(id) on delete set null
    default auth.uid();

comment on column blocker.created_by is
  'Who opened it. Not who it waits on: that is waiting_on, and it is text '
  'because the party waited on is often not an account here at all.';

alter table decision
  add column created_by uuid references auth.users(id) on delete set null
    default auth.uid();

comment on column decision.created_by is
  'Who recorded the decision. Not who made it: a decision is usually a room.';

alter table node
  add column created_by uuid references auth.users(id) on delete set null
    default auth.uid();

comment on column node.created_by is
  'Who created this piece of work. Not its driver: that is node.owner, which is '
  'text, changes hands, and is about who is doing it rather than who typed it.';

-- ---------------------------------------------------------------------------
-- The two blocker views are deliberately left alone.
--
-- Both are `select b.*`, and `b.*` was expanded into a fixed column list when
-- the view was created, so neither will ever show this column and
-- `create or replace` cannot add it: the new column lands in the middle of the
-- expansion rather than at the end, which is the one change that form of the
-- statement refuses.
--
-- Dropping and recreating them for a column only the feed wants is not worth
-- it. lib/feed.ts reads `blocker` directly, and everything else in the
-- application goes on reading v_blocker_days for the two figures it adds.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- What you have already seen.
--
-- One timestamp per person, and no read state per item. A row per person per
-- event is how a notification table earns its size, and the whole feed here is
-- derived, so there would be nothing to hang that row on: the events have no
-- ids of their own until they are assembled.
--
-- A single boundary also matches how the thing is actually used. You look, you
-- take in what is new, and what is new is «since I last looked». Marking one of
-- eleven items as read and leaving ten is a filing system, not a notification.
-- ---------------------------------------------------------------------------
alter table profile
  add column feed_seen_at timestamptz;

comment on column profile.feed_seen_at is
  'When this person last marked the feed seen. Null means never, and the feed '
  'is then all of it. One boundary rather than read state per item: the feed is '
  'derived, so its items have no identity to hang a read flag on.';

-- The column privilege from the admin migration has to grow with it, and this
-- is the failure that migration warned about: without this line the stamp
-- fails with «permission denied for table profile», which reads as RLS and is
-- not RLS. UPDATE stays revoked; these three are what a person sets about
-- themselves.
grant update (full_name, password_set_at, feed_seen_at) on profile to authenticated;

insert into schema_migration (version, applied_at, note)
values ('20260917000002_who_wrote_it_and_what_you_have_seen', now(),
        'An author on the four written tables, and a seen boundary per person')
on conflict (version) do nothing;

commit;
