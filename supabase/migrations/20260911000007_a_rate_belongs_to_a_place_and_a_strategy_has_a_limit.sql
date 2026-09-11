-- Two qualifications that were held in somebody's head.
--
--
-- 1. THE HOUR RATE BELONGS TO A PLACE.
--
-- 240 kr is correct in Holeby. That sentence is the whole point: the figure has
-- always been right and has never said what it is right ABOUT, and it is used
-- every time an idea is described as hours saved, which is the most common way
-- an idea arrives here.
--
-- Another site with another rate would not make this number wrong. It would make
-- somebody use it for work it does not cover, and the answer would be a
-- confident figure in euro, per unit, as a share of the year's target, built on
-- a rate from a different factory. Nothing on the screen would look unusual.
--
-- This schema already has the grammar for that. `cost_basis_scope` sits beside
-- the denominator, `target_scope` beside the target, `stage_volume.scope`
-- beside each volume, and the pages say so when two of them disagree. A rate is
-- the same kind of number and was the only one carrying no population.
--
--
-- 2. A STRATEGY CAN CARRY A LIMIT, AND COGS DOES.
--
-- «ROI max 2 years» is a real rule and the application did not know it. There
-- is a `payback()` in lib/cost, computed as investment over the saving net of
-- what it costs to keep, and nothing anywhere says when the answer is too long.
--
-- It goes on the STRATEGY rather than into the code, for the same reason
-- `strategy` is a row rather than a boolean: this is the COGS programme's
-- requirement, not a truth about projects. The three headings beside it carry no
-- such limit, and a future strategy might set three years or none.
--
-- REPORTED, NEVER REFUSED, which is the difference between this and the gate at
-- promotion. The gate demands an ANSWER, because a claim with no answer cannot
-- be argued with at all. A payback is not an answer, it is an outcome: it moves
-- as quotes arrive, as scope changes, as a running cost is discovered. Refusing
-- to record work whose payback is currently four years would delete the
-- evidence that it is four years, which is the thing somebody needs to see.
--
-- Null means the strategy sets no limit, which is different from a limit of
-- zero and is the case for a heading.

begin;

alter table yardstick
  add column if not exists hour_rate_scope text;

comment on column yardstick.hour_rate_scope is
  'Where this rate is the right one. Free text, like the other scopes, because '
  'it names a site or a population rather than a set this schema owns. A rate '
  'with no scope is a rate somebody will apply to the wrong factory.';

update yardstick
   set hour_rate_scope = 'Holeby'
 where hour_rate_scope is null;

alter table strategy
  add column if not exists max_payback_years numeric(6,2)
    check (max_payback_years is null or max_payback_years > 0);

comment on column strategy.max_payback_years is
  'How long work serving this strategy may take to pay for itself. Null means '
  'the strategy sets no limit, which is not the same as a limit of zero. '
  'Reported against, never enforced: a payback is an outcome that moves as '
  'quotes arrive, and refusing the work would delete the evidence.';

update strategy
   set max_payback_years = 2
 where lower(name) = 'cogs saving'
   and max_payback_years is null;

/* The rate gained a scope, which is a statement about the figure rather than
   about the figure's correctness, so it does not unconfirm anything. It is
   left out of the trigger's list for the same reason `note` is. */

insert into schema_migration (version, applied_at, note)
values ('20260911000007_a_rate_belongs_to_a_place_and_a_strategy_has_a_limit', now(),
        'The hour rate says where it applies, and a strategy can set a maximum payback')
on conflict (version) do nothing;

commit;
