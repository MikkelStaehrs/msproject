import Link from 'next/link'
import { daysBetween, today as todayIso } from '@/lib/date'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { nameOf, readPeopleById } from '@/lib/person-data'
import { readIdentity } from '@/lib/identity'
import { QueryFailure, firstError } from '@/lib/failure'
import { NodeForm, type ParentOption } from '@/components/node-form'
import { StatusSelect } from '@/components/status-select'
import { BlockerForm, ResolveBlockerForm } from '@/components/blocker-form'
import { DecisionForm } from '@/components/decision-form'
import { EntryForm } from '@/components/entry-form'
import { TaskSheet } from '@/components/task-sheet'
import { LogStream, type LogItem } from '@/components/log-stream'
import { addDependency } from '@/lib/dependency-actions'
import { BoardShell } from '@/components/board-shell'
import { QuickAddOn } from '@/components/quick-add-on'
import { ReorderButtons } from '@/components/reorder-buttons'
import { canMove } from '@/lib/reorder'
import { ProgressScale, formatDate } from '@/components/ui'
import { pathTo, wbsCodes } from '@/lib/wbs'
import { subtreeSet } from '@/lib/subtree'
import {
  TYPE_LABEL,
  type BlockerDays,
  type Decision,
  type Entry,
  type Node,
  type NodeProgress,
  type NodeReady,
  type NodeState,
  type NodeDependency,
  type NodeStatus,
} from '@/lib/types'

export const dynamic = 'force-dynamic'

/** Diamond for a milestone, square for an ordinary node. */
function MilestoneMark({ done }: { done: boolean }) {
  return (
    <svg width="9" height="9" viewBox="0 0 9 9" className="shrink-0 translate-y-px">
      <path
        d="M4.5 0 L9 4.5 L4.5 9 L0 4.5 Z"
        fill={done ? '#1a1f1b' : 'none'}
        stroke={done ? 'none' : '#6b6b65'}
        strokeWidth="1.2"
      />
    </svg>
  )
}

