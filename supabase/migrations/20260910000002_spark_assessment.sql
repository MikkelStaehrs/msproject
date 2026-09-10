-- What an idea is worth, and what it would take.
--
-- This is the stress test, and it is deliberately two numbers rather than a
-- form. A twelve field template gets filled in once, badly, because it asks for
-- answers nobody has yet. Two numbers get filled in every week.
--
--   the saving   how much cost it takes out, in whichever of three ways it was
--                actually described
--   the scores   cost, benefit and complexity on the company's own one to five
--                scale, which is what the project group works in
--
-- Everything else is computed. The annual kroner, the euro per unit, the share
-- of the year's target, the priority and the quadrant all follow from those,
-- and none of them can be typed in and go stale.
--
-- IT SITS ON THE SPARK, not on a node, and that matters. Most ideas should
-- die, and creating a project in order to assess something you are about to
-- kill would put every passing thought in the tree. A spark that survives keeps
-- its assessment and points at what it became through became_node_id, so the
-- project can always show what was promised for it when it was still an idea.

begin;

/**
 * How the saving was described. All three end at kroner a year; see lib/cogs.
 *
 * Three rather than one because a saving arrives in whatever unit the person
 * who spotted it thinks in. Forcing it into kroner at the point of capture is
 * how a number gets invented on the spot.
 */
create type saving_kind as enum (
  'hours',     -- man-hours saved a year. Times the hourly rate.
  'per_unit',  -- kroner per unit through one stage. Times that stage's volume.
  'annual'     -- kroner a year, already
);

alter table spark
  add column saving_kind  saving_kind,
  add column saving_value numeric(14,4),
  -- Only meaningful for per_unit: which stage the units pass through. The
  -- stages do not run the same quantities, and the same saving is worth 68%
  -- more on cleaning than on coating.
  add column saving_stage text,

  -- The company's own scale. Only a person can set these.
  add column cost_score       smallint check (cost_score between 1 and 5),
  add column benefit_score    smallint check (benefit_score between 1 and 5),
  add column complexity_score smallint check (complexity_score between 1 and 5),

  -- A per_unit saving without a stage cannot be turned into kroner at all.
  add constraint spark_stage_needed check (
    saving_kind is distinct from 'per_unit' or saving_stage is not null
  ),
  -- A kind without a figure, or a figure without a kind, is half an answer.
  add constraint spark_saving_complete check (
    (saving_kind is null and saving_value is null)
    or (saving_kind is not null and saving_value is not null)
  );

comment on column spark.saving_kind is
  'How the saving was described. All three end at kroner a year in lib/cogs.';
comment on column spark.saving_value is
  'Hours a year, kroner per unit through saving_stage, or kroner a year.';
comment on column spark.benefit_score is
  'One to five, as the project group scores. Nothing derived is stored beside '
  'it: the priority and the quadrant follow from these three and are computed.';

insert into schema_migration (version, applied_at, note)
values ('20260910000002_spark_assessment', now(),
        'A saving and three scores on a spark. Everything else is computed')
on conflict (version) do nothing;

commit;
