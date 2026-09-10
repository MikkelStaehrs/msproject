-- What was promised for this, while it was still an idea.
--
-- A spark that survives points at what it became through `became_node_id`, and
-- until now that pointer only worked in one direction. Standing on the project
-- there was no way back to the figure that got it approved, which is the one
-- number anybody asks about six months later: what did we say this would save?
--
-- The obvious fix is to follow the pointer backwards. It does not work, and the
-- reason is worth writing down rather than discovering twice.
--
-- SPARKS ARE PRIVATE TO THEIR AUTHOR. A spark is half a thought at eleven at
-- night and a colleague has no business reading it, so `spark_mine` is
-- `user_id = auth.uid()`. Read the promise through the spark and the project
-- shows its own origin to exactly one person and, worse, shows nothing to
-- everyone else with no indication that anything is missing.
--
-- So the promise is COPIED at the moment of promotion, and that copy is not a
-- duplicate of derived data - it is a different fact. The spark holds what the
-- idea says NOW, and stays editable. This holds what was claimed for it ON THE
-- DAY it was turned into work, which is what a decision was taken on and must
-- not change afterwards. Exactly like a cost line keeping the exchange rate
-- that applied when the price landed.
--
-- Nothing computed is stored here either. The kroner a year, the euro per unit,
-- the share of the target, the priority and the quadrant are all worked out
-- from these columns by lib/cogs.ts and lib/priority.ts, against the yardstick
-- as it stands, so the promise can be re-read in this year's money.

begin;

create table node_origin (
  -- One per node. A project has one origin or none; two would be two stories.
  node_id    uuid primary key references node(id) on delete cascade,

  /* Where it came from, if the spark is still there. Nulled rather than
     cascading: deleting a stray thought must not delete the record of what was
     promised for the work it became. */
  spark_id   uuid references spark(id) on delete set null,

  /* The idea in the words it was first put in, and what made it make sense.
     Copied, because the spark stays editable and this must not move. */
  body       text not null,
  note       text,

  /* The assessment as it stood at promotion. Same shape as on `spark`, and
     read by the same functions. */
  saving_kind      saving_kind,
  saving_value     numeric(14,4),
  saving_stage     text,
  cost_score       smallint check (cost_score between 1 and 5),
  benefit_score    smallint check (benefit_score between 1 and 5),
  complexity_score smallint check (complexity_score between 1 and 5),

  /* Which yardstick the figure was measured against. A saving means nothing
     without the year it was weighed in: FY26 sold 23% fewer units than FY25,
     and the same kroner is a different share of the target in each. */
  fiscal_year text,

  promised_at timestamptz not null default now(),
  promised_by uuid references auth.users(id) on delete set null default auth.uid()
);

comment on table node_origin is
  'What was claimed for this work on the day it stopped being an idea. Copied '
  'from the spark rather than read through it: sparks are private to their '
  'author, and a promise the team cannot see is not a promise. Nothing '
  'computed is stored; the money is worked out from these columns.';

comment on column node_origin.fiscal_year is
  'The yardstick the figure was weighed against. Without it a saving cannot be '
  'read back honestly: the same kroner is a different share of a different '
  'year.';

-- ---------------------------------------------------------------------------
-- Visible to whoever can see the work.
--
-- Not to whoever wrote the spark. That is the entire point of copying it: the
-- promise belongs to the project now, and the project is what membership
-- governs.
-- ---------------------------------------------------------------------------
alter table node_origin enable row level security;

create policy node_origin_visible on node_origin
  for all to authenticated
  using (can_see_node(node_id)) with check (can_see_node(node_id));

-- ---------------------------------------------------------------------------
-- Everything already promoted.
--
-- Runs as the migration rather than as a user, so it sees every spark
-- regardless of who wrote it. That is the only moment this backfill is
-- possible: through the application these rows are unreachable to anyone but
-- their author, which is the problem being fixed.
-- ---------------------------------------------------------------------------
insert into node_origin (
  node_id, spark_id, body, note,
  saving_kind, saving_value, saving_stage,
  cost_score, benefit_score, complexity_score,
  fiscal_year, promised_at, promised_by
)
select
  s.became_node_id, s.id, s.body, s.note,
  s.saving_kind, s.saving_value, s.saving_stage,
  s.cost_score, s.benefit_score, s.complexity_score,
  (select fiscal_year from yardstick limit 1),
  s.updated_at, s.user_id
from spark s
join node n on n.id = s.became_node_id
where s.became_node_id is not null
on conflict (node_id) do nothing;

insert into schema_migration (version, applied_at, note)
values ('20260910000005_node_origin', now(),
        'What was promised for a piece of work while it was still an idea')
on conflict (version) do nothing;

commit;