export default async function TreePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{
    edit?: string
    new?: string
    focus?: string
    view?: string
    sc?: string
    part?: string
    log?: string
    task?: string
    to?: string
    bedit?: string
    bresolve?: string
    bnew?: string
    dedit?: string
    dnew?: string
    eedit?: string
  }>
}) {
  const { id } = await params
  const {
    edit: editId,
    new: newParent,
    focus: focusId,
    view: viewParam,
    sc: scParam,
    part: partParam,
    log: logParam,
    task: taskId,
    to: moveTo,
    bedit: editBlockerId,
    bresolve: resolveBlockerId,
    bnew: newBlockerNode,
    dedit: editDecisionId,
    dnew: newDecisionNode,
    eedit: editEntryId,
  } = await searchParams

  const supabase = await createClient()
  const base = `/p/${id}`

  /*
   * One round trip, not two. Asking the database which nodes sit underneath and
   * only then issuing the queries that filter by the answer turns one wait into
   * two, and the portfolio is small enough to fetch whole and cut here.
   */
  const [
    nodesRes, allNodesRes, entryRes, blockerRes, decisionRes, progressRes,
    stateRes, readyRes, markRes, strategyRes, depRes,
  ] = await Promise.all([
    supabase.from('node').select('*').order('sort_order'),
    supabase.from('node').select('id, parent_id, title, sort_order').order('sort_order'),
    supabase.from('entry').select('*').order('entry_date', { ascending: false }).limit(200),
    supabase.from('v_blocker_days').select('*'),
    supabase.from('decision').select('*'),
    supabase.from('v_node_progress').select('*'),
    supabase.from('v_node_state').select('*'),
    supabase.from('v_node_ready').select('*'),
    supabase.from('v_strategy_node').select('node_id, strategy_id, is_top'),
    supabase.from('strategy').select('id, name'),
    supabase.from('node_dependency').select('*'),
  ])

  const failure = firstError([
    nodesRes, allNodesRes, entryRes, blockerRes, decisionRes, progressRes, stateRes, readyRes,
    markRes, strategyRes, depRes,
  ])
  if (failure) return <QueryFailure message={failure} />

  const everyNode = (nodesRes.data ?? []) as Node[]
  const project = everyNode.find((n) => n.id === id)
  if (!project) notFound()

  /*
   * What each node is marked as serving. A nested marking is shown too: it
   * says where the saving actually comes from, and the page it feeds is the
   * one that decides what to add up.
   */
  const strategyName = new Map(
    ((strategyRes.data ?? []) as { id: string; name: string }[]).map((r) => [r.id, r.name]),
  )
  const serves = new Map<string, string[]>()
  for (const m of (markRes.data ?? []) as {
    node_id: string
    strategy_id: string
    is_top: boolean
  }[]) {
    const name = strategyName.get(m.strategy_id)
    if (name) serves.set(m.node_id, [...(serves.get(m.node_id) ?? []), name])
  }

  const inProject = subtreeSet(everyNode, id)
  const nodes = everyNode.filter((n) => inProject.has(n.id))

  const entries = ((entryRes.data ?? []) as Entry[]).filter((e) => inProject.has(e.node_id))
  const blockers = ((blockerRes.data ?? []) as BlockerDays[]).filter((b) => inProject.has(b.node_id))
  const decisions = ((decisionRes.data ?? []) as Decision[]).filter((d) => inProject.has(d.node_id))
  const progress = new Map(
    ((progressRes.data ?? []) as NodeProgress[]).map((p) => [p.node_id, p]),
  )
  // Sequence: a node nobody can start yet, because something it or an ancestor
  // waits on is still open. Not the same as blocked, which is about someone
  // else sitting on you.
  const ready = new Map(
    ((readyRes.data ?? []) as NodeReady[]).map((r) => [r.node_id, r]),
  )

  // Blocked-ness is derived, so it is read rather than worked out here.
  const state = new Map(
    ((stateRes.data ?? []) as NodeState[]).map((s) => [s.node_id, s]),
  )

  const childrenOf = new Map<string, Node[]>()
  for (const n of nodes) {
    if (n.parent_id === null || n.id === id) continue
    childrenOf.set(n.parent_id, [...(childrenOf.get(n.parent_id) ?? []), n])
  }

  /*
   * Work breakdown codes and the descendant sets behind each row summary.
   * A part that holds a hierarchy of its own has to say what is inside it
   * without being opened first.
   */
  const projectNo =
    typeof project.reporting?.project_no === 'string'
      ? project.reporting.project_no
      : 'no number'
  const codes = wbsCodes(nodes, id, projectNo)

  /**
   * «PR-26-0001.01.02» -> «.01.02». One segment per level, so the column reads
   * as the hierarchy itself: the dots step right exactly as the tree does.
   */
  const wbsTail = (nodeId: string) => (codes.get(nodeId) ?? '').slice(projectNo.length)

  const descendantsOf = new Map<string, string[]>()
  const collect = (nodeId: string): string[] => {
    const kids = childrenOf.get(nodeId) ?? []
    const all = kids.flatMap((k) => [k.id, ...collect(k.id)])
    descendantsOf.set(nodeId, all)
    return all
  }
  collect(id)

  const openBlockers = blockers.filter((b) => b.is_active)
  const byId = new Map(nodes.map((n) => [n.id, n]))

  // Focus shows one branch instead of the whole tree.
  const focused = focusId ? byId.get(focusId) : undefined
  const trail = focused ? pathTo(nodes, id, focused.id) : [id]
  const treeRoot = focused ?? project
  const treeRootId = treeRoot.id

  /*
   * The scope toggle went with the frame it belonged to: it existed so you
   * could read the project's figures while standing on a part, and the rail
   * names the project while the crumb says where you are.
   */
  const editing = editId ? nodes.find((n) => n.id === editId) : undefined

  const parentOptions: ParentOption[] = []
  let editDescendants = 0
  if (editing) {
    const excluded = subtreeSet(everyNode, editing.id)
    editDescendants = excluded.size - 1

    type Flat = { id: string; parent_id: string | null; title: string }
    const all = (allNodesRes.data ?? []) as Flat[]
    const kids = new Map<string, Flat[]>()
    for (const n of all) {
      const key = n.parent_id ?? '__root__'
      kids.set(key, [...(kids.get(key) ?? []), n])
    }
    const walk = (key: string, depth: number) => {
      for (const n of kids.get(key) ?? []) {
        if (!excluded.has(n.id)) {
          parentOptions.push({ id: n.id, title: n.title, depth })
          walk(n.id, depth + 1)
        }
      }
    }
    walk('__root__', 0)
  }

  /** Keep where you are and how you are looking at it when a link is followed. */
  const keep = (extra: string) => {
    const parts = [
      focusId ? `focus=${focusId}` : '',
      viewParam ? `view=${viewParam}` : '',
      scParam ? `sc=${scParam}` : '',
      partParam ? `part=${partParam}` : '',
      logParam === 'off' ? 'log=off' : '',
      extra,
    ].filter(Boolean)
    return parts.length === 0 ? base : `${base}?${parts.join('&')}`
  }

  /*
   * Who to put on a part's line: its project manager if a role says so, and
   * otherwise its driver. Both are account ids now, so both are looked up
   * rather than read as text.
   */
  const leadOf = (n: Node) => {
    const roles = readIdentity(n.reporting).people
    const id = roles.project_manager?.[0] ?? n.driver_id
    return id ? nameOf(peopleById, id) : n.driver_name
  }

  const peopleById = await readPeopleById(supabase)

  const today = todayIso()

  /**
   * What is going on inside one branch. A part has to answer this without
   * being opened, otherwise the overview is a list of names.
   */
  function summarise(node: Node) {
    const branch = [node.id, ...(descendantsOf.get(node.id) ?? [])]
    const inBranch = branch.map((bid) => byId.get(bid)).filter((n): n is Node => !!n)

    const nextDate = inBranch
      .filter(
        (n) =>
          n.id !== node.id &&
          n.due_date !== null &&
          n.completed_at === null &&
          n.status !== 'done' &&
          n.status !== 'cancelled',
      )
      .map((n) => n.due_date!)
      .sort()[0]

    const lastEntry = entries
      .filter((e) => branch.includes(e.node_id))
      .map((e) => e.entry_date)
      .sort()
      .at(-1)

    const stuck = openBlockers.filter((b) => branch.includes(b.node_id))

    return {
      progress: progress.get(node.id),
      nodes: (descendantsOf.get(node.id) ?? []).length,
      nextDate,
      lastEntry,
      stuck,
      worstWait: stuck.length === 0 ? 0 : Math.max(...stuck.map((b) => b.days_blocked)),
      lead: leadOf(node),
      overdue: nextDate !== undefined && nextDate < today,
    }
  }

  function Row({ node, depth, first }: { node: Node; depth: number; first: boolean }) {
    const kids = childrenOf.get(node.id) ?? []
    const done = node.status === 'done'
    /*
     * A part always carries its summary now. It used to carry one only while
     * it was closed, because open, its children said the same thing better and
     * printing both put the identical figures on the page twice. The tree shows
     * one level, so a part's children are never on the same screen as the part,
     * and the summary is the only thing saying what is inside.
     */
    const isPart =
      node.type === 'subproject' || node.type === 'development' || kids.length > 0
    const sum = isPart && !false ? summarise(node) : null

    return (
      <div>
        {/*
          * A direct part of the project opens a block: 32 px of air, then a
          * heavier rule, then the title a step up in weight. The air sits ABOVE
          * the rule on purpose, so the break belongs to the part it opens
          * rather than to the block it closes. The first part skips the margin,
          * because the «Tree» heading already separates it.
          */}
        <div
          className={`flex items-baseline gap-3 border-t pb-2.5 ${
            depth === 0
              ? `border-rule-strong pt-4 ${first ? '' : 'mt-8'}`
              : 'border-rule pt-2.5'
          }`}
        >
          <div className="w-[152px] shrink-0">
            <StatusSelect
              id={node.id}
              status={node.status}
              blocked={state.get(node.id)?.is_blocked ?? false}
              waitDays={state.get(node.id)?.worst_wait ?? 0}
            />
          </div>

          {/* The triangle used to fold. It descends now, which is the only
              thing a level can do with a part that holds other parts. */}
          {kids.length > 0 ? (
            <Link
              href={keep(`focus=${node.id}`)}
              title={`Go into ${node.title}`}
              className="w-3.5 shrink-0 text-center text-[9px] leading-none text-rule-strong hover:text-green"
            >
              ▸
            </Link>
          ) : (
            <span className="w-3.5 shrink-0" />
          )}

          <span
            className="w-[80px] shrink-0 text-[11px] tabular-nums tracking-[0.04em] text-muted"
            title={codes.get(node.id)}
          >
            {wbsTail(node.id)}
          </span>

          {/*
            * Only the title indents. The status mark is what you scan the page
            * for, so it holds a fixed column whatever the depth; indenting the
            * whole row made the left edge zigzag against a straight right edge.
            */}
          <div
            className="flex min-w-0 flex-1 items-baseline gap-3"
            style={{ paddingLeft: depth * 24 }}
          >
            {node.is_milestone && <MilestoneMark done={done} />}

            <div className="min-w-0 flex-1">
            <Link
              href={editId === node.id ? keep('') : keep(`edit=${node.id}`)}
              className={`hover:text-green ${
                depth === 0 ? 'text-[14.5px] font-medium' : 'text-[13px]'
              } ${editId === node.id ? 'text-green' : ''} ${
                done ? 'text-muted line-through decoration-rule' : ''
              }`}
            >
              {node.title}
            </Link>
            {(() => {
              // Sequence is normal. Only lateness is worth a colour, or the
              // colour stops meaning anything.
              const r = ready.get(node.id)
              if (!r || r.is_ready) return null
              return r.overdue_count > 0 ? (
                <span
                  className="lbl-tight ml-3 whitespace-nowrap text-oxblood"
                  title="A predecessor has passed its own due date"
                >
                  held up by {r.overdue_count}
                </span>
              ) : (
                <span
                  className="lbl-tight ml-3 whitespace-nowrap text-rule-strong"
                  title="Waiting its turn. Nothing is late"
                >
                  waits on {r.waiting_on_count}
                </span>
              )
            })()}

            {/*
              What this piece of work is for, above the project it sits in.
              Quiet by design: it is context, not a state, and it must not
              compete with lateness for attention.
            */}
            {(serves.get(node.id) ?? []).map((name) => (
              <span
                key={name}
                className="lbl-tight ml-3 whitespace-nowrap text-green"
                title="Marked as serving this strategy"
              >
                {name}
              </span>
            ))}

            {sum && (
              <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-muted">
                <span className="flex w-[56px] items-center">
                  <ProgressScale
                    done={sum.progress?.leaf_done ?? 0}
                    total={sum.progress?.leaf_total ?? 0}
                  />
                </span>
                <span className="tabular-nums">{sum.progress?.progress_pct ?? 0} %</span>
                <span className="tabular-nums">
                  {sum.nodes === 0 ? 'empty' : `${sum.nodes} nodes`}
                </span>
                {sum.nextDate && (
                  <span className={`tabular-nums ${sum.overdue ? 'text-oxblood' : ''}`}>
                    next {formatDate(sum.nextDate)}
                  </span>
                )}
                {sum.stuck.length > 0 && (
                  <span className="tabular-nums text-oxblood">
                    {sum.stuck.length} blocked, {sum.worstWait} days
                  </span>
                )}
                <span className="tabular-nums">
                  {sum.lastEntry ? `logged ${formatDate(sum.lastEntry)}` : 'never logged'}
                </span>
                {sum.lead && <span>{sum.lead}</span>}
              </div>
            )}
            </div>
          </div>

          <span className="lbl-tight w-[86px] shrink-0 text-muted">
            {TYPE_LABEL[node.type]}
          </span>
          <span className="w-[72px] shrink-0 text-right text-xs tabular-nums text-muted">
            {node.due_date ? formatDate(node.due_date) : '-'}
          </span>
          <ReorderButtons
            id={node.id}
            can={canMove(childrenOf.get(node.parent_id ?? '') ?? [], node.id)}
            redirectTo={keep('')}
          />
          <Link
            href={`${base}?focus=${node.id}`}
            title="Open this node on its own, with its log, blockers, decisions and sequence"
            className="lbl-tight shrink-0 text-rule-strong hover:text-green"
          >
            open
          </Link>
          <Link
            href={editId === node.id ? keep('') : keep(`edit=${node.id}`)}
            title={
              editId === node.id
                ? 'Close the form'
                : 'Edit this node, change its type, or delete it'
            }
            className={`lbl-tight shrink-0 hover:text-green ${
              editId === node.id ? 'text-green' : 'text-rule-strong'
            }`}
          >
            edit
          </Link>
          <QuickAddOn nodeId={node.id} />
          <Link
            href={newParent === node.id ? keep('') : keep(`new=${node.id}`)}
            title={newParent === node.id ? 'Close the form' : 'Add child node'}
            className={`w-4 shrink-0 text-center text-sm hover:text-green ${
              newParent === node.id ? 'text-green' : 'text-rule-strong'
            }`}
          >
            {newParent === node.id ? '×' : '+'}
          </Link>
        </div>

        {editId === node.id && editing && (
          <div className="my-2">
            <NodeForm
              node={editing}
              parentOptions={parentOptions}
              descendantCount={editDescendants}
              redirectTo={keep('')}
              cancelHref={keep('')}
            />
          </div>
        )}

        {newParent === node.id && (
          <div className="my-2">
            <NodeForm parentId={node.id} redirectTo={keep('')} cancelHref={keep('')} />
          </div>
        )}

      </div>
    )
  }

  /*
   * Folding.
   *
   * The open set travels in the URL as eight hex characters per node, which is
   * short enough to keep the address readable and unique enough that a clash
   * inside one project is not a real risk. It lives in the query rather than in
   * the client so the tree stays server rendered, and so a link to a half open
   * tree opens the same way for the next person.
   *
   * With no parameter at all, the direct parts are open and everything below is
   * closed. That is the reading you want when you arrive.
   */
  const containers = (nodeId: string) => (childrenOf.get(nodeId) ?? []).length > 0
  const short = (nodeId: string) => nodeId.slice(0, 8)





  /*
   * Flattened with the depth carried alongside, so every row is a sibling in
   * the DOM and the fixed columns line up across the whole tree. A closed node
   * simply does not emit its children.
   */
  /* ------------------------------------------------------------------ *
   * Three ways of looking at the same branch.
   *
   * Board is the work: the tasks, grouped by the state they are in. Tree is the
   * structure, one level at a time. Map is the whole hierarchy at once. They
   * are three views rather than three pages because they answer three
   * questions about one thing, and the address says which one you are in so a
   * link to a board opens as a board.
   * ------------------------------------------------------------------ */
  const view: 'board' | 'tree' | 'map' =
    viewParam === 'tree' || viewParam === 'map' ? viewParam : 'board'
  const boardScope: 'here' | 'below' = scParam === 'here' ? 'here' : 'below'

  const viewHref = (v: 'board' | 'tree' | 'map', query: string) => {
    const q = [
      v === 'board' ? '' : `view=${v}`,
      query,
      logParam === 'off' ? 'log=off' : '',
    ]
      .filter(Boolean)
      .join('&')
    return q ? `${base}?${q}` : base
  }

  /*
   * The log folds away.
   *
   * It takes 400 pixels from the board at xl and 460 at 2xl, and the board is
   * the one thing on this page that scrolls sideways when it runs out of
   * room, so those pixels are the difference between three columns you can
   * read and three you have to push around. Reading the log and working the
   * board are two different sittings.
   *
   * In the address rather than in the client, like every other switch here:
   * the state then survives a reload, a link sent to somebody else, and the
   * navigation a drop performs.
   */
  const logOpen = logParam !== 'off'
  const logHref = (open: boolean) => {
    const q = [
      viewParam ? `view=${viewParam}` : '',
      focusId ? `focus=${focusId}` : '',
      scParam ? `sc=${scParam}` : '',
      partParam ? `part=${partParam}` : '',
      open ? '' : 'log=off',
    ]
      .filter(Boolean)
      .join('&')
    return q ? `${base}?${q}` : base
  }

  /** A task is a leaf that is a task: the only thing that counts as work. */
  const isWork = (n: Node) => n.type === 'task' && (childrenOf.get(n.id) ?? []).length === 0

  const here = (childrenOf.get(treeRootId) ?? []).filter(isWork)
  const below: Node[] = []
  const gather = (nodeId: string) => {
    for (const n of childrenOf.get(nodeId) ?? []) {
      if ((childrenOf.get(n.id) ?? []).length > 0) gather(n.id)
      else if (n.type === 'task') below.push(n)
    }
  }
  gather(treeRootId)

  /*
   * One part at a time.
   *
   * «Everything below» is the reading you want on arrival and the one that
   * stops being readable first: a project whose five subprojects each carry
   * the same three tasks puts «2D mapping» in the same column five times, and
   * the column then says twenty-three without saying twenty-three of what.
   *
   * The group heads answer that where the eye lands. This answers it where the
   * eye does not have to: pick a part and the board is that part's board, in
   * the same three columns, with everything else out of the way. It is a
   * filter and not a scope, so the counts either side of it still describe the
   * whole branch and the rail still says where you are standing.
   *
   * Only the parts that actually carry work are offered. A subproject with no
   * tasks under it is a switch that empties the board, which is not a filter
   * but a trap.
   */
  const partsWithWork: Node[] = []
  {
    const seen = new Set<string>()
    for (const n of below) {
      const parentId = n.parent_id ?? treeRootId
      if (parentId === treeRootId || seen.has(parentId)) continue
      const parent = byId.get(parentId)
      if (parent) {
        seen.add(parentId)
        partsWithWork.push(parent)
      }
    }
  }

  /* An id that no longer names a part is ignored rather than obeyed: a stale
     link should show the board, never an empty one. */
  const partFilter =
    partParam && partsWithWork.some((p) => p.id === partParam) ? partParam : null

  const belowShown = partFilter
    ? below.filter((n) => (n.parent_id ?? treeRootId) === partFilter)
    : below

  const boardWork = boardScope === 'here' ? here : belowShown

  const deps = (depRes.data ?? []) as NodeDependency[]
  const rootCount = progress.get(treeRootId) ?? { leaf_done: 0, leaf_total: 0 }

  /*
   * The pulse of this branch, as one stream. Four kinds, one list, date order.
   * A relation carries no date of its own, so it sorts last rather than
   * claiming a day nobody recorded.
   */
  const inBranch = new Set([treeRootId, ...(descendantsOf.get(treeRootId) ?? [])])
  const titleOfNode = (nodeId: string) => byId.get(nodeId)?.title ?? 'a part you cannot open'

  const stream: LogItem[] = [
    ...entries
      .filter((e) => inBranch.has(e.node_id))
      .map((e) => ({
        id: `e${e.id}`,
        kind: 'work' as const,
        date: e.entry_date,
        when: formatDate(e.entry_date),
        line: e.body,
        note: e.node_id === treeRootId ? null : titleOfNode(e.node_id),
        href: keep(`eedit=${e.id}`),
      })),
    ...blockers
      .filter((b) => inBranch.has(b.node_id))
      .map((b) => ({
        id: `b${b.id}`,
        kind: 'blocker' as const,
        date: b.opened_at,
        when: formatDate(b.opened_at),
        line: b.title,
        note: b.is_active
          ? `${b.waiting_on}${b.expected_by ? `, expected by ${formatDate(b.expected_by)}` : ', no expected reply'}`
          : `${b.waiting_on} · closed after ${b.days_blocked} days${b.resolution ? ` · ${b.resolution}` : ''}`,
        rust: b.is_active,
        right: b.is_active ? `${b.days_blocked}d` : null,
        action: b.is_active ? { label: 'Close', href: keep(`bresolve=${b.id}`) } : null,
        href: keep(`bedit=${b.id}`),
      })),
    ...decisions
      .filter((d) => inBranch.has(d.node_id))
      .map((d) => ({
        id: `d${d.id}`,
        kind: 'decision' as const,
        date: d.decided_on,
        when: formatDate(d.decided_on),
        line: d.decision,
        note: d.rationale ?? 'No rationale written down',
        rust: !d.rationale,
        href: keep(`dedit=${d.id}`),
      })),
    ...deps
      .filter((d) => inBranch.has(d.node_id))
      .map((d) => ({
        id: `w${d.id}`,
        kind: 'sequence' as const,
        date: null,
        when: null,
        line: `${titleOfNode(d.node_id)} waits on ${titleOfNode(d.depends_on_id)}`,
        note: d.note,
        href: keep(`task=${d.depends_on_id}`),
      })),
  ].sort((a, b) => {
    if (a.date === null && b.date === null) return 0
    if (a.date === null) return 1
    if (b.date === null) return -1
    return a.date < b.date ? 1 : -1
  })

  /* Anything in the project that is not this node or under it. */
  const depCandidates = nodes.filter(
    (n) => n.id !== treeRootId && !(descendantsOf.get(treeRootId) ?? []).includes(n.id),
  )

  /*
   * The open task. Only a leaf, and only one inside this project: a container
   * is something you go into, and an id from somewhere else is not ours to
   * show.
   */
  const candidate = taskId ? byId.get(taskId) : undefined
  const openTask =
    candidate && (childrenOf.get(candidate.id) ?? []).length === 0 ? candidate : undefined
  const taskPath = openTask
    ? pathTo(nodes, id, openTask.id)
        .slice(0, -1)
        .map((nodeId) => byId.get(nodeId)?.title ?? '')
        .join(' › ')
    : ''

  const COLUMNS: [NodeStatus, string][] = [
    ['idea', 'Idea'],
    ['planned', 'Planned'],
    ['active', 'In progress'],
    ['paused', 'On hold'],
    ['done', 'Done'],
  ]

  /** The path above a node, relative to where you are standing. */
  const pathAbove = (n: Node) => {
    const out: string[] = []
    let cursor = n.parent_id
    while (cursor && cursor !== treeRootId) {
      out.unshift(byId.get(cursor)?.title ?? '')
      cursor = byId.get(cursor)?.parent_id ?? null
    }
    return out.join(' › ')
  }

  /*
   * A card. Title, then what it is and what it hangs in, then the date or the
   * wait. The type comes from the node itself: Design and Frontend Dev sit
   * under a development and are tasks, and saying DEVELOPMENT on them was
   * reading the parent's type off the wrong row.
   */
  function Card({ node, grouped }: { node: Node; grouped: boolean }) {
    const open = openBlockers.filter((b) => b.node_id === node.id)
    const wait = open.length
      ? Math.max(...open.map((b) => b.days_blocked))
      : null
    const late =
      node.due_date !== null &&
      node.status !== 'done' &&
      daysBetween(today, node.due_date) < 0
    const near = node.parent_id === treeRootId ? '' : (byId.get(node.parent_id ?? '')?.title ?? '')
    const rest = pathAbove(node)

    return (
      <div
        data-card={node.id}
        draggable
        className="block cursor-grab border-b border-rule px-3.5 py-3 last:border-b-0 hover:bg-hover active:cursor-grabbing"
      >
        <Link
          href={keep(`task=${node.id}`)}
          className="block font-medium leading-snug hover:text-green"
        >
          {node.title}
        </Link>
        <div className="mt-1 flex flex-wrap items-baseline gap-2">
          <span className="micro text-muted">{node.type}</span>
          {!grouped && near && <span className="text-[11.5px] text-green-soft">· {near}</span>}
        </div>
        {!grouped && rest && rest !== near && (
          <div className="mt-0.5 text-[11px] leading-snug text-rule-strong">{rest}</div>
        )}
        <div className="mt-2.5 flex items-center justify-between gap-3">
          {wait !== null ? (
            <span className="tag tag-rust">Blocked {wait}d</span>
          ) : (
            <span className={`mono text-[11.5px] ${late ? 'text-oxblood' : 'text-muted'}`}>
              {node.due_date ? formatDate(node.due_date) : 'No date'}
            </span>
          )}
          <span className="flex shrink-0 items-baseline gap-3">
            <Link href={keep(`edit=${node.id}`)} className="lbl-tight text-muted hover:text-ink">
              Edit
            </Link>
            <QuickAddOn nodeId={node.id} />
          </span>
        </div>
      </div>
    )
  }

  /*
   * The map: hairlines and perpendicular bends, every level at once. A letter
   * carries the type because four levels of indentation alone stop being
   * readable, and this tree is four deep.
   */
  function MapLevel({ parentId }: { parentId: string }): React.ReactNode {
    const kids = childrenOf.get(parentId) ?? []
    if (kids.length === 0) return null
    return (
      <div className="ml-3.5 border-l border-rule-strong">
        {kids.map((n) => {
          const p = progress.get(n.id)
          const box = (childrenOf.get(n.id) ?? []).length > 0
          const open = openBlockers.filter((b) => b.node_id === n.id)
          return (
            <div key={n.id} className="relative">
              <div className="relative flex flex-wrap items-baseline gap-3 py-1.5 pl-4 hover:bg-hover">
                <span className="absolute left-0 top-[13px] h-px w-[11px] bg-rule-strong" />
                <span className="micro w-[68px] shrink-0 text-rule-strong">{n.type}</span>
                <Link
                  href={keep(`focus=${n.id}`)}
                  className={`font-medium hover:text-green ${
                    n.status === 'done' ? 'text-muted line-through decoration-rule-strong' : ''
                  }`}
                >
                  {n.title}
                </Link>
                {box && p && (
                  <span className="mono text-[11.5px] text-muted">
                    {p.leaf_done}/{p.leaf_total}
                  </span>
                )}
                {open.length > 0 && (
                  <span className="tag tag-rust">
                    {Math.max(...open.map((b) => b.days_blocked))}d
                  </span>
                )}
                {n.due_date && (
                  <span className="mono text-[11.5px] text-muted">{formatDate(n.due_date)}</span>
                )}
              </div>
              <MapLevel parentId={n.id} />
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div
      className={`grid grid-cols-1 ${
        logOpen
          ? 'xl:grid-cols-[minmax(0,1fr)_400px] 2xl:grid-cols-[minmax(0,1fr)_460px]'
          : ''
      }`}
    >
    <div className="min-w-0 px-5 py-7 lg:px-8">
      {editId === project.id && editing && (
        <div className="mb-5">
          <NodeForm
            node={editing}
            parentOptions={parentOptions}
            descendantCount={editDescendants}
            redirectTo={keep('')}
            cancelHref={keep('')}
          />
        </div>
      )}
      {editBlockerId && blockers.some((b) => b.id === editBlockerId) && (
        <div className="mb-5">
          <BlockerForm
            blocker={blockers.find((b) => b.id === editBlockerId)!}
            redirectTo={keep('')}
            cancelHref={keep('')}
          />
        </div>
      )}
      {resolveBlockerId && blockers.some((b) => b.id === resolveBlockerId) && (
        <div className="mb-5">
          <ResolveBlockerForm
            blocker={blockers.find((b) => b.id === resolveBlockerId)!}
            redirectTo={keep('')}
            cancelHref={keep('')}
          />
        </div>
      )}
      {newBlockerNode && (
        <div className="mb-5">
          <BlockerForm nodeId={newBlockerNode} redirectTo={keep('')} cancelHref={keep('')} />
        </div>
      )}
      {editDecisionId && decisions.some((d) => d.id === editDecisionId) && (
        <div className="mb-5">
          <DecisionForm
            decision={decisions.find((d) => d.id === editDecisionId)!}
            redirectTo={keep('')}
            cancelHref={keep('')}
          />
        </div>
      )}
      {newDecisionNode && (
        <div className="mb-5">
          <DecisionForm nodeId={newDecisionNode} redirectTo={keep('')} cancelHref={keep('')} />
        </div>
      )}
      {editEntryId && entries.some((e) => e.id === editEntryId) && (
        <div className="mb-5">
          <EntryForm
            entry={entries.find((e) => e.id === editEntryId)!}
            redirectTo={keep('')}
            cancelHref={keep('')}
          />
        </div>
      )}

      {/* Where you are, and how you want to look at it */}
      <div className="flex flex-wrap items-baseline justify-between gap-5">
        <div className="min-w-0">
          <div className="lbl tabular-nums">
            {trail.map((nodeId, i) => (
              <span key={nodeId}>
                {i > 0 && <span className="text-rule-strong">.</span>}
                <Link
                  href={nodeId === id ? viewHref(view, '') : viewHref(view, `focus=${nodeId}`)}
                  title={byId.get(nodeId)?.title}
                  className={
                    i === trail.length - 1 ? 'text-ink' : 'text-muted hover:text-ink'
                  }
                >
                  {i === 0 ? codes.get(nodeId) : codes.get(nodeId)?.split('.').pop()}
                </Link>
              </span>
            ))}
          </div>
          <h2 className="mt-1 truncate text-[26px] font-semibold tracking-[-0.025em]">
            {treeRoot.title}
          </h2>
          <div className="mono mt-1.5 text-[12px] text-muted">
            {rootCount.leaf_done} of {rootCount.leaf_total} tasks done
            {' · '}
            {(childrenOf.get(treeRootId) ?? []).length} parts here
            {below.length !== here.length && ` · ${below.length} tasks below`}
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-5">
          <div className="filterrow">
            {(['board', 'tree', 'map'] as const).map((v) => (
              <Link
                key={v}
                href={viewHref(v, focusId ? `focus=${focusId}` : '')}
                aria-pressed={view === v}
                className={view === v ? 'text-green' : 'text-muted hover:text-ink'}
              >
                {v}
              </Link>
            ))}
          </div>
          {view === 'board' && (
            <div className="filterrow">
              {(
                [
                  ['here', 'This level'],
                  ['below', 'Everything below'],
                ] as const
              ).map(([s, label]) => (
                <Link
                  key={s}
                  href={viewHref(
                    'board',
                    [focusId ? `focus=${focusId}` : '', `sc=${s}`, s === 'below' && partFilter ? `part=${partFilter}` : '']
                      .filter(Boolean)
                      .join('&'),
                  )}
                  aria-pressed={boardScope === s}
                  className={boardScope === s ? 'text-green' : 'text-muted hover:text-ink'}
                >
                  {label}
                </Link>
              ))}
            </div>
          )}
          {/*
            Shown from xl, because below it the log is stacked under the work
            rather than beside it and folding it away would hide a column
            nothing was competing with.
          */}
          <Link
            href={logHref(!logOpen)}
            aria-pressed={logOpen}
            className={`hidden xl:inline ${logOpen ? 'act' : 'lbl text-muted hover:text-ink'}`}
          >
            {logOpen ? 'Hide log' : 'Show log'}
          </Link>
          <Link
            href={newParent === treeRoot.id ? keep('') : keep(`new=${treeRoot.id}`)}
            className={newParent === treeRoot.id ? 'act' : 'btn'}
          >
            {newParent === treeRoot.id ? 'Close' : 'New part'}
          </Link>
        </div>
      </div>

      {newParent === treeRoot.id && (
        <div className="mt-5">
          <NodeForm parentId={treeRoot.id} redirectTo={keep('')} cancelHref={keep('')} />
        </div>
      )}

      {/*
        The board carries TASKS and nothing else.
        A subproject is not a card, it is the scope you are standing in: putting
        containers on a board makes a second hierarchy on top of the one the
        rail and the map already draw, and then every card is a different kind
        of thing. Only a task counts as work, so only a task is a card.
      */}
      {view === 'board' && boardScope === 'below' && partsWithWork.length > 1 && (
        <div className="filterrow mt-5 gap-x-5 gap-y-1.5">
          <span className="micro mr-1 text-rule-strong">Part</span>
          <Link
            href={viewHref('board', focusId ? `focus=${focusId}&sc=below` : 'sc=below')}
            aria-pressed={partFilter === null}
            className={partFilter === null ? 'text-green' : 'text-muted hover:text-ink'}
          >
            All {partsWithWork.length}
          </Link>
          {partsWithWork.map((p) => (
            <Link
              key={p.id}
              href={viewHref(
                'board',
                [focusId ? `focus=${focusId}` : '', 'sc=below', `part=${p.id}`]
                  .filter(Boolean)
                  .join('&'),
              )}
              aria-pressed={partFilter === p.id}
              className={partFilter === p.id ? 'text-green' : 'text-muted hover:text-ink'}
            >
              {p.title}
            </Link>
          ))}
        </div>
      )}

      {view === 'board' && (
        <div className="mt-6">
          {boardWork.length === 0 ? (
            <p className="panel px-3.5 py-3 text-[13px] text-muted">
              {partFilter !== null ? (
                <>
                  Nothing under {byId.get(partFilter)?.title ?? 'that part'} is in any
                  of these three states.{' '}
                  <Link
                    href={viewHref('board', focusId ? `focus=${focusId}&sc=below` : 'sc=below')}
                    className="act"
                  >
                    Show every part
                  </Link>
                </>
              ) : (
                <>
                  No task sits directly under {treeRoot.title}.{' '}
                  {below.length > 0 ? (
                    <>
                      {below.length} sit further down.{' '}
                      <Link
                        href={viewHref('board', focusId ? `focus=${focusId}&sc=below` : 'sc=below')}
                        className="act"
                      >
                        Show everything below
                      </Link>
                    </>
                  ) : (
                    'Nothing under it has been broken down into tasks yet.'
                  )}
                </>
              )}
            </p>
          ) : (
            <BoardShell
              openHref={keep('task={id}')}
              moveHref={keep('task={id}&to={status}')}
            >
            <div className="panel grid grid-flow-col auto-cols-[minmax(260px,1fr)] overflow-x-auto">
              {COLUMNS.map(([status, label]) => {
                const inCol = boardWork.filter((n) => n.status === status)
                const groups: { parent: Node | undefined; items: Node[] }[] = []
                if (boardScope === 'below') {
                  for (const n of inCol) {
                    const last = groups[groups.length - 1]
                    if (last && last.parent?.id === n.parent_id) last.items.push(n)
                    else groups.push({ parent: byId.get(n.parent_id ?? ''), items: [n] })
                  }
                }
                return (
                  <div
                    key={status}
                    data-col={status}
                    className="min-w-0 border-l border-rule first:border-l-0"
                  >
                    <div className="flex items-baseline justify-between gap-2 border-b border-rule-strong px-3.5 py-2.5">
                      <span className="font-medium">{label}</span>
                      <span className="micro text-muted">{inCol.length}</span>
                    </div>
                    {inCol.length === 0 ? (
                      <p className="px-3.5 py-3 text-[12px] text-muted">Nothing here.</p>
                    ) : boardScope === 'below' ? (
                      /*
                        A part's cards have to read as that part's.
                        The group used to end in the same hairline a card ends
                        in, and its name was a small label in the same rhythm
                        as a card's own «TASK». So five subprojects each
                        carrying «2D mapping», «Master data» and «Maintenance
                        history» drew fifteen identical cards in one column
                        with nothing saying where one part stopped.
                        The head sits on the page ground rather than the
                        panel's now, in the weight a name deserves and with its
                        own count, which is the same treatment the groups on
                        Projects get; and the group closes on the strong rule,
                        the one the columns and the band are drawn with. Two
                        weights of line already exist in this design. The
                        quiet one separates cards, the strong one separates
                        parts, and that is the whole of it.
                      */
                      groups.map((g, gi) => (
                        <div
                          key={gi}
                          className="border-b-2 border-line-strong last:border-b-0"
                        >
                          <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5 border-b border-line-strong bg-paper px-3.5 py-2">
                            <span className="min-w-0 text-[13px] font-semibold leading-snug tracking-[-0.01em] text-green">
                              {g.parent?.title ?? treeRoot.title}
                            </span>
                            <span className="mono ml-auto shrink-0 text-[11px] text-muted">
                              {g.items.length}
                            </span>
                            {g.parent && pathAbove(g.parent) && (
                              <span className="w-full text-[10.5px] leading-snug text-rule-strong">
                                {pathAbove(g.parent)}
                              </span>
                            )}
                          </div>
                          {g.items.map((n) => (
                            <Card key={n.id} node={n} grouped />
                          ))}
                        </div>
                      ))
                    ) : (
                      inCol.map((n) => <Card key={n.id} node={n} grouped={false} />)
                    )}
                  </div>
                )
              })}
            </div>
            </BoardShell>
          )}
          <p className="mt-3 max-w-[64ch] text-[12px] leading-relaxed text-muted">
            Drag a card to another column, or walk the board with{' '}
            <span className="kbd">J</span> <span className="kbd">K</span> and open one with{' '}
            <span className="kbd">Enter</span>. A drop does not move anything on its own: it
            opens the task with the new state chosen and the line still to write.
          </p>
        </div>
      )}

      {/*
        The tree shows ONE level. It is the structure, not the work: what hangs
        directly here, containers and tasks alike, with the containers carrying
        what is inside them so you can see the size before you open it.
      */}
      {view === 'tree' && (
        <div className="mt-6">
          {(childrenOf.get(treeRootId) ?? []).length === 0 ? (
            <p className="border-t border-rule py-4 text-[13px] text-muted">
              Nothing under this yet.
            </p>
          ) : (
            <div className="border-b border-rule">
              {(childrenOf.get(treeRootId) ?? []).map((n, i) => (
                <Row key={n.id} node={n} depth={0} first={i === 0} />
              ))}
            </div>
          )}
          <p className="mt-4 max-w-[64ch] text-[12px] leading-relaxed text-muted">
            One level at a time. A part that holds other parts opens into its own,
            and the whole hierarchy at once is the map.
          </p>
        </div>
      )}

      {/*
        The map is the whole hierarchy on one screen. Hairlines and
        perpendicular bends, no arrows and no boxes, which is the same drawing
        the folders and the dependencies use.
      */}
      {view === 'map' && (
        <div className="panel mt-6 px-4 py-4">
          <MapLevel parentId={treeRootId} />
        </div>
      )}

      {openTask && (
        <TaskSheet
          node={openTask}
          code={codes.get(openTask.id) ?? ''}
          path={taskPath}
          closeHref={keep('')}
          redirectTo={keep(`task=${openTask.id}`)}
          preselect={
            moveTo && COLUMNS.some(([c]) => c === moveTo) ? (moveTo as NodeStatus) : undefined
          }
          blockers={blockers.filter((b) => b.node_id === openTask.id)}
          decisions={decisions.filter((d) => d.node_id === openTask.id)}
          entries={entries.filter((e) => e.node_id === openTask.id)}
          waitsOn={deps.filter((d) => d.node_id === openTask.id)}
          holdsUp={deps.filter((d) => d.depends_on_id === openTask.id)}
          titleOf={(nodeId) => byId.get(nodeId)?.title ?? 'a part you cannot open'}
          today={today}
        />
      )}
    </div>

      {/*
        The pulse. One stream, four switches, and the three ways in that quick
        entry cannot express on its own: an order between two pieces of work
        needs a picker, because the other end is a node and not a sentence.
      */}
      <div
        className={`min-w-0 border-t border-rule px-5 py-7 lg:px-8 xl:border-l xl:border-t-0 ${
          logOpen ? '' : 'xl:hidden'
        }`}
      >
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="text-[17px] font-semibold tracking-[-0.025em]">Log</h2>
          <span className="flex shrink-0 items-baseline gap-4">
            <Link href="/friday" className="lbl-tight text-green hover:text-oxblood">
              → Friday
            </Link>
            {/* Folding it from the thing being folded, which is where you are. */}
            <Link href={logHref(false)} className="lbl-tight hidden text-muted hover:text-ink xl:inline">
              Hide
            </Link>
          </span>
        </div>
        {focused && <div className="lbl-tight mt-1 text-rule-strong">this part and below</div>}

        <LogStream
          items={stream}
          empty={
            focused
              ? 'Nothing written on this part or anything under it.'
              : 'Nothing written on this project yet. Press Ctrl+K and write a line.'
          }
        />

        <div className="sec-gap flex flex-wrap items-baseline gap-5">
          <Link href={keep(`bnew=${treeRootId}`)} className="act">
            New blocker
          </Link>
          <Link href={keep(`dnew=${treeRootId}`)} className="act">
            Record a decision
          </Link>
          {ready.get(treeRootId) && !ready.get(treeRootId)!.is_ready && (
            <span
              className={`lbl-tight ${
                ready.get(treeRootId)!.overdue_count > 0 ? 'text-oxblood' : 'text-muted'
              }`}
            >
              {ready.get(treeRootId)!.overdue_count > 0
                ? `Held up, ${ready.get(treeRootId)!.overdue_count} late`
                : `Waiting on ${ready.get(treeRootId)!.waiting_on_count}`}
            </span>
          )}
        </div>

        {depCandidates.length > 0 && (
          <form action={addDependency} className="mt-4 flex flex-col gap-2">
            <input type="hidden" name="node_id" value={treeRootId} />
            <input type="hidden" name="redirectTo" value={keep('')} />
            <select name="depends_on_id" defaultValue="" className="field" required>
              <option value="" disabled>
                Waits on...
              </option>
              {depCandidates.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.title}
                </option>
              ))}
            </select>
            <input name="note" placeholder="Why, in one line" className="field" />
            <button className="act self-start">Add the order</button>
          </form>
        )}
      </div>
    </div>
  )
}
