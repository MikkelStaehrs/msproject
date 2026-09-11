-- A thought has to say what it is worth before it becomes work, and it gains a
-- third way out.
--
-- Two changes, and the same measurement is behind both. Seven sparks, none
-- assessed, and two log entries in the whole database. Promotion costs nothing
-- today, and a thing that is optional is a thing that does not happen: that is
-- not a claim about discipline, it is what the tables say after a fortnight.
--
--
-- 1. THE GATE. A spark that becomes WORK has to answer «what is this worth».
--
-- Not with a number. A required amount is worse than an empty field, and that
-- is not an abstraction here: `sold_units` entered this schema as a reasonable
-- inference written down as a fact, and everybody who read it afterwards
-- believed it. Force a budget on a thought that has none and you get a 0 or a
-- fiction, and a fiction in a column outlives the person who typed it.
--
-- Nor does everything have a saving. Moving a scanner out of a room, removing a
-- risk, work that only exists so other work can start: all real, none of them a
-- number. So three answers are accepted and only SILENCE is refused:
--
--   saving    a figure, in one of the three forms lib/cogs already knows
--   enabling  no direct saving, and a sentence saying why it is worth doing
--   unknown   not worked out yet, said out loud rather than left blank
--
-- `worth_basis` is that answer. The pattern is `decision.topic`, where `other`
-- means «not filed», the page counts them and filing one is a click. What
-- changes is not that an answer becomes possible, it is that no answer stops
-- being possible.
--
-- The three 1-5 scores are required alongside it, and that is deliberate rather
-- than thorough. `priorityScore` returns null unless all three are set,
-- because two judgements out of three produce a number that looks comparable to
-- a complete one and is not. So partial scoring buys nothing: either the
-- candidate has a position in the benefit-against-complexity matrix or it does
-- not, and the matrix is the whole reason the scores exist.
--
-- ENFORCED HERE, not only in the form. The check constraint cannot be forgotten
-- by a second caller, and `promoteSpark` is not the only thing that could ever
-- write a node_origin.
--
--
-- 2. THE THIRD EXIT. Not every thought is work.
--
-- `promoteSpark` can do exactly one thing: create a node. So a spark has two
-- possible fates today, a new node or the bin, and there is a third that is
-- common and has nowhere to go: an observation about work that is ALREADY
-- running. «The CT scan has been moved out of the analytics room» is not a
-- task. Forced through the current form it becomes a task that is not a task.
--
-- It should become a line in the log on the node it concerns, and that is also
-- the only route this application has ever had from «I thought of something» to
-- `entry`, which is the table the whole weekly report is assembled from and
-- which holds two rows.
--
-- `became_entry_id` records that it went that way. It sits BESIDE
-- `became_node_id` rather than reusing it, because «became this node» and «was
-- written onto this node» are different facts and a reader six months later
-- should not have to guess which happened. Both are `on delete set null`, for
-- the reason the first one already is: deleting what a thought turned into must
-- not erase the record that the thought was had and acted on.
--
-- The gate does NOT apply to this exit. An observation about existing work owes
-- nobody a business case.

begin;

-- ---------------------------------------------------------------------------
-- What the claim rests on.
-- ---------------------------------------------------------------------------
do $$
begin
  create type worth_basis as enum ('saving', 'enabling', 'unknown');
exception
  when duplicate_object then null;
end;
$$;

alter table spark
  add column if not exists worth_basis worth_basis,
  add column if not exists worth_note  text;

comment on column spark.worth_basis is
  'What the claim rests on, answered when the thought becomes work: a saving, '
  'enabling work with a stated reason, or not worked out yet. Null means the '
  'question has not been put, which is different from an answer of unknown.';
comment on column spark.worth_note is
  'Why it is worth doing when there is no direct saving. Required for '
  '''enabling'' and meaningless otherwise.';

/* The answer has to hold together with what is beside it. A basis of «saving»
   with no figure, or «enabling» with no reason, is the question left half
   answered while looking answered, which is the state this whole change exists
   to remove. Written so a row that predates the column is untouched. */
alter table spark drop constraint if exists spark_worth_coherent;
alter table spark add constraint spark_worth_coherent check (
  worth_basis is null
  or (worth_basis = 'saving'   and saving_kind is not null)
  or (worth_basis = 'enabling' and worth_note is not null and length(trim(worth_note)) > 0)
  or  worth_basis = 'unknown'
);

-- ---------------------------------------------------------------------------
-- Where a thought went, when it did not become a node.
-- ---------------------------------------------------------------------------
alter table spark
  add column if not exists became_entry_id uuid references entry(id) on delete set null;

comment on column spark.became_entry_id is
  'The log line this thought became, where it was an observation about work '
  'already running rather than new work. Beside became_node_id, never instead '
  'of it: the two are different fates and both are worth being able to read.';

-- ---------------------------------------------------------------------------
-- The copy that travels onto the work.
--
-- node_origin holds what was CLAIMED on the day, so it has to carry the answer
-- as well as the figure. Without it an origin can say «no saving» and not say
-- why, which is the half that answers the question six months later.
-- ---------------------------------------------------------------------------
alter table node_origin
  add column if not exists worth_basis worth_basis,
  add column if not exists worth_note  text;

comment on column node_origin.worth_basis is
  'What the claim rested on at the moment of promotion. Frozen, like the rest '
  'of this row: the spark stays editable and this must not move.';

-- ---------------------------------------------------------------------------
-- The gate itself, where it cannot be forgotten.
--
-- A form can be bypassed and a second caller can be written. This is the one
-- place that is true of neither. Existing rows are left alone: the constraint
-- is written so that what is already there stays valid, because a migration
-- that refuses to apply against real data is a migration nobody applies.
-- ---------------------------------------------------------------------------
alter table node_origin drop constraint if exists node_origin_worth_stated;
alter table node_origin add constraint node_origin_worth_stated check (
  worth_basis is null
  or (worth_basis = 'saving'   and saving_kind is not null)
  or (worth_basis = 'enabling' and worth_note is not null and length(trim(worth_note)) > 0)
  or  worth_basis = 'unknown'
);

insert into schema_migration (version, applied_at, note)
values ('20260911000003_worth_and_third_exit', now(),
        'A thought says what it is worth before it becomes work, and can become a log line instead')
on conflict (version) do nothing;

commit;
