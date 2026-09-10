-- What came out of a stand-up.
--
-- A stand-up produces three kinds of thing and the schema already holds all
-- three: a line in the log, a decision, and a piece of work with somebody's
-- name and a date on it. Nothing about a meeting needs a fourth.
--
-- What was missing is which meeting they came out of. Without that, «what did
-- we agree last Thursday» has no answer, and the one question a stand-up has to
-- answer at the top of the next stand-up is exactly that one.
--
-- SO NOTHING IS COPIED. A stamp, not a minutes table. A minutes table would say
-- «Jan takes the firewall quote by the 17th» in prose beside a task that says
-- the same thing in columns, and the two would disagree the first time the date
-- moved. With a stamp, «agreed last time» is a query, and its status is the
-- task's own status: if it got done, it reads as done, without anybody
-- returning to the minutes to say so.
--
-- ON DELETE SET NULL on all three, deliberately. Undoing a stand-up - closing
-- the wrong day - must put the boundary back without taking the week's work
-- with it. The line was still written and the task still exists; only the
-- claim about which meeting produced them goes away.

begin;

alter table entry    add column standup_id uuid references standup(id) on delete set null;
alter table decision add column standup_id uuid references standup(id) on delete set null;

/* On `node` this means «agreed at this stand-up», which is why it lives here
   rather than being read off created_at: work is created all week, and only
   some of it was asked for by a room. */
alter table node     add column standup_id uuid references standup(id) on delete set null;

create index entry_standup_idx    on entry(standup_id)    where standup_id is not null;
create index decision_standup_idx on decision(standup_id) where standup_id is not null;
create index node_standup_idx     on node(standup_id)     where standup_id is not null;

comment on column entry.standup_id is
  'Which stand-up this line was written at, where it was written at one. A '
  'stamp rather than a minutes table: the log is the record, this says which '
  'meeting produced it.';

comment on column node.standup_id is
  'Which stand-up asked for this work. Its progress is then the task own '
  'status, so «what we agreed last time» never needs updating by hand.';

insert into schema_migration (version, applied_at, note)
values ('20260910000006_standup_log', now(),
        'Which stand-up a line, a decision or a task came out of')
on conflict (version) do nothing;

commit;
