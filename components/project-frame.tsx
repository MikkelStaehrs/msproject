import Link from 'next/link'
import { daysBetween, today as todayIso } from '@/lib/date'
import { createClient } from '@/lib/supabase/server'
import { QueryFailure, firstError } from '@/lib/failure'
import { ProjectNav } from '@/components/project-nav'
import { StatusSelect } from '@/components/status-select'
import { PEOPLE_FIELDS, readIdentity } from '@/lib/identity'
import { pathTo } from '@/lib/wbs'
import { subtreeIds as subtreeIdsOf } from '@/lib/subtree'
import { addDependency, removeDependency } from '@/lib/dependency-actions'
import {
  ProgressRow,
  Rule,
  formatDate,
  formatDateLong,
  relativeDays,
  ProseOpening,
} from '@/components/ui'
import {
  type BlockerDays,
  type Decision,
  type Entry,
  type NextDate,
  type Node,
  type NodeDependency,
  type NodeProgress,
  type NodeReady,
  type NodeState,
  type NodeStatus,
  type NodeType,
} from '@/lib/types'

const KIND_LABEL: Record<string, string> = {
  work: 'Work',
  note: 'Note',
  meeting: 'Meeting',
  risk: 'Risk',
}

/**
 * The frame around a project page: title block, sub navigation and the right
 * column with the pulse.
 *
 * It describes ONE node. On the tree that node follows the focus, so going
 * into a part changes what the frame is about; everywhere else it is the
 * project. A layout cannot read search params in Next, which is why this is a
 * component the pages render rather than a layout they sit inside.
 */
