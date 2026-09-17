-- The blocker views carry the author too.
--
-- The migration before this one added `created_by` to four tables and then
-- argued its way out of the consequence: both blocker views are `select b.*`,
-- `b.*` was expanded into a fixed column list when the view was created, and
-- so neither would ever show the new column. It said that was fine, because
-- the feed could read `blocker` directly.
--
-- It is not fine, and the type checker said so within the minute.
-- `ActiveBlocker` and `BlockerDays` in lib/types.ts both `extends Blocker`,
-- because a view that selects `b.*` IS a blocker with two figures added. Put a
-- column on the table and not on the views and that sentence stops being true:
-- the types claim a column the relations do not have, `npm run audit` fails on
-- «every field on 27 row types exists on its relation», and the only way to
-- keep the types honest would be to stop them extending `Blocker` and spell
-- both out by hand, which is three lists of the same columns to keep in step
-- instead of one.
--
-- `select b.*` means every column of blocker. That the expansion freezes at
-- creation is an implementation detail of Postgres, not a decision anybody
-- made, and the fix for an implementation detail contradicting the design is to
-- recreate the thing rather than to write the detail into the design.
--
-- `create or replace view` cannot do it: the new column lands in the middle of
-- the expansion rather than at the end, which is the one change that statement
-- refuses. So both are dropped and recreated verbatim, which is exactly what
-- 20260904000002 did when it retyped waiting_on_type underneath them. Nothing
-- else in the schema stands on either view; the application reads them
-- directly.

begin;

drop view v_active_blocker;
drop view v_blocker_days;

-- Recreated exactly as they were, which is the point: nothing here changes but
-- what `b.*` now expands to.
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

insert into schema_migration (version, applied_at, note)
values ('20260917000003_the_blocker_views_carry_the_author_too', now(),
        'Recreate both blocker views so b.* picks up created_by')
on conflict (version) do nothing;

commit;
