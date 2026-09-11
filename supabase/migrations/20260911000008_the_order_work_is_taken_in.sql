-- The order work is taken in, which is not where it sits in the tree.
--
-- The stand-up's second chapter is a piece of programming: these are the things
-- in flight, this is the order we take them in before next week. That needs an
-- order, and there was an obvious one to reach for and it was wrong.
--
-- `node.sort_order` is position among SIBLINGS, and it drives the WBS codes:
-- `.01.03` counts the node's place in its branch. Rank a task first in the
-- stand-up and it would renumber on the tree, because one column would be
-- answering two different questions. «Where this sits in the work breakdown»
-- and «what we do first this week» are not the same fact and they move for
-- different reasons: the first when the shape of the project changes, the
-- second every Friday.
--
-- So a second, deliberately separate order. This is the same argument that
-- removed `reporting.priority` this morning, applied the other way round: that
-- one was a second word for a thing that already existed, and this is a second
-- thing that was about to be forced into one word.
--
-- ACROSS EVERYTHING IN FLIGHT, not within a project. A stand-up is not about a
-- project, and «what do we take first» is answered over all the work at once or
-- it is not answered at all. That is why it cannot be `sort_order` even in
-- principle: siblings are a per-parent set, and this queue crosses them.
--
-- Null means unranked, and sorts last. Nothing has been ranked yet and the room
-- has never met, so null is every row's honest starting value: the list simply
-- keeps the order it already had until somebody says otherwise. Numbered in
-- tens by the same helper the tree uses, which repairs gaps and duplicates as a
-- side effect of every move.

begin;

alter table node
  add column if not exists standup_order integer;

comment on column node.standup_order is
  'The order work in flight is taken in, decided at the stand-up and crossing '
  'projects. Not sort_order: that is position among siblings and drives the WBS '
  'codes, and a task ranked first this week must not renumber on the tree. Null '
  'is unranked and sorts last.';

/* Reading the queue means ordering by this and falling back to the tree, so the
   nulls are walked too. */
create index if not exists node_standup_order_idx
  on node (standup_order)
  where standup_order is not null;

insert into schema_migration (version, applied_at, note)
values ('20260911000008_the_order_work_is_taken_in', now(),
        'A queue order for the stand-up, separate from position in the tree')
on conflict (version) do nothing;

commit;
