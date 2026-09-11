-- A strategy total that ignores what the work promised on the day it started.
--
-- Marking a node as serving a strategy is about to become something you do at
-- the moment a thought becomes work, and the rule behind it is simple: mark it
-- as COGS and it has to carry a saving, because a strategy that adds up hopes
-- is one nobody can report upwards.
--
-- Except the total would still have read «unknown».
--
-- `v_strategy_node.benefit_eur` reads exactly one place: the figure typed by
-- hand on the identity page, `reporting.economics.benefit`. It knows nothing
-- about the saving recorded on the spark, or the copy of it frozen onto
-- `node_origin` at promotion. So the sequence would have been: state a saving
-- of 120 000 a year, promote, mark it, and watch the strategy page report the
-- contribution as not quantified. The number is in the database twice and the
-- page that adds up reads neither copy.
--
-- That is the worst shape a fault can have here. Everything looks wired, the
-- mechanism appears to work, and the one figure that goes upwards is wrong in
-- the direction that understates.
--
-- WHY THE NUMBER IS NOT COPIED ACROSS. The obvious fix is to write the annual
-- kroner into `reporting.economics.benefit` at promotion. That stores a
-- computed value in a column, which is the single rule that has caught the most
-- bugs in this project, and it would age exactly as badly: the saving is
-- derived from a kind, a figure and a stage volume through `lib/cogs`, and a
-- copy taken once would keep whatever it said after any of the three moved.
--
-- So the view carries the RAW claim and the arithmetic stays where it lives.
-- `annual_eur` on the marking still wins, then the node's own stated benefit,
-- then this. Three different facts, most specific first, and the oldest used
-- only when nothing newer exists.
--
-- NOT CONVERTED HERE, deliberately. This view exposes no euro and gains none
-- now: the conversion is `lib/cogs.ts` and `v_node_cost`, and a third spelling
-- of it in SQL is how two of them come to disagree. What travels is the kind,
-- the figure and the stage, which is what `savingFrom` already takes.
--
-- The view keeps `security_invoker = off`. That is what makes a strategy total
-- the same sentence whoever opens the page, and `node_origin` is itself
-- viewer-scoped, so reading it through anything else would have re-introduced
-- precisely the problem this view was made to solve: a figure that quietly
-- shrinks for the colleague who is not on one of the contributing projects.

begin;

create or replace view v_strategy_node as
select
  ns.id,
  ns.strategy_id,
  ns.node_id,
  ns.annual_eur,
  ns.note,

  -- False where an ancestor of this node carries the same strategy. Adding up
  -- only the true ones is what stops a marked parent and a marked child from
  -- being counted as two.
  not exists (
    select 1
    from node_strategy above
    join v_node_descendant d
      on d.root_id = above.node_id
     and d.node_id = ns.node_id
     and d.depth > 0
    where above.strategy_id = ns.strategy_id
  ) as is_top,

  -- What the node itself expects to be worth a year, already in euro. Null
  -- where nobody has said, which the page reports as unknown rather than as
  -- zero: a sum missing terms, presented as a gap, reads as precise and is not.
  nullif(n.reporting -> 'economics' ->> 'benefit', '')::numeric as benefit_eur,

  n.status as node_status,

  exists (
    select 1 from blocker b
    where b.node_id = ns.node_id and b.resolved_at is null
  ) as node_blocked,

  /* Appended, never inserted in the middle: `create or replace view` refuses a
     changed column order, and this file is pasted in by hand.

     What was claimed on the day this became work, raw. The caller turns it into
     kroner and then euro with lib/cogs, the same way every other page does. */
  o.saving_kind  as origin_saving_kind,
  o.saving_value as origin_saving_value,
  o.saving_stage as origin_saving_stage,
  /* The year it was weighed in. A saving means nothing without it: FY26 shipped
     23% fewer units than FY25, so the same kroner is a different share of the
     target in each, and a claim read back against the wrong yardstick is a
     claim nobody made. */
  o.fiscal_year  as origin_fiscal_year

from node_strategy ns
join node n on n.id = ns.node_id
left join node_origin o on o.node_id = ns.node_id;

alter view v_strategy_node set (security_invoker = off);

revoke all on v_strategy_node from public, anon;
grant select on v_strategy_node to authenticated;

comment on view v_strategy_node is
  'Every marking, with whether it is topmost in its branch and what it is '
  'worth, from the marking, the node and the claim made when it became work. '
  'Runs as owner on purpose: a strategy total has to be the same number '
  'whoever opens the page, and the parts behind it are filtered by the page.';

insert into schema_migration (version, applied_at, note)
values ('20260911000004_strategy_reads_the_claim', now(),
        'The strategy total falls back to what the work promised on the day it started')
on conflict (version) do nothing;

commit;
