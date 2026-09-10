-- The figures everything else is measured against.
--
-- Until now these lived nowhere. The euro rate was a literal in the middle of
-- the cost page, `defaultRate = 7.46`, and the hourly rate, the volume and the
-- target had no home at all because nothing had needed them yet. Two more of
-- them were about to be typed into a second file, which is how a number ends up
-- meaning two things.
--
-- One row, and the primary key is a boolean fixed to true so there can only
-- ever be one. A second row would be a second version of the truth, and the
-- whole point of this table is that there is one.
--
-- WHY THE VOLUME IS FROZEN, and it is the most important line here. Units sold
-- fell 23% between FY25 and FY26, from 349 140 to 267 626, and the indirect
-- cost per unit rose about 33 kroner because of it: roughly four and a half
-- times the entire annual target, from volume alone. Measured against whatever
-- volume happens to be current, every project would look better in a bad year
-- and worse in a good one, having changed nothing at all. So the denominator is
-- named, stated and changed deliberately, exactly as a cost line carries the
-- rate that applied when the price landed.

begin;

create table yardstick (
  -- One row. A second would be a second version of the truth.
  id                       boolean primary key default true check (id),

  /* Which year the figures are taken from, so the frozen number is named. */
  fiscal_year              text not null,

  /* The denominator. Units actually sold, not units processed. */
  sold_units               integer not null check (sold_units > 0),

  /* All in, including indirect production cost. Context for a saving. */
  unit_cost_dkk            numeric(12,2),

  /* One man-hour, in kroner. Belgium is the same figure converted to euro. */
  hour_rate_dkk            numeric(12,2) not null check (hour_rate_dkk > 0),

  /* Kroner per euro for this reference. Cost lines keep their own; this is
     the one used to express a saving against the target. */
  eur_rate                 numeric(12,6) not null check (eur_rate > 0),

  /* What the strategy asks for: one euro out of every unit sold, every year. */
  cogs_target_eur_per_unit numeric(12,4) not null check (cogs_target_eur_per_unit > 0),

  note                     text,
  updated_at               timestamptz not null default now()
);

comment on table yardstick is
  'The figures the whole portfolio is measured against. One row on purpose. '
  'The volume is frozen and named: measured against a moving denominator, a '
  'project looks better in a bad year having changed nothing.';

create trigger yardstick_set_updated_at
  before update on yardstick
  for each row execute function set_updated_at();

insert into yardstick (
  fiscal_year, sold_units, unit_cost_dkk, hour_rate_dkk, eur_rate,
  cogs_target_eur_per_unit, note
) values (
  'FY26', 266253, 577.70, 240.00, 7.46, 1.0000,
  'Sold units and unit cost from the FY26 COGS dashboard. Unit cost is all in, '
  'including IPC of 140.24. A unit is one hectare of sugar beet seed.'
);

-- ---------------------------------------------------------------------------
-- What each stage actually ran.
--
-- The stages do not handle the same quantities: cleaning ran 465 216 units in
-- FY26 where coating ran 277 393. The same saving per processed unit is worth
-- 68% more on the cleaning line, and that is a fact about the process rather
-- than about the idea. Without these numbers a saving expressed per processed
-- unit cannot be turned into kroner a year at all.
-- ---------------------------------------------------------------------------
create table stage_volume (
  id          uuid primary key default gen_random_uuid(),
  fiscal_year text not null,
  stage       text not null,
  units       integer not null check (units >= 0),
  unique (fiscal_year, stage)
);

create index stage_volume_year_idx on stage_volume(fiscal_year);

comment on table stage_volume is
  'Units through each process stage, per year. Kept because a saving per '
  'processed unit is worth what the stage runs, not what is sold.';

insert into stage_volume (fiscal_year, stage, units) values
  ('FY25', 'Rensning',   471714),
  ('FY25', 'Pillering',  351829),
  ('FY25', 'Coating',    413477),
  ('FY25', 'Plombering', 518076),
  ('FY25', 'Pakkeri',    377833),
  ('FY25', 'Shipping',   349140),
  ('FY25', 'Steeping',   226151),
  ('FY26', 'Rensning',   465216),
  ('FY26', 'Pillering',  302866),
  ('FY26', 'Coating',    277393),
  ('FY26', 'Plombering', 618489),
  ('FY26', 'Pakkeri',    313948),
  ('FY26', 'Shipping',   267626),
  ('FY26', 'Steeping',   255355);

-- ---------------------------------------------------------------------------
-- Readable by anyone signed in, changed by anyone signed in.
--
-- These are company figures rather than project data, so membership does not
-- apply: an idea on any project is measured against the same yardstick, and
-- one that differed per reader would defeat the purpose of having it.
-- ---------------------------------------------------------------------------
alter table yardstick    enable row level security;
alter table stage_volume enable row level security;

create policy yardstick_shared on yardstick
  for all to authenticated
  using (auth.uid() is not null) with check (auth.uid() is not null);

create policy stage_volume_shared on stage_volume
  for all to authenticated
  using (auth.uid() is not null) with check (auth.uid() is not null);

insert into schema_migration (version, applied_at, note)
values ('20260910000001_yardstick', now(),
        'The figures everything is measured against, in one place, with the volume frozen')
on conflict (version) do nothing;

commit;
