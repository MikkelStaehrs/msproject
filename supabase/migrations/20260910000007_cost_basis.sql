-- The denominator is processed units, not sold units, and it is filtered.
--
-- `yardstick.sold_units` held 266 253 with a note reading «Sold units and unit
-- cost from the FY26 COGS dashboard». Nobody ever said that. On the dashboard
-- the figure is labelled simply «Units», sitting beside «Unit Cost + IPC», and
-- it is the divisor the 577,70 kr is computed with: PROCESSED units. A column
-- name asserting something nobody said is worse than no column, because every
-- reader after that takes the name for a fact.
--
-- It also came out of a dashboard filtered to Brand Code = In-house and
-- Type = Sugar. So it is not even all processed units - it is one slice.
--
-- THE ARITHMETIC MAY WELL HAVE BEEN RIGHT ANYWAY, and that is the trap. For
-- «take one euro of COGS out of every unit» to mean anything, the target has to
-- be divided by the same denominator the unit cost is divided by. Otherwise
-- «577,70 kr per unit» and «1 € per unit» are per different units and the
-- subtraction is meaningless. So the number is plausibly the right one for the
-- job; the NAME was a guess, and the scope was never recorded at all.
--
-- WHICH LEAVES ONE REAL MISMATCH, recorded here rather than silently carried:
-- stage_volume is unfiltered. Rensning ran 465 216 units of everything, while
-- the cost basis counts 266 253 units of in-house sugar. A saving per cleaned
-- unit multiplied by the first and then divided by the second mixes two
-- populations, and it overstates the share of the target. The scope now travels
-- with both numbers so the two can be compared instead of assumed equal.

begin;

alter table yardstick rename column sold_units to cost_basis_units;

alter table yardstick
  /* Which population the figure counts. Free text because it is a filter on
     somebody's dashboard, not a closed set this schema owns. */
  add column cost_basis_scope text;

update yardstick
set cost_basis_scope = 'In-house · Sugar',
    note = 'Processed units and unit cost from the FY26 COGS dashboard, '
        || 'filtered to Brand Code = In-house and Type = Sugar. 266 253 is the '
        || 'divisor the 577,70 kr unit cost is computed with, not units sold. '
        || 'A unit is one hectare of sugar beet seed.';

comment on column yardstick.cost_basis_units is
  'The divisor the unit cost is computed with: PROCESSED units, in the scope '
  'named beside it. The target must use the same denominator as the unit cost '
  'or the two are per different units and cannot be subtracted.';

comment on column yardstick.cost_basis_scope is
  'Which population cost_basis_units counts. Compare it with stage_volume.scope '
  'before trusting a share of the target: mixing two populations overstates it.';

-- ---------------------------------------------------------------------------
-- The same question, asked of the stage volumes.
--
-- These came off the process dashboard with no filter applied, so they are
-- every type. Saying so is the whole point: two numbers that cannot be compared
-- look exactly like two numbers that can.
-- ---------------------------------------------------------------------------
alter table stage_volume
  add column scope text;

update stage_volume set scope = 'Alle typer';

comment on column stage_volume.scope is
  'Which population these units count. Unfiltered off the process dashboard, '
  'so wider than the cost basis, which is one slice of it.';

insert into schema_migration (version, applied_at, note)
values ('20260910000007_cost_basis', now(),
        'The denominator is processed units in a named scope, not sold units')
on conflict (version) do nothing;

commit;
