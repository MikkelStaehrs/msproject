-- Work is FOR something, and that is said in one place now.
--
-- `node.category` was capex / production / it / other. It had exactly one job:
-- supply the two letters at the front of an invented project number, PR-26-0001.
-- That number was deleted when the official one moved to UBS Projects, because a
-- second series for the same projects is the kind of thing that has to explain
-- itself the day somebody compares the two systems. The prefix went with it.
--
-- The column stayed. It was shown in six places, editable in three, and drove
-- nothing whatsoever. On the real tree 25 of 30 nodes carried «production», so
-- it did not even separate anything.
--
-- It was also wrong twice over, which is the part worth recording rather than
-- just the tidying:
--
--   `capex` is answered per COST LINE, not per project. `cost.budget` says
--   whether a line is capitalised, and it has to, because a consultant day and
--   an installation on the same project fall on different sides. A project-level
--   capex flag is a claim the money underneath can contradict.
--
--   `it` and `production` are a heading, and headings already have a home.
--   `strategy` is a ROW rather than a column, exactly so a new one costs an
--   insert and not a migration, and it is marked per node with a guard against
--   counting a marked parent and a marked child twice.
--
-- So there is one axis for what work is for, and it is `strategy`. The three
-- headings this company actually uses - product simplification, predictive
-- quality, factory productivity - are rows in it now, alongside COGS saving.
--
-- THE DIFFERENCE BETWEEN A HEADING AND A PROMISE is already in the model and
-- needed nothing new: `strategy.target_annual` is nullable, and its own comment
-- says «null where it is a heading rather than a promise: not every strategy
-- arrives with a number, and inventing one to fill the field would be worse than
-- leaving it open». The three headings carry no target. COGS saving is the one
-- with a number behind it, which is why the gate at promotion demands a figure
-- of work marked against it and accepts three answers everywhere else.
--
-- WHAT IS LOST. The column held 25 x production, 3 x it, 1 x other and one
-- null, on test data, in an application that is not in production. Nothing was
-- computed from any of it. `template.category` goes the same way and for the
-- same reason: a template is a skeleton of work, and what that work is for is
-- decided when it is deployed, not when it is captured.

begin;

alter table node     drop column if exists category;
alter table template drop column if exists category;

-- Only those two ever used it, checked against pg_attribute rather than assumed.
drop type if exists node_category;

insert into schema_migration (version, applied_at, note)
values ('20260911000005_one_axis_for_what_work_is_for', now(),
        'node.category and template.category removed: strategy is the one answer to what work is for')
on conflict (version) do nothing;

commit;
