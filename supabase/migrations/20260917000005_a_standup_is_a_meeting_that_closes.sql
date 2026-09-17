-- A stand-up is a meeting that closes.
--
-- Until now the table held one fact: a day somebody pressed a button saying the
-- room met. That was the honest minimum while the whole screen was derived, and
-- it is not enough for a meeting you walk through in seven steps and then close.
--
-- Four things change.
--
-- 1. A STAND-UP IS OPEN OR CLOSED, and exactly one is open at a time. The open
--    one is the meeting you are in; closing it stamps what was agreed and
--    creates the next. There is no longer a gesture that says «it happened»
--    after the fact, because the meeting now exists before it happens.
--
-- 2. THE PERIOD IS EXPLICIT. `period_from` is when the previous one closed and
--    `period_to` is when this one did, so «since last time» is a range on the
--    row rather than a comparison between two rows. That is what stops anything
--    being counted twice when a meeting is skipped or held late.
--
-- 3. ATTENDANCE IS RECORDED. The old comment argued against it, and it argued
--    about a different thing: `attendees()` in lib/standup derives who the
--    agenda NEEDS, which is a question about the work. Who was in the room is a
--    question about the meeting, and nothing could answer it.
--
-- 4. WHAT THE MEETING DECIDED IS KEPT. `standup_item` is one row per thing the
--    room touched and what became of it. It is not a second copy of the work:
--    the blocker, the task and the decision stay where they are and stay the
--    truth. This records what was SAID about them, in a meeting, on a date,
--    which is the one thing the work itself cannot say.
--
-- WHY THE RPC IS DUMB. `close_standup` writes and nothing else. Every decision
-- about what is valid, what carries forward and what the summary says lives in
-- lib/standup-close.ts as pure functions, because the test suite here runs pure
-- functions with node and cannot reach a Postgres function at all. Logic that
-- cannot be tested is logic nobody will dare change. So TypeScript decides and
-- this applies, in one transaction, which is the one thing TypeScript cannot do
-- across five tables.
--
-- It is `security invoker`, so RLS applies to every write inside it. A payload
-- cannot reach further than the person sending it.

begin;

-- ---------------------------------------------------------------------------
-- The driver is called the driver, in the schema as well as on the screen.
--
-- `owner_id` arrived this morning and the word was already wrong: `owner` also
-- names a role field, `project_owner`, which is a different person answering a
-- different question. One word, one meaning.
-- ---------------------------------------------------------------------------
alter table node rename column owner_id to driver_id;
alter table node rename column owner_name to driver_name;
alter table node rename constraint node_one_driver to node_one_driver_named;

comment on column node.driver_id is
  'Who is driving this work. An account here, because a driver who cannot open '
  'the task is not driving it. Null is nobody, which the stand-up asks about.';

-- Parked: not now, and a date when it is asked about again. The third answer
-- on «who is driving this», beside a name and silence, and the only one of the
-- three that is a decision rather than a gap.
alter table node
  add column parked_until date;

comment on column node.parked_until is
  'Deliberately not now. Set in the stand-up beside naming a driver, because '
  '«nobody, on purpose, until October» is an answer and «nobody» is not.';

-- ---------------------------------------------------------------------------
-- The meeting
-- ---------------------------------------------------------------------------
create type standup_status as enum ('open', 'closed');

alter table standup
  add column status         standup_status not null default 'closed',
  add column facilitator_id uuid references profile(id) on delete set null,
  add column period_from    timestamptz,
  add column period_to      timestamptz,
  add column scheduled_at   timestamptz,
  add column closed_at      timestamptz,
  add column summary        jsonb;

-- Every row that exists is a meeting that already happened. The day it was held
-- becomes the instant it closed, and the period runs from the one before it.
update standup set closed_at = held_on::timestamptz, period_to = held_on::timestamptz;

update standup s
   set period_from = prev.closed_at
  from (
    select id, lag(closed_at) over (order by closed_at) as closed_at
      from standup
  ) prev
 where prev.id = s.id;

update standup set facilitator_id = held_by where held_by is not null;

-- `held_on` was the whole table once. It says the same thing `closed_at` says
-- and it cannot describe a meeting that has not finished, which is now the
-- interesting kind.
alter table standup drop column held_on;

comment on column standup.period_from is
  'When the previous stand-up closed. Null on the first one, which is not a '
  'quiet period but the absence of one, and the screen says so.';
comment on column standup.period_to is
  'When this one closed. Equal to closed_at, and kept separate because a period '
  'is a thing the summary is about and closed_at is a thing that happened.';
comment on column standup.summary is
  'What the meeting came to, frozen at the moment it closed. Assembled in '
  'lib/standup-close.ts. Never recomputed: a retrospective that changes when '
  'the work moves is not a record of a meeting.';

