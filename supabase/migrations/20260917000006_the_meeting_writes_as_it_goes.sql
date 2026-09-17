-- The meeting writes as it goes.
--
-- The migration before this one gave the close an `items` payload and left a
-- question open: where do the answers live for the twenty minutes between the
-- room starting and somebody pressing the button. Holding them in the page and
-- writing them all at the end loses the meeting to a reload, and a stand-up is
-- exactly the kind of thing somebody reloads.
--
-- So they are written as they are said, to the rows they are about. That is
-- also the rule this application already lives by: an item leaves the agenda by
-- being answered, not by being ticked. Naming a driver in step three IS naming
-- the driver; the close records that the meeting did it, and does not do it.
--
-- Two columns follow from that, and both are facts about a blocker rather than
-- about a meeting.

begin;

-- ---------------------------------------------------------------------------
-- A blocker has somebody on it, and a next step.
--
-- `waiting_on` is who you are waiting FOR, and it is usually an organisation.
-- These two are who is chasing it here and what they will do, which is the
-- thing the room actually decides and which nothing recorded.
-- ---------------------------------------------------------------------------
alter table blocker
  add column driver_id uuid references profile(id) on delete set null,
  add column next_step text;

comment on column blocker.driver_id is
  'Who is chasing it. Not waiting_on, which is the party being waited FOR and '
  'is text because it is usually an organisation.';
comment on column blocker.next_step is
  'What that person will do before the next stand-up. Without it a blocker gets '
  'read out again next week in the same words.';

-- The two blocker views are `select b.*`, expanded at creation, so they have to
-- be recreated to carry the new columns. Same as 20260917000003; the reasoning
-- is written out there.
drop view v_active_blocker;
drop view v_blocker_days;

create view v_active_blocker as
select
  b.*,
  current_date - b.opened_at as days_blocked,
  case when b.expected_by is not null and b.expected_by < current_date
       then true else false end as overdue
from blocker b
where b.resolved_at is null;

create view v_blocker_days as
select
  b.*,
  coalesce(b.resolved_at, current_date) - b.opened_at as days_blocked,
  (b.resolved_at is null) as is_active
from blocker b;

alter view v_active_blocker set (security_invoker = on);
alter view v_blocker_days   set (security_invoker = on);

comment on view v_active_blocker is
  'Open blockers with the days they have been open. Overdue is against the '
  'date a reply was expected, not against any deadline of the work.';
comment on view v_blocker_days is
  'Every blocker with the days it was open, and whether it still is. The one '
  'the charts and the stand-up read.';

-- ---------------------------------------------------------------------------
-- Which blocker an item was about.
--
-- A node can carry two blockers, so the node id does not identify one. This is
-- what «how many stand-ups has this been in» counts, and it has to be exact:
-- the number is the argument for escalating, and an argument built on a guess
-- is one somebody will take apart in the meeting.
-- ---------------------------------------------------------------------------
alter table standup_item
  add column ref_id uuid;

comment on column standup_item.ref_id is
  'The blocker this item was about, where it was about one. Not a foreign key '
  'on purpose: a blocker deleted later must not erase the record that a meeting '
  'discussed it.';

create index standup_item_ref_idx on standup_item (ref_id) where ref_id is not null;

-- ---------------------------------------------------------------------------
-- Closing, with the items replaced rather than added to.
--
-- The stepper writes draft items as the room walks, so by the time the button
-- is pressed there are already rows here. The close writes the final set:
-- delete, then insert what lib/standup-close.ts worked out. That makes the
-- close say exactly what the meeting came to rather than what it passed through
-- on the way, and it keeps the function idempotent in the only way that
-- matters, which is that running it twice cannot double anything.
--
-- Everything else is unchanged; see 20260917000005 for the rest of the
-- reasoning.
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

  if s.status = 'closed' then
    return coalesce(s.summary, '{}'::jsonb);
  end if;

  /* The drafts the room walked through go; what it came to takes their place. */
  delete from standup_item where standup_id = p_standup_id;

  for w in select value from jsonb_array_elements(coalesce(p_writes -> 'items', '[]'::jsonb)) loop
    insert into standup_item (
      standup_id, node_id, ref_id, kind, action, driver_id, next_step, due_date,
      parked_until, note
    ) values (
      p_standup_id,
      nullif(w ->> 'node_id', '')::uuid,
      nullif(w ->> 'ref_id', '')::uuid,
      (w ->> 'kind')::standup_item_kind,
      (w ->> 'action')::standup_item_action,
      nullif(w ->> 'driver_id', '')::uuid,
      nullif(w ->> 'next_step', ''),
      nullif(w ->> 'due_date', '')::date,
      nullif(w ->> 'parked_until', '')::date,
      nullif(w ->> 'note', '')
    );
  end loop;

  /*
   * These four are written live by the stepper as the room answers them. They
   * are repeated here on purpose: if one of those writes failed and nobody
   * noticed, the close puts it right, and writing the same value twice costs
   * nothing.
   */
  for w in select value from jsonb_array_elements(coalesce(p_writes -> 'drivers', '[]'::jsonb)) loop
    update node
       set driver_id    = nullif(w ->> 'driver_id', '')::uuid,
           driver_name  = null,
           parked_until = null
     where id = (w ->> 'node_id')::uuid;
  end loop;

  for w in select value from jsonb_array_elements(coalesce(p_writes -> 'parked', '[]'::jsonb)) loop
    update node
       set parked_until = nullif(w ->> 'parked_until', '')::date
     where id = (w ->> 'node_id')::uuid;
  end loop;

  for w in select value from jsonb_array_elements(coalesce(p_writes -> 'blockers', '[]'::jsonb)) loop
    update blocker
       set resolved_at = coalesce(resolved_at, nullif(w ->> 'resolved_at', '')::date, current_date),
           resolution  = coalesce(resolution, nullif(w ->> 'resolution', ''))
     where id = (w ->> 'id')::uuid;
  end loop;

  /*
   * Decisions and sparks are the two that CREATE rows, so they are the two that
   * wait for the close. Written on the way through, a meeting somebody reopened
   * and walked again would leave two of each.
   */
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

  for w in select value from jsonb_array_elements(coalesce(p_writes -> 'sparks', '[]'::jsonb)) loop
    insert into spark (body, note, source)
    values (w ->> 'body', nullif(w ->> 'note', ''), 'app');
  end loop;

  update standup
     set status    = 'closed',
         closed_at = closed,
         period_to = closed,
         summary   = p_summary
   where id = p_standup_id;

  next_at := coalesce(s.scheduled_at, closed) + interval '7 days';

  insert into standup (status, period_from, scheduled_at)
  values ('open', closed, next_at);

  return p_summary;
end;
$$;

revoke all on function close_standup(uuid, jsonb, jsonb) from public, anon;
grant execute on function close_standup(uuid, jsonb, jsonb) to authenticated;

insert into schema_migration (version, applied_at, note)
values ('20260917000006_the_meeting_writes_as_it_goes', now(),
        'A blocker gets a driver and a next step; the close replaces its draft items')
on conflict (version) do nothing;

commit;