export async function ProjectFrame({
  projectId,
  frameNodeId,
  focusId,
  toggle,
  children,
}: {
  projectId: string
  frameNodeId: string
  /** Kept on every link out of the frame, so an edit never drops the focus. */
  focusId?: string
  /** Switch between the part's figures and the project's, without leaving. */
  toggle?: { href: string; label: string }
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const base = `/p/${projectId}`
  const today = todayIso()
  const isProject = frameNodeId === projectId
  const link = (query: string) =>
    focusId ? `${base}?focus=${focusId}&${query}` : `${base}?${query}`

  /*
   * One round trip, not two.
   *
   * Asking v_node_descendant which nodes are underneath, and only then issuing
   * the queries that filter by the answer, turned one wait into two. The
   * portfolio is a few dozen rows, so it is cheaper to fetch and walk it here.
   *
   * The same reasoning covers the unfiltered fetches below: entries, blockers
   * and decisions come back whole and are cut to the subtree in memory. The
   * entry query keeps a limit because that is the one table that grows without
   * bound; the day it is the wrong shape, it will be because there are more
   * than two hundred entries in the portfolio, and that is a good problem.
   */
  const [nodeRes, projectRes, chainRes, progressRes, nextRes, entryRes, blockerRes, decisionRes, stateRes, readyRes, partsRes, waitsRes, blocksRes] =
    await Promise.all([
      supabase.from('node').select('*').eq('id', frameNodeId).single(),
      isProject
        ? Promise.resolve({ data: null })
        : supabase.from('node').select('id, title, reporting').eq('id', projectId).single(),
      supabase.from('node').select('id, parent_id, title, status, type, due_date').order('sort_order'),
      supabase.from('v_node_progress').select('*').eq('node_id', frameNodeId).maybeSingle(),
      supabase.from('v_next_date').select('*').eq('node_id', frameNodeId).maybeSingle(),
      supabase.from('entry').select('*').order('entry_date', { ascending: false }).limit(200),
      supabase.from('v_blocker_days').select('*'),
      supabase.from('decision').select('*').order('decided_on', { ascending: false }),
      supabase.from('v_node_state').select('*').eq('node_id', frameNodeId).maybeSingle(),
      supabase.from('v_node_ready').select('*').eq('node_id', frameNodeId).maybeSingle(),
      supabase.from('v_node_progress').select('node_id, leaf_total'),
      supabase.from('node_dependency').select('*').eq('node_id', frameNodeId),
      supabase.from('node_dependency').select('*').eq('depends_on_id', frameNodeId),
    ])

  /*
   * The frame is the pulse, and it stands on every sub page, so a failure here
   * is a failure on all of them at once. It is also where a silent one costs
   * most: the work log, the blockers and the decisions all render as «nothing
   * yet», which is the reading you want on a quiet part and a lie on a broken
   * query. v_node_ready went unnoticed for exactly this reason.
   *
   * `projectRes` is left out because it is not always a query: on a project the
   * slot is filled with a resolved null rather than a round trip.
   */
  const failure = firstError([
    nodeRes,
    chainRes,
    progressRes,
    nextRes,
    entryRes,
    blockerRes,
    decisionRes,
    stateRes,
    readyRes,
    partsRes,
    waitsRes,
    blocksRes,
  ])
  if (failure) return <QueryFailure message={failure} />

  const node = nodeRes.data as Node
  const parent = projectRes.data as { id: string; title: string; reporting: unknown } | null
  const progress = progressRes.data as NodeProgress | null
  const next = nextRes.data as NextDate | null
  const state = stateRes.data as NodeState | null

  const allNodes = (chainRes.data ?? []) as {
    id: string
    parent_id: string | null
    title: string
    status: NodeStatus
    type: NodeType
    due_date: string | null
  }[]
  const subtreeIds = subtreeIdsOf(allNodes, frameNodeId)
  const inSubtree = new Set(subtreeIds)

  const entries = ((entryRes.data ?? []) as Entry[])
    .filter((e) => inSubtree.has(e.node_id))
    .slice(0, 12)
  const blockers = ((blockerRes.data ?? []) as BlockerDays[]).filter((b) =>
    inSubtree.has(b.node_id),
  )
  const decisions = ((decisionRes.data ?? []) as Decision[]).filter((d) =>
    inSubtree.has(d.node_id),
  )
  const titleById = new Map(allNodes.map((n) => [n.id, n.title]))

  /*
   * The path from the project down to what the frame is describing.
   *
   * It used to name the project and nothing else, so a node two levels down
   * read «Part of Digitalization of the Production Lines» when its actual
   * parent was «Production Line: Cleaning». That was wrong, and it also left no
   * way back up one step: the only thing named was the only thing you could
   * click, and that took you all the way out.
   */
  const chain = allNodes
  const chainTitle = new Map(chain.map((n) => [n.id, n.title]))
  const ancestors = pathTo(chain, projectId, frameNodeId)
    .slice(0, -1)
    .map((nodeId) => ({
      id: nodeId,
      title: chainTitle.get(nodeId) ?? 'Unknown',
      href: nodeId === projectId ? base : `${base}?focus=${nodeId}`,
    }))

  /*
   * Sequence, in both directions. What has to finish before this can start, and
   * what is held up until this does. The table always accepted any node; only
   * the UI restricted it to top level projects, which is why a task could not
   * be recorded as waiting on a task in another subproject.
   */
  const ready = readyRes.data as NodeReady | null
  const waitsOn = (waitsRes.data ?? []) as NodeDependency[]
  const blocks = (blocksRes.data ?? []) as NodeDependency[]

  const chainById = new Map(chain.map((n) => [n.id, n]))

  /** Late, and therefore actually costing time. Unfinished alone is a plan. */
  const isLate = (nodeId: string) => {
    const n = chainById.get(nodeId)
    if (!n || n.status === 'done' || n.status === 'cancelled') return false
    return n.due_date !== null && n.due_date < today
  }
  const linked = new Set(waitsOn.map((d) => d.depends_on_id))
  const kin = new Set([...subtreeIds, ...pathTo(chain, projectId, frameNodeId)])

  // Waiting on your own ancestor or descendant is not a sequence, it is the
  // tree, so those are not offered.
  const candidates = chain.filter((n) => !kin.has(n.id) && !linked.has(n.id))

  /*
   * Containers with no task anywhere underneath them.
   *
   * «Nothing has been broken down» and «nothing has been done» both read as
   * 0 %, and only one of them is a problem you can act on today. A container
   * that holds no work is invisible otherwise: it contributes nothing to
   * progress and nothing says why.
   */
  const leafTotals = new Map(
    ((partsRes.data ?? []) as { node_id: string; leaf_total: number }[]).map((r) => [
      r.node_id,
      r.leaf_total,
    ]),
  )
  const notBrokenDown = chain.filter(
    (n) =>
      inSubtree.has(n.id) &&
      n.id !== frameNodeId &&
      n.type !== 'task' &&
      (leafTotals.get(n.id) ?? 0) === 0,
  ).length

  const identity = readIdentity(node.reporting)
  const parentIdentity = readIdentity(parent?.reporting ?? null)

  /*
   * People are grouped by person, not by role. One person often wears four
   * hats. A part with no roles of its own shows the project's, marked as
   * inherited, so an empty role never reads as "nobody".
   */
  const source = Object.keys(identity.people).length > 0 ? identity.people : null
  const inherited = source === null && !isProject
  const people = source ?? (inherited ? parentIdentity.people : identity.people)

  const roleByPerson = new Map<string, string[]>()
  const addRole = (person: string, role: string) => {
    const name = person.trim()
    if (name === '') return
    roleByPerson.set(name, [...(roleByPerson.get(name) ?? []), role])
  }
  if (node.owner) addRole(node.owner, 'responsible')
  for (const f of PEOPLE_FIELDS) {
    const value = people[f.key]
    if (!value) continue
    for (const name of value.split(',')) addRole(name, f.label.toLowerCase())
  }
  const profiles = [...roleByPerson].map(([name, roles]) => ({ name, roles }))

  const deadlineDays =
    node.due_date === null
      ? null
      : daysBetween(today, node.due_date)

  return (
    <>
      {/* Title block */}
      <div className="frame">
        <div className="pl-5 lg:pl-16 py-7 pr-5">
          <StatusSelect
            id={node.id}
            status={node.status}
            blocked={state?.is_blocked ?? false}
            waitDays={state?.worst_wait ?? 0}
          />

          {profiles.length === 0 ? (
            <Link
              href={`${base}/identitet`}
              className="mt-5 block text-[11px] leading-relaxed text-rule-strong hover:text-muted"
            >
              No people recorded yet
            </Link>
          ) : (
            <div className="mt-5">
              <div className="lbl text-muted">
                People
                {inherited && (
                  <span className="ml-2 text-rule-strong">from the project</span>
                )}
              </div>
              <div className="mt-2 flex flex-col gap-2.5">
                {profiles.slice(0, 4).map((p) => (
                  <div key={p.name} className="text-[11px] leading-snug">
                    <div className="text-ink">{p.name}</div>
                    <div className="mt-0.5 text-[9.5px] leading-snug text-muted">
                      {p.roles.join(', ')}
                    </div>
                  </div>
                ))}
                {profiles.length > 4 && (
                  <Link
                    href={`${base}/identitet`}
                    className="text-[10px] text-rule-strong hover:text-muted"
                  >
                    and {profiles.length - 4} more
                  </Link>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="border-l border-rule px-5 lg:px-10 py-7">
          {ancestors.length > 0 && (
            <div className="lbl mb-2 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-muted">
              {ancestors.map((a, i) => (
                <span key={a.id} className="flex items-baseline gap-2">
                  {i > 0 && <span className="text-rule-strong">&rsaquo;</span>}
                  <Link href={a.href} className="text-ink hover:text-green">
                    {a.title}
                  </Link>
                </span>
              ))}
              <span className="text-rule-strong">&rsaquo;</span>
            </div>
          )}
          <h1 className="max-w-3xl font-display text-[42px] font-medium leading-[1.08] tracking-[-0.02em]">
            {node.title}
          </h1>
          <ProseOpening
            text={node.description}
            className="mt-3.5 max-w-2xl text-[13px]"
          />
          <div className="mt-6 flex max-w-2xl items-center gap-6">
            <div className="flex-1">
              <ProgressRow
                done={progress?.leaf_done ?? 0}
                total={progress?.leaf_total ?? 0}
                pct={progress?.progress_pct ?? 0}
              />
            </div>
            {toggle && (
              <Link
                href={toggle.href}
                className="lbl-tight shrink-0 text-muted hover:text-ink"
              >
                {toggle.label}
              </Link>
            )}
          </div>

          {notBrokenDown > 0 && (
            <div
              className="lbl-tight mt-2.5 text-muted"
              title="Containers with no task anywhere underneath them. They hold no work yet, so they count for nothing in the percentage above."
            >
              <span className="text-ink">{notBrokenDown}</span>{' '}
              {notBrokenDown === 1 ? 'part' : 'parts'} not broken down
            </div>
          )}
        </div>

        <div className="border-l border-rule py-7 pl-5 lg:pl-8 pr-5 lg:pr-16">
          <div className="lbl text-muted">
            Timeline
            {!isProject && <span className="ml-2 text-rule-strong">this part</span>}
          </div>

          <div className="mt-3">
            <div className="flex items-baseline gap-3 border-t border-rule py-2">
              <span className="lbl w-[54px] shrink-0 text-muted">Start</span>
              <span className="flex-1 text-[12px] tabular-nums">
                {node.start_date ? (
                  formatDateLong(node.start_date)
                ) : (
                  <span className="text-rule-strong">not set</span>
                )}
              </span>
            </div>

            <div className="flex items-baseline gap-3 border-t border-rule py-2">
              <span className="lbl w-[54px] shrink-0 text-muted">Next</span>
              <span className="flex-1">
                {next ? (
                  <>
                    <span className="text-[13px]">{next.title}</span>
                    <span className="ml-2 text-[11px] tabular-nums text-muted">
                      {formatDate(next.due_date)}
                      {', '}
                      <span className={next.days_until < 0 ? 'text-oxblood' : undefined}>
                        {relativeDays(next.days_until)}
                      </span>
                      {next.is_milestone && ' · milestone'}
                    </span>
                  </>
                ) : (
                  <span className="text-[12px] text-rule-strong">
                    no open node with a due date
                  </span>
                )}
              </span>
            </div>

            <div className="flex items-baseline gap-3 border-y border-rule py-2">
              <span className="lbl w-[54px] shrink-0 text-muted">End</span>
              <span className="flex-1 text-[12px] tabular-nums">
                {node.due_date ? (
                  <>
                    {formatDateLong(node.due_date)}
                    {deadlineDays !== null && (
                      <span
                        className={`ml-2 ${deadlineDays < 0 ? 'text-oxblood' : 'text-muted'}`}
                      >
                        {relativeDays(deadlineDays)}
                      </span>
                    )}
                  </>
                ) : (
                  <span className="text-rule-strong">not set</span>
                )}
              </span>
            </div>
          </div>
        </div>
      </div>
      <Rule strong />

      {/* Body: sub navigation, the page, the pulse */}
      <div className="frame min-h-[50vh]">
        <ProjectNav base={base} />

        <div className="border-l border-rule">{children}</div>

        <div className="border-l border-rule">
          <section className="py-7 pl-5 lg:pl-8 pr-5 lg:pr-16">
            <div className="flex items-baseline justify-between gap-4">
              <h2 className="font-display text-2xl font-medium">Work log</h2>
              <Link
                href={`${base}/rapporter`}
                className="lbl-tight text-green hover:text-oxblood"
              >
                → Friday
              </Link>
            </div>
            {!isProject && (
              <div className="lbl-tight mt-1 text-rule-strong">this part only</div>
            )}
            {entries.length === 0 ? (
              <p className="mt-3 text-[13px] text-muted">
                No entries yet. Press Ctrl+K and write a line.
              </p>
            ) : (
              <div className="mt-3.5">
                {entries.map((e) => (
                  <div key={e.id} className="border-t border-rule py-3 last:border-b">
                    <div className="flex items-baseline gap-3">
                      <span className="min-w-[52px] text-[10px] tabular-nums text-muted">
                        {formatDate(e.entry_date)}
                      </span>
                      <span
                        className={`text-[9px] font-medium uppercase tracking-[0.14em] ${
                          e.kind === 'risk'
                            ? 'text-oxblood'
                            : e.kind === 'work'
                              ? 'text-green'
                              : 'text-muted'
                        }`}
                      >
                        {KIND_LABEL[e.kind] ?? e.kind}
                      </span>
                      <Link
                        href={link(`eedit=${e.id}`)}
                        className="lbl-tight ml-auto text-rule-strong hover:text-ink"
                      >
                        Edit
                      </Link>
                    </div>
                    <p className="mt-1.5 text-[12.5px] leading-relaxed">{e.body}</p>
                  </div>
                ))}
              </div>
            )}
          </section>
          <Rule />

          <section className="py-6 pl-5 lg:pl-8 pr-5 lg:pr-16">
            <div className="flex items-baseline justify-between">
              <h2 className="font-display text-2xl font-medium">Blockers</h2>
              <Link
                href={link(`bnew=${frameNodeId}`)}
                className="lbl text-green hover:text-oxblood"
              >
                New
              </Link>
            </div>
            {blockers.length === 0 ? (
              <p className="mt-3 text-[13px] text-muted">None recorded.</p>
            ) : (
              <div className="mt-3.5">
                {[...blockers]
                  .sort((a, b) => {
                    if (a.is_active !== b.is_active) return a.is_active ? -1 : 1
                    return b.days_blocked - a.days_blocked
                  })
                  .map((b) => {
                    const overdue =
                      b.is_active && b.expected_by !== null && b.expected_by < today
                    return (
                      <div
                        key={b.id}
                        className="flex items-baseline gap-3.5 border-t border-rule py-3 last:border-b"
                      >
                        <div
                          className={`num min-w-[40px] text-[26px] leading-none ${
                            overdue
                              ? 'text-oxblood'
                              : b.is_active
                                ? 'text-ink'
                                : 'text-rule-strong'
                          }`}
                        >
                          {b.days_blocked}
                        </div>
                        <div className="flex-1">
                          <div
                            className={`text-[12.5px] leading-snug ${
                              b.is_active ? '' : 'text-muted'
                            }`}
                          >
                            {b.title}
                          </div>
                          <div className="mt-0.5 text-[10.5px] text-muted">
                            {b.waiting_on} · {titleById.get(b.node_id)}
                            {!b.is_active && b.resolution && <> · {b.resolution}</>}
                          </div>
                          <div className="mt-1.5 flex items-baseline gap-3.5">
                            {b.is_active && (
                              <Link
                                href={link(`bresolve=${b.id}`)}
                                className="lbl-tight text-green hover:text-oxblood"
                              >
                                Close
                              </Link>
                            )}
                            <Link
                              href={link(`bedit=${b.id}`)}
                              className="lbl-tight text-muted hover:text-ink"
                            >
                              Edit
                            </Link>
                          </div>
                        </div>
                      </div>
                    )
                  })}
              </div>
            )}
          </section>
          <Rule />

          <section className="py-6 pb-8 pl-5 lg:pl-8 pr-5 lg:pr-16">
            <div className="flex items-baseline justify-between">
              <h2 className="font-display text-2xl font-medium">Decisions</h2>
              <Link
                href={link(`dnew=${frameNodeId}`)}
                className="lbl text-green hover:text-oxblood"
              >
                New
              </Link>
            </div>
            {decisions.length === 0 ? (
              <p className="mt-3 text-[13px] text-muted">
                None yet. Type{' '}
                <span className="text-rule-strong">? decision // why</span> in quick
                entry.
              </p>
            ) : (
              <div className="mt-3.5">
                {decisions.map((d) => (
                  <div key={d.id} className="border-t border-rule py-3 last:border-b">
                    <div className="flex items-baseline justify-between gap-4">
                      <div className="text-[10px] tabular-nums text-muted">
                        {formatDateLong(d.decided_on)}
                      </div>
                      <Link
                        href={link(`dedit=${d.id}`)}
                        className="lbl-tight text-muted hover:text-ink"
                      >
                        Edit
                      </Link>
                    </div>
                    <div className="mt-1.5 text-[13px] font-medium leading-snug">
                      {d.decision}
                    </div>
                    {d.rationale ? (
                      <p className="mt-1.5 text-[11.5px] leading-relaxed">{d.rationale}</p>
                    ) : (
                      <p className="mt-1.5 text-[11.5px] text-rule-strong">
                        No rationale recorded.
                      </p>
                    )}
                    {d.alternatives && (
                      <p className="mt-1.5 border-l border-rule pl-3 text-[11.5px] leading-relaxed text-muted">
                        {d.alternatives}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
          <Rule />

          <section className="py-6 pl-5 lg:pl-8 pr-5 lg:pr-16">
            <div className="flex items-baseline justify-between gap-4">
              <h2 className="font-display text-2xl font-medium">Sequence</h2>
              {ready && !ready.is_ready && (
                ready.overdue_count > 0 ? (
                  <span className="lbl-tight text-oxblood">
                    Held up, {ready.overdue_count} late
                  </span>
                ) : (
                  <span className="lbl-tight text-muted">
                    Waiting on {ready.waiting_on_count}
                  </span>
                )
              )}
            </div>

            <div className="lbl-tight mt-1 text-rule-strong">
              What must finish first. Ordinary until something runs late
            </div>

            {waitsOn.length === 0 && blocks.length === 0 ? (
              <p className="mt-3 text-[13px] text-muted">Nothing recorded either way.</p>
            ) : (
              <div className="mt-3.5">
                {waitsOn.map((d) => {
                  const target = chainById.get(d.depends_on_id)
                  const settled =
                    target?.status === 'done' || target?.status === 'cancelled'
                  const late = isLate(d.depends_on_id)
                  return (
                    <div key={d.id} className="border-t border-rule py-2.5 last:border-b">
                      <div className="flex items-baseline gap-3">
                        <span className="lbl-tight w-[62px] shrink-0 text-muted">Waits on</span>
                        <Link
                          href={`${base}?focus=${d.depends_on_id}`}
                          className={`flex-1 text-[12.5px] hover:text-green ${
                            settled ? 'text-muted line-through decoration-rule' : ''
                          }`}
                        >
                          {target?.title ?? 'Unknown node'}
                        </Link>
                        {late && (
                          <span className="lbl-tight shrink-0 text-oxblood">Late</span>
                        )}
                        <form action={removeDependency}>
                          <input type="hidden" name="id" value={d.id} />
                          <input type="hidden" name="redirectTo" value={link('')} />
                          <button className="lbl-tight text-rule-strong hover:text-oxblood">
                            Remove
                          </button>
                        </form>
                      </div>
                      {d.note && (
                        <p className="ml-[74px] mt-1 text-[11.5px] leading-relaxed text-muted">
                          {d.note}
                        </p>
                      )}
                    </div>
                  )
                })}

                {blocks.map((d) => (
                  <div key={d.id} className="border-t border-rule py-2.5 last:border-b">
                    <div className="flex items-baseline gap-3">
                      <span className="lbl-tight w-[62px] shrink-0 text-rule-strong">Holds up</span>
                      <Link
                        href={`${base}?focus=${d.node_id}`}
                        className="flex-1 text-[12.5px] text-muted hover:text-green"
                      >
                        {chainById.get(d.node_id)?.title ?? 'Unknown node'}
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {candidates.length > 0 && (
              <form action={addDependency} className="mt-4 flex flex-col gap-2">
                <input type="hidden" name="node_id" value={frameNodeId} />
                <input type="hidden" name="redirectTo" value={link('')} />
                <select name="depends_on_id" defaultValue="" className="field" required>
                  <option value="" disabled>
                    Waits on...
                  </option>
                  {candidates.map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.title}
                    </option>
                  ))}
                </select>
                <input name="note" placeholder="Why, in one line" className="field" />
                <button className="lbl-tight self-start text-green hover:text-oxblood">
                  Add
                </button>
              </form>
            )}
          </section>
        </div>
      </div>
    </>
  )
}