-- Exactly one meeting is open. Two would mean two answers to «where are we
-- now», and the second one would be invisible until somebody closed the first.
create unique index standup_one_open on standup (status) where status = 'open';

-- ---------------------------------------------------------------------------
-- Who was in the room
-- ---------------------------------------------------------------------------
create table standup_attendee (
  standup_id uuid not null references standup(id) on delete cascade,
  person_id  uuid not null references profile(id) on delete cascade,
  present    boolean not null default true,
  primary key (standup_id, person_id)
);

comment on table standup_attendee is
  'Who was in the room, recorded rather than derived. attendees() in '
  'lib/standup answers a different question: who the AGENDA needs.';

-- ---------------------------------------------------------------------------
-- What the room touched, and what became of it
-- ---------------------------------------------------------------------------
create type standup_item_kind as enum (
  'blocker',
  'unowned',
  'commitment',
  'decision',
  'spark'
);

create type standup_item_action as enum (
  'resolved',
  'carried',
  'assigned',
  'parked',
  'logged',
  'missed'
);

create table standup_item (
  id           uuid primary key default gen_random_uuid(),
  standup_id   uuid not null references standup(id) on delete cascade,
  /* Null for a spark, which is not about a node yet and may never be. */
  node_id      uuid references node(id) on delete cascade,
  kind         standup_item_kind   not null,
  action       standup_item_action not null,
  driver_id    uuid references profile(id) on delete set null,
  next_step    text,
  due_date     date,
  parked_until date,
  note         text,
  created_at   timestamptz not null default now()
);

create index standup_item_standup_idx on standup_item (standup_id);
create index standup_item_node_idx    on standup_item (node_id);

comment on table standup_item is
  'One row per thing the room touched and what became of it. Not a second copy '
  'of the work: the blocker, the task and the decision stay where they are and '
  'stay the truth. This records what was said about them, in a meeting, on a '
  'date, which is the one thing the work itself cannot say.';

-- ---------------------------------------------------------------------------
-- A closed meeting does not change.
--
-- Enforced here rather than by not drawing the buttons. The whole value of a
-- retrospective is that it says what was true then, and a record you can edit
-- afterwards is a record of what you wish had been true.
-- ---------------------------------------------------------------------------
create or replace function standup_is_sealed()
returns trigger
language plpgsql
as $$
begin
  if old.status = 'closed' then
    raise exception 'That stand-up is closed. A closed meeting is a record, not a draft.';
  end if;
  return new;
end;
$$;

create trigger standup_sealed
  before update or delete on standup
  for each row execute function standup_is_sealed();

create or replace function standup_child_is_sealed()
returns trigger
language plpgsql
as $$
declare
  sid uuid := coalesce(new.standup_id, old.standup_id);
begin
  if (select status from standup where id = sid) = 'closed' then
    raise exception 'That stand-up is closed. A closed meeting is a record, not a draft.';
  end if;
  return coalesce(new, old);
end;
$$;

create trigger standup_item_sealed
  before insert or update or delete on standup_item
  for each row execute function standup_child_is_sealed();

create trigger standup_attendee_sealed
  before insert or update or delete on standup_attendee
  for each row execute function standup_child_is_sealed();

-- ---------------------------------------------------------------------------
-- Shared among everyone signed in, like the meeting itself.
--
-- The rhythm is the company's, not a project's. What each person SEES on the
-- agenda is still cut by membership, because every row it is built from carries
-- its own policy.
-- ---------------------------------------------------------------------------
alter table standup_attendee enable row level security;
alter table standup_item     enable row level security;

create policy standup_attendee_shared on standup_attendee
  for all to authenticated
  using (auth.uid() is not null) with check (auth.uid() is not null);

create policy standup_item_shared on standup_item
  for all to authenticated
  using (auth.uid() is not null) with check (auth.uid() is not null);

-- ---------------------------------------------------------------------------
-- The meeting that is running now.
--
-- Created here so the application never has to ask whether one exists. Its
-- period starts where the last one ended, and it is scheduled a week after it.
-- ---------------------------------------------------------------------------
insert into standup (status, period_from, scheduled_at)
select 'open',
       max(closed_at),
       coalesce(max(closed_at), now()) + interval '7 days'
  from standup;

-- ---------------------------------------------------------------------------
-- Closing it. One transaction, no judgement.
-- ---------------------------------------------------------------------------
create or replace function close_standup(
  p_standup_id uuid,
  p_summary    jsonb,
  p_writes     jsonb
)
returns jsonb
language plpgsql
as $$
declare
  s       standup%rowtype;
  w       jsonb;
  closed  timestamptz := now();
  next_at timestamptz;
