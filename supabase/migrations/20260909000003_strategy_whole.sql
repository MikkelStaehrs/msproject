-- A strategy figure that does not change depending on who is looking.
--
-- Membership made every read viewer-scoped, which is right for work and wrong
-- for a total reported upwards. "COGS saving promises 340 000 a year" has to be
-- the same sentence whoever opens the page; a number that quietly shrinks for
-- the colleague who is not on one of the contributing projects is worse than no
-- number, because both people will believe theirs.
--
-- `v_strategy_node` already runs as owner, so the markings and which one is
-- topmost are whole-tree. What was still missing is what each marking is WORTH:
-- the fallback benefit lives on the node, the status lives on the node, and
-- both were being read through RLS.
--
-- So the view carries them. Three things are deliberate about how:
--
--   * It reads `reporting -> economics -> benefit`. That is the one place in
--     this schema where SQL touches the reporting jsonb; `lib/identity.ts` is
--     otherwise the only thing that parses it. The alternative was for the page
--     to read the node itself, which is exactly what cannot work here.
--
--   * It does NOT compute money in euro. Both figures it exposes are already
--     euro, so the conversion rule stays in the two places it lives, and no
--     third copy is introduced to drift.
--
--   * `invested` is left out on purpose and stays viewer-scoped. Pulling it in
--     would have meant repeating the currency conversion here, and what has
--     been spent reads as a per-project fact in a way a promise does not.

begin;

drop view v_strategy_node;

create view v_strategy_node as
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
  ) as node_blocked

from node_strategy ns
join node n on n.id = ns.node_id;

alter view v_strategy_node set (security_invoker = off);

revoke all on v_strategy_node from public, anon;
grant select on v_strategy_node to authenticated;

comment on view v_strategy_node is
  'Every marking, with whether it is topmost in its branch and what it is '
  'worth. Runs as owner on purpose: a strategy total has to be the same number '
  'whoever opens the page, and the parts behind it are filtered by the page.';

insert into schema_migration (version, applied_at, note)
values ('20260909000003_strategy_whole', now(),
        'Strategy figures computed over the whole tree, not over what you can see')
on conflict (version) do nothing;

commit;
