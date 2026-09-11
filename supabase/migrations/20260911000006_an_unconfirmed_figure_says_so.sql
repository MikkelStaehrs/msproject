-- A target this company has not confirmed, and one that was stated twice.
--
--
-- 1. THE FIGURES ARE NOT CONFIRMED, AND NOTHING SAID SO.
--
-- The yardstick holds the numbers every share of the year's target divides by.
-- They came off a dashboard, and this file's own history is the argument for
-- what follows: `sold_units` held 266 253 with a note claiming it was units
-- SOLD. Nobody had ever said that. It was a reasonable inference, written into
-- a column name, and every reader after that took the name for a fact. It took
-- a migration to correct and two passages of prose had already cited it.
--
-- The lesson was recorded and then not applied to the figures themselves. The
-- unit cost, the hour rate, the euro rate, the denominator and the one euro
-- target are all still unverified against their source, and every screen
-- presents them in tabular numerals as though they were settled. A percentage
-- shown without a caveat is a percentage somebody quotes in a meeting.
--
-- So confirmation becomes a fact the row carries. Null means nobody has held
-- these up against the dashboard, which is TRUE TODAY of every one of them.
--
-- AND IT CANNOT BE CLICKED PAST AND FORGOTTEN. The trigger below clears the
-- confirmation whenever any figure moves. That is the whole design: a
-- confirmation is a statement about particular numbers, so it cannot outlive
-- them. Without that it would be a box somebody ticked in 2026 still vouching
-- for a denominator changed in 2028, which is worse than never having asked,
-- because it carries authority it has not earned.
--
-- Note is deliberately not in the trigger's list. Rewording an explanation does
-- not unverify an amount, and a confirmation lost every time somebody tidies a
-- sentence is a confirmation nobody bothers to give.
--
--
-- 2. THE TARGET WAS IN TWO PLACES.
--
-- `strategy.target_annual` is typed on the strategy page. `targetAnnual()` in
-- lib/cogs computes the same thing for COGS saving from the yardstick:
-- cost basis units times the euro per unit. The stand-up uses the computed one,
-- the strategy page shows the typed one, and the typed one is empty, so the
-- same strategy has a target in one place and none in another.
--
-- Storing the computed figure would fix the display and break the rule that has
-- caught the most bugs in this project: a number copied once keeps whatever it
-- said after the thing it was computed from moves. Change the denominator and
-- the strategy page would keep reporting last year's target, confidently.
--
-- So a strategy says WHERE its target comes from. `target_from_yardstick` means
-- it is derived and `target_annual` must be empty; otherwise the figure is typed,
-- which is right for a strategy whose target is a count of something rather than
-- an amount of money. A check constraint keeps a strategy from claiming both.

begin;

-- ---------------------------------------------------------------------------
-- Confirmed, or not.
-- ---------------------------------------------------------------------------
alter table yardstick
  add column if not exists confirmed_at timestamptz,
  add column if not exists confirmed_by uuid references auth.users(id) on delete set null;

comment on column yardstick.confirmed_at is
  'When somebody last held these figures up against the source they came from. '
  'Null means nobody has, which is not an oversight to hide but the single most '
  'useful thing to say about a number everything else divides by.';

create or replace function yardstick_unconfirm_on_change()
returns trigger
language plpgsql
as $$
begin
  /* Row constructors with `is distinct from` so a null moving to a value counts
     as a change, which plain <> would miss. `note` is left out on purpose: an
     explanation reworded is not an amount changed. */
  if (new.fiscal_year, new.cost_basis_units, new.unit_cost_dkk, new.hour_rate_dkk,
      new.eur_rate, new.cogs_target_eur_per_unit, new.cost_basis_scope,
      new.target_scope)
     is distinct from
     (old.fiscal_year, old.cost_basis_units, old.unit_cost_dkk, old.hour_rate_dkk,
      old.eur_rate, old.cogs_target_eur_per_unit, old.cost_basis_scope,
      old.target_scope)
  then
    new.confirmed_at := null;
    new.confirmed_by := null;
  end if;
  return new;
end;
$$;

drop trigger if exists yardstick_unconfirm on yardstick;
create trigger yardstick_unconfirm
  before update on yardstick
  for each row execute function yardstick_unconfirm_on_change();

comment on function yardstick_unconfirm_on_change() is
  'A confirmation is a statement about particular numbers, so it does not '
  'outlive them. Move a figure and the confirmation goes with it.';

-- ---------------------------------------------------------------------------
-- Where a strategy's target comes from.
-- ---------------------------------------------------------------------------
alter table strategy
  add column if not exists target_from_yardstick boolean not null default false;

comment on column strategy.target_from_yardstick is
  'True where the target is computed from the yardstick rather than typed: the '
  'cost basis times the euro per unit. target_annual must then be empty, '
  'because a copy of a derived figure keeps whatever it said after the figure '
  'moves.';

alter table strategy drop constraint if exists strategy_one_target;
alter table strategy add constraint strategy_one_target check (
  not (target_from_yardstick and target_annual is not null)
);

/* COGS saving is the one with a number behind it, and that number is the
   yardstick's. Matched on name because that is the only thing identifying it,
   and written so a rerun changes nothing. */
update strategy
   set target_from_yardstick = true,
       target_annual = null
 where lower(name) = 'cogs saving'
   and target_from_yardstick = false;

insert into schema_migration (version, applied_at, note)
values ('20260911000006_an_unconfirmed_figure_says_so', now(),
        'The yardstick says whether it has been confirmed, and a strategy says where its target comes from')
on conflict (version) do nothing;

commit;