begin
  select * into s from standup where id = p_standup_id for update;
  if not found then
    raise exception 'That stand-up does not exist, or you cannot see it.';
  end if;

  /*
   * Idempotent. Pressing it twice, or a retry after a dropped connection, gets
   * the answer the first call gave rather than a second meeting and a second
   * set of writes.
   */
  if s.status = 'closed' then
    return coalesce(s.summary, '{}'::jsonb);
  end if;

  /* What the room touched. */
  for w in select value from jsonb_array_elements(coalesce(p_writes -> 'items', '[]'::jsonb)) loop
    insert into standup_item (
      standup_id, node_id, kind, action, driver_id, next_step, due_date,
      parked_until, note
    ) values (
      p_standup_id,
      nullif(w ->> 'node_id', '')::uuid,
      (w ->> 'kind')::standup_item_kind,
      (w ->> 'action')::standup_item_action,
      nullif(w ->> 'driver_id', '')::uuid,
      nullif(w ->> 'next_step', ''),
      nullif(w ->> 'due_date', '')::date,
      nullif(w ->> 'parked_until', '')::date,
      nullif(w ->> 'note', '')
    );
  end loop;

  /* Drivers named out loud. */
  for w in select value from jsonb_array_elements(coalesce(p_writes -> 'drivers', '[]'::jsonb)) loop
    update node
       set driver_id    = nullif(w ->> 'driver_id', '')::uuid,
           driver_name  = null,
           parked_until = null
     where id = (w ->> 'node_id')::uuid;
  end loop;

  /* Not now, and a date when it is asked about again. */
  for w in select value from jsonb_array_elements(coalesce(p_writes -> 'parked', '[]'::jsonb)) loop
    update node
       set parked_until = nullif(w ->> 'parked_until', '')::date
     where id = (w ->> 'node_id')::uuid;
  end loop;

  /* Blockers the room settled. */
  for w in select value from jsonb_array_elements(coalesce(p_writes -> 'blockers', '[]'::jsonb)) loop
    update blocker
       set resolved_at = coalesce(nullif(w ->> 'resolved_at', '')::date, current_date),
           resolution  = nullif(w ->> 'resolution', '')
     where id = (w ->> 'id')::uuid;
  end loop;

  /* Decisions, written where the work is rather than in minutes. */
  for w in select value from jsonb_array_elements(coalesce(p_writes -> 'decisions', '[]'::jsonb)) loop
    insert into decision (node_id, decided_on, decision, rationale, topic, standup_id)
    values (
      (w ->> 'node_id')::uuid,
      coalesce(nullif(w ->> 'decided_on', '')::date, current_date),
      w ->> 'decision',
      nullif(w ->> 'rationale', ''),
      coalesce(nullif(w ->> 'topic', '')::decision_topic, 'other'),
      p_standup_id
    );
  end loop;

  /*
   * Sparks land in the inbox of whoever is closing the meeting, because a spark
   * is private to its author and `spark.user_id` defaults to auth.uid(). The
   * screen says so where they are typed: this is not a shared idea list, it is
   * the facilitator writing down what the room threw out.
   */
  for w in select value from jsonb_array_elements(coalesce(p_writes -> 'sparks', '[]'::jsonb)) loop
    insert into spark (body, note, source)
    values (w ->> 'body', nullif(w ->> 'note', ''), 'app');
  end loop;

  /* The meeting closes. The trigger allows this one transition and no other. */
  update standup
     set status    = 'closed',
         closed_at = closed,
         period_to = closed,
         summary   = p_summary
   where id = p_standup_id;

  /*
   * And the next one opens, a week after this one was scheduled rather than a
   * week after it actually finished. A meeting held late should not move the
   * rhythm; if the rhythm has genuinely changed, somebody moves the date, which
   * is a decision and looks like one.
   */
  next_at := coalesce(s.scheduled_at, closed) + interval '7 days';

  insert into standup (status, period_from, scheduled_at)
  values ('open', closed, next_at);

  return p_summary;
end;
$$;

comment on function close_standup(uuid, jsonb, jsonb) is
  'Applies what the meeting agreed and closes it, in one transaction. Holds no '
  'judgement: validation, the summary and what carries forward are decided in '
  'lib/standup-close.ts, which is testable. Idempotent, and security invoker so '
  'RLS applies to every write inside it.';

revoke all on function close_standup(uuid, jsonb, jsonb) from public, anon;
grant execute on function close_standup(uuid, jsonb, jsonb) to authenticated;

insert into schema_migration (version, applied_at, note)
values ('20260917000005_a_standup_is_a_meeting_that_closes', now(),
        'Stand-ups open and close, with attendance, items and a snapshot')
on conflict (version) do nothing;

commit;
