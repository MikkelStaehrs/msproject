-- When the stand-up was actually held.
--
-- This is the whole table, and it is worth saying why it exists at all in an
-- application whose rule is that anything derivable must be derived.
--
-- Everything on a stand-up agenda IS derived: what is waiting, what is late,
-- what is ready and nobody started, what happened that nobody wrote a line
-- about. None of it is stored and none of it is ticked off. An item leaves the
-- agenda by being answered.
--
-- But "since last time" needs a last time, and that one fact is not in the data
-- anywhere. Taking it from the calendar - it is weekly, so last Monday - looks
-- like a derivation and is a guess: skip a week and a fortnight of movement is
-- silently reported as a week's. So the day is recorded, by the one gesture
-- that is honest about being a gesture: somebody presses a button saying the
-- meeting happened.
--
-- One row per meeting, one column that matters. Everything else on the screen
-- is worked out from it.

begin;

create table standup (
  id       uuid primary key default gen_random_uuid(),

  /* The day it was held. Unique, because holding two on one day is a slip of
     the finger rather than a fact, and undoing it is worse than preventing it. */
  held_on  date not null default current_date unique,

  /* Whoever pressed the button. Not an attendance list: attendance is derived
     from what the agenda needed, and a stored list would be the one thing on
     this screen that could disagree with the reason for the meeting. */
  held_by  uuid references auth.users(id) on delete set null default auth.uid(),

  /* Anything the room agreed that is not already a task, a blocker or a
     decision. Expected to be empty most weeks, and that is the intention:
     if it belongs to a project it belongs on the project. */
  note     text,

  created_at timestamptz not null default now()
);

create index standup_held_on_idx on standup(held_on desc);

comment on table standup is
  'One row per stand-up held. The date is the boundary every "since last time" '
  'is measured from; it is the only thing about a stand-up that is stored.';

comment on column standup.held_by is
  'Who closed the meeting. Deliberately not an attendance list: who was needed '
  'is derived from the agenda, and a stored list could disagree with it.';

-- ---------------------------------------------------------------------------
-- Shared among everyone signed in.
--
-- The rhythm is the company's, not a project's, so membership does not apply:
-- the date the room last met is the same date for everybody in it. What each
-- person SEES on the agenda is still cut by membership, because every row it is
-- built from - nodes, blockers, entries - carries its own policy. This table
-- holds a date and nothing else.
-- ---------------------------------------------------------------------------
alter table standup enable row level security;

create policy standup_shared on standup
  for all to authenticated
  using (auth.uid() is not null) with check (auth.uid() is not null);

insert into schema_migration (version, applied_at, note)
values ('20260910000003_standup', now(),
        'The day the stand-up was held. The only thing about it that is stored')
on conflict (version) do nothing;

commit;
