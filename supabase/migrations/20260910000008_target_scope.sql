-- What the strategy covers, beside what the figure actually counts.
--
-- The euro applies to the whole company's sugar beet seed. The number in
-- `cost_basis_units` counts one slice of that: the COGS dashboard was filtered
-- to Brand Code = In-house, so In-License is missing from it.
--
-- SO THE DENOMINATOR IS TOO SMALL, and both errors that follow point the same
-- way. `targetAnnual` is cost_basis_units x 1 euro, so the year's target is
-- UNDERSTATED. And `shareOfTarget` divides by the same figure, so every idea is
-- a bigger fraction of it than it really is: OVERSTATED. A smaller mountain,
-- and every step up it looks longer. Flattery in both directions at once, which
-- is the worst kind because nothing on screen looks wrong.
--
-- The correct figure is on the same dashboard and one click away: keep
-- Type = Sugar, select In-house AND In-License, and read Units and
-- Unit Cost + IPC. Until somebody does, the two scopes sit side by side and the
-- pages say the figure is a floor rather than the number.
--
-- WHY NOT ESTIMATE IT. In-house sugar shipped 266 253 while the unfiltered
-- process dashboard shipped 267 626, which makes In-License look tiny and the
-- correction look negligible. That is precisely the reasoning that produced
-- `sold_units`: a plausible inference, written down as a fact, and believed by
-- everyone who read it afterwards. A number this one divides by is not a place
-- to be approximately right.

begin;

alter table yardstick
  /* What the strategy applies to, which is not necessarily what the figure
     beside it counts. Where the two differ, the target is understated and every
     share of it is overstated. */
  add column target_scope text;

update yardstick
set target_scope = 'Sukkerroefrø · hele virksomheden',
    note = note || E'\n\nThe euro applies to the whole company''s sugar beet '
        || 'seed, but this figure is filtered to In-house, so In-License is '
        || 'missing and the denominator is too small. Replace it with the same '
        || 'dashboard read with both brand codes selected.';

comment on column yardstick.target_scope is
  'What the strategy covers. Where it differs from cost_basis_scope the target '
  'is understated and every share of it overstated, and the pages say so '
  'rather than showing a confident percentage.';

insert into schema_migration (version, applied_at, note)
values ('20260910000008_target_scope', now(),
        'What the strategy covers, beside what the figure counts')
on conflict (version) do nothing;

commit;
