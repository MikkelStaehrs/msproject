-- A tie needs a last word.
--
-- `npm run audit` caught this, which is what it is for: v_next_date and the
-- audit's own recomputation disagreed about which of two tasks was next, and
-- both were right by their own reading.
--
-- The view orders candidates by `due_date asc, is_milestone desc, title asc`.
-- Three keys, and on this portfolio all three can tie: five subprojects each
-- carry a task called «Master data», none of them is a milestone, and the
-- stand-up has just given several of them the same date. Past the third key
-- Postgres is free to return either row, and it does: the same query can answer
-- differently between two runs, because nothing in the ordering distinguishes
-- them.
--
-- The bug is older than the tie. It has been there since the view was written
-- and was invisible while no two pieces of work shared a name, a date and a
-- flag, which is a condition a growing portfolio was always going to meet.
--
-- So the ordering ends on the id. It is arbitrary, which is the point: an
-- arbitrary answer that is the SAME every time is a stable page and a stable
-- report, and an arbitrary answer that changes is a figure two people cannot
-- agree on while looking at the same screen. The audit's recomputation gains
-- the same last key in the same commit.
--
-- Everything else about the view is untouched.

begin;

create or replace view v_next_date as
with candidate as (
  select
    d.root_id,
    n.id, n.title, n.due_date, n.is_milestone, n.status,
    row_number() over (
      partition by d.root_id
      -- The id is the tie-break of last resort. Nothing above it is unique.
      order by n.due_date asc, n.is_milestone desc, n.title asc, n.id asc
    ) as rn
  from v_node_descendant d
  join node n on n.id = d.node_id
  where d.depth > 0
    and n.due_date is not null
    and n.completed_at is null
    and n.status not in ('done','cancelled')
)
select
  root_id as node_id,
  id      as next_node_id,
  title,
  due_date,
  is_milestone,
  status,
  (due_date - current_date) as days_until
from candidate
where rn = 1;

alter view v_next_date set (security_invoker = on);

comment on view v_next_date is
  'The next dated, unfinished thing under each node. Ties are broken on the id '
  'so the answer is arbitrary but stable: a figure that changes between two '
  'reads is one two people cannot agree on while looking at the same screen.';

insert into schema_migration (version, applied_at, note)
values ('20260918000001_a_tie_needs_a_last_word', now(),
        'v_next_date breaks ties on the id, so the same query answers the same way twice')
on conflict (version) do nothing;

commit;
