import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { QueryFailure, firstError } from '@/lib/failure'
import { BlockerForm, ResolveBlockerForm } from '@/components/blocker-form'
import { DecisionForm } from '@/components/decision-form'
import { StatusSelect } from '@/components/status-select'
import { QuickAddOn } from '@/components/quick-add-on'
import { WhichOne } from '@/components/which-one'
import {
  ProgressScale,
  Prose,
  StatusMark,
  formatDate,
  relativeDays,
} from '@/components/ui'
import { formatMoney } from '@/lib/cost'
import { daysBetween, today as todayIso } from '@/lib/date'
import { pathTo, wbsCodes } from '@/lib/wbs'
import { subtreeSet } from '@/lib/subtree'
import { NodeForm, type ParentOption } from '@/components/node-form'
import {
  COST_BUDGET_LABEL,
  COST_STATE_LABEL,
  EFFECTIVE_STATUS_LABEL,
  TYPE_LABEL,
  DECISION_TOPIC_LABEL,
  type BlockerDays,
  type Cost,
  type Decision,
  type Entry,
  type Node,
  type NodeCost,
  type NodeDependency,
  type NodeProgress,
  type NodeReady,
  type NodeState,
} from '@/lib/types'

export const dynamic = 'force-dynamic'

/**
 * The working surface for a meeting.
 *
 * Not a presentation. You bring up a project or a part, and then you walk its
 * pieces one at a time while a room talks about them: the list stays on the
 * left, the piece under discussion fills the right, and everything you might
 * need to change about it is there rather than three clicks away.
 *
 * The tree is the wrong shape for this. It is built to show a hundred rows at
 * once, which is exactly what nobody can read together, and its detail is
 * scattered across a rail. Here one piece is the whole screen.
 *
 * What is deliberate: status changes inline, blockers and decisions can be
 * opened without leaving, and Ctrl+K writes a line on whatever is selected. A
 * meeting is when those surface, and the record is worth nothing if capturing
 * it means losing the room.
 */
export default async function MeetingPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{
    focus?: string
    task?: string
    bnew?: string
    bresolve?: string
    dnew?: string
    edit?: string
    new?: string
  }>
}) {
  const { id } = await params
  const {
    focus: focusId,
    task: taskId,
    bnew: newBlocker,
    bresolve: resolveBlocker,
    dnew: newDecision,
    edit: editId,
    new: creating,
  } = await searchParams
  const supabase = await createClient()

  /*
   * One round trip. Asking which nodes are underneath and only then filtering
   * by the answer costs a second wait for nothing at this size.
   */
  const [
    nodesRes, progressRes, stateRes, readyRes,
    blockerRes, entryRes, decisionRes, depRes, costRes, lineRes,
  ] = await Promise.all([
    supabase.from('node').select('*').order('sort_order'),
    supabase.from('v_node_progress').select('*'),
    supabase.from('v_node_state').select('*'),
    supabase.from('v_node_ready').select('*'),
    supabase.from('v_blocker_days').select('*'),
    supabase.from('entry').select('*').order('entry_date', { ascending: false }).limit(200),
    supabase.from('decision').select('*').order('decided_on', { ascending: false }),
    supabase.from('node_dependency').select('*'),
    supabase.from('v_node_cost').select('*'),
    supabase.from('cost').select('*').order('dated', { ascending: false }),
  ])

  const failure = firstError([
    nodesRes, progressRes, stateRes, readyRes,
    blockerRes, entryRes, decisionRes, depRes, costRes, lineRes,
  ])
  if (failure) return <QueryFailure message={failure} />

  const everyNode = (nodesRes.data ?? []) as Node[]
  const project = everyNode.find((n) => n.id === id)
  if (!project) notFound()

  const inProject = subtreeSet(everyNode, id)
  const nodes = everyNode.filter((n) => inProject.has(n.id))

  const byId = new Map(nodes.map((n) => [n.id, n]))
  const childrenOf = new Map<string, Node[]>()
  for (const n of nodes) {
    if (n.parent_id === null) continue
    childrenOf.set(n.parent_id, [...(childrenOf.get(n.parent_id) ?? []), n])
  }

  const subject = (focusId ? byId.get(focusId) : undefined) ?? project

  /** The pieces you walk. Direct children, in their own order. */
  const pieces = childrenOf.get(subject.id) ?? []
  const selected = (taskId ? pieces.find((p) => p.id === taskId) : undefined) ?? pieces[0]

  const descendantsOf = (nodeId: string): string[] => {
    const kids = childrenOf.get(nodeId) ?? []
    return kids.flatMap((k) => [k.id, ...descendantsOf(k.id)])
  }
  const inSelected = selected ? new Set([selected.id, ...descendantsOf(selected.id)]) : new Set<string>()

  const progress = new Map(((progressRes.data ?? []) as NodeProgress[]).map((p) => [p.node_id, p]))
  const state = new Map(((stateRes.data ?? []) as NodeState[]).map((s) => [s.node_id, s]))
  const ready = new Map(((readyRes.data ?? []) as NodeReady[]).map((r) => [r.node_id, r]))
  const cost = new Map(((costRes.data ?? []) as NodeCost[]).map((c) => [c.node_id, c]))

  const allBlockers = (blockerRes.data ?? []) as BlockerDays[]
  const blockers = allBlockers.filter((b) => inSelected.has(b.node_id))
  const entries = ((entryRes.data ?? []) as Entry[]).filter((e) => inSelected.has(e.node_id))
  const decisions = ((decisionRes.data ?? []) as Decision[]).filter((d) => inSelected.has(d.node_id))
  const deps = ((depRes.data ?? []) as NodeDependency[]).filter(
    (d) => inSelected.has(d.node_id) || inSelected.has(d.depends_on_id),
  )
  const lines = ((lineRes.data ?? []) as Cost[]).filter((l) => inSelected.has(l.node_id))

  const today = todayIso()
  const projectNo =
    typeof project.reporting?.project_no === 'string' ? project.reporting.project_no : ''
  const codes = wbsCodes(nodes, id, projectNo)

  const base = `/p/${id}`
  const here = focusId ? `${base}/meeting?focus=${focusId}` : `${base}/meeting`
  const at = (nodeId: string, extra = '') =>
    `${here}${here.includes('?') ? '&' : '?'}task=${nodeId}${extra ? `&${extra}` : ''}`

  const index = selected ? pieces.findIndex((p) => p.id === selected.id) : -1
  const prev = index > 0 ? pieces[index - 1] : undefined
  const next = index >= 0 && index < pieces.length - 1 ? pieces[index + 1] : undefined

  /** The ancestors between the project and the subject, for climbing back up. */
  const trail = pathTo(nodes, id, subject.id).slice(1, -1)

  /*
   * Editing needs somewhere to move a node to, and how much would go with it if
   * it were deleted. Only worked out when a form is actually open.
   */
  const parentOptions: ParentOption[] = []
  let editDescendants = 0
  const editingNode = editId ? byId.get(editId) : undefined
  if (editingNode) {
    const excluded = new Set([editingNode.id, ...descendantsOf(editingNode.id)])
    editDescendants = excluded.size - 1
    const walk = (nodeId: string, depth: number) => {
      for (const k of childrenOf.get(nodeId) ?? []) {
        if (excluded.has(k.id)) continue
        parentOptions.push({ id: k.id, title: k.title, depth })
        walk(k.id, depth + 1)
      }
    }
    parentOptions.push({ id: project.id, title: project.title, depth: 0 })
    walk(project.id, 1)
  }

  const subjectProgress = progress.get(subject.id)
  const editing = resolveBlocker ? allBlockers.find((b) => b.id === resolveBlocker) : undefined

  const selectedReady = selected ? ready.get(selected.id) : undefined
  const selectedCost = selected ? cost.get(selected.id) : undefined

  return (
    <main>
      <div className="grid grid-cols-1 lg:min-h-screen lg:grid-cols-[340px_1fr]">
        {/* --- The pieces, always in view -------------------------------- */}
        <aside className="border-b border-rule lg:border-r lg:border-b-0">
          <div className="border-b border-rule-strong px-7 py-5">
            <div className="lbl flex flex-wrap items-baseline gap-x-2 gap-y-1 text-muted">
              <Link href={base} className="hover:text-ink">
                Project
              </Link>
              {trail.map((nodeId) => (
                <span key={nodeId} className="flex items-baseline gap-2">
                  <span className="text-rule-strong">&rsaquo;</span>
                  <Link
                    href={nodeId === id ? `${base}/meeting` : `${base}/meeting?focus=${nodeId}`}
                    className="hover:text-ink"
                  >
                    {byId.get(nodeId)?.title}
                  </Link>
                </span>
              ))}
            </div>

            <h1 className="mt-2 font-display text-[26px] font-medium leading-tight">
              {subject.title}
            </h1>
            <div className="mt-3 flex items-center gap-3">
              <ProgressScale
                done={subjectProgress?.leaf_done ?? 0}
                total={subjectProgress?.leaf_total ?? 0}
              />
              <span className="num text-[15px]">{subjectProgress?.progress_pct ?? 0} %</span>
            </div>
            <div className="mt-1.5 flex items-baseline justify-between gap-3">
              <span className="text-[11px] tabular-nums text-muted">
                {pieces.length} {pieces.length === 1 ? 'piece' : 'pieces'} ·{' '}
                {subjectProgress?.leaf_done ?? 0} of {subjectProgress?.leaf_total ?? 0} done
              </span>
              <Link
                href={creating === subject.id ? here : `${here}${here.includes('?') ? '&' : '?'}new=${subject.id}`}
                className="lbl-tight text-green hover:text-oxblood"
              >
                {creating === subject.id ? 'Close' : '+ Piece'}
              </Link>
            </div>
          </div>

          {creating === subject.id && (
            <div className="border-b border-rule px-5 py-4">
              <NodeForm
                parentId={subject.id}
                redirectTo={here}
                cancelHref={here}
              />
            </div>
          )}

          {pieces.length === 0 ? (
            <p className="px-7 py-6 text-[13px] text-muted">
              Nothing underneath yet. Add the first piece above.
            </p>
          ) : (
            <nav>
              {pieces.map((p, i) => {
                const mine = allBlockers.filter(
                  (b) => b.is_active && (b.node_id === p.id || descendantsOf(p.id).includes(b.node_id)),
                )
                const r = ready.get(p.id)
                const isOn = selected?.id === p.id
                return (
                  <Link
                    key={p.id}
                    href={at(p.id)}
                    className={`flex items-baseline gap-3 border-b border-rule px-7 py-3.5 ${
                      isOn ? 'bg-sheet' : 'hover:bg-sheet'
                    }`}
                  >
                    <span
                      className={`num w-6 shrink-0 text-[13px] ${
                        isOn ? 'text-ink' : 'text-rule-strong'
                      }`}
                    >
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <StatusMark
                      status={p.status}
                      blocked={state.get(p.id)?.is_blocked ?? false}
                    />
                    <span className="min-w-0 flex-1">
                      <span
                        className={`block text-[14px] leading-snug ${
                          isOn ? 'font-medium text-ink' : 'text-muted'
                        }`}
                      >
                        {p.title}
                      </span>
                      {(mine.length > 0 || (r && !r.is_ready)) && (
                        <span
                          className={`mt-0.5 block text-[10px] ${
                            mine.length > 0 || (r?.overdue_count ?? 0) > 0
                              ? 'text-oxblood'
                              : 'text-rule-strong'
                          }`}
                        >
                          {mine.length > 0
                            ? `${mine[0].days_blocked} days on ${mine[0].waiting_on}`
                            : (r?.overdue_count ?? 0) > 0
                              ? `held up by ${r?.overdue_count}`
                              : `waits on ${r?.waiting_on_count}`}
                        </span>
                      )}
                    </span>
                    {p.due_date && (
                      <span
                        className={`shrink-0 text-[10.5px] tabular-nums ${
                          p.due_date < today ? 'text-oxblood' : 'text-rule-strong'
                        }`}
                      >
                        {formatDate(p.due_date)}
                      </span>
                    )}
                  </Link>
                )
              })}
            </nav>
          )}
        </aside>

        {/* --- The piece under discussion -------------------------------- */}
        <section className="px-5 lg:px-12 py-8">
          {!selected ? (
            <p className="text-[15px] text-muted">
              Pick something on the left, or choose a different part above.
            </p>
          ) : (
            <>
              <div className="flex items-start justify-between gap-8">
                <div className="min-w-0">
                  <div className="lbl tabular-nums text-rule-strong">
                    {codes.get(selected.id)} &nbsp;·&nbsp; {TYPE_LABEL[selected.type]}
                  </div>
                  <h2 className="mt-1.5 font-display text-[40px] font-medium leading-[1.08] tracking-[-0.02em]">
                    {selected.title}
                  </h2>
                </div>

                <div className="flex shrink-0 items-center gap-5">
                  {prev && (
                    <Link href={at(prev.id)} className="lbl-tight text-muted hover:text-ink">
                      &larr; Prev
                    </Link>
                  )}
                  {next && (
                    <Link href={at(next.id)} className="lbl-tight text-muted hover:text-ink">
                      Next &rarr;
                    </Link>
                  )}
                  <Link
                    href={editId === selected.id ? at(selected.id) : at(selected.id, `edit=${selected.id}`)}
                    className={`lbl-tight ${
                      editId === selected.id ? 'text-green' : 'text-muted hover:text-ink'
                    }`}
                  >
                    {editId === selected.id ? 'Close' : 'Edit'}
                  </Link>
                  {(childrenOf.get(selected.id) ?? []).length > 0 && (
                    <Link
                      href={`${base}/meeting?focus=${selected.id}`}
                      className="lbl-tight text-green hover:text-oxblood"
                    >
                      Go into it &rarr;
                    </Link>
                  )}
                  <Link
                    href={`${base}?focus=${selected.id}`}
                    className="lbl-tight text-rule-strong hover:text-ink"
                  >
                    Open in tree
                  </Link>
                </div>
              </div>

              {editId === selected.id ? (
                <div className="mt-6">
                  <NodeForm
                    node={selected}
                    parentOptions={parentOptions}
                    descendantCount={editDescendants}
                    redirectTo={at(selected.id)}
                    cancelHref={at(selected.id)}
                  />
                </div>
              ) : (
                <Prose
                  text={selected.description}
                  className="mt-5 max-w-[760px] text-[16px] leading-[1.7]"
                />
              )}

              {/* What you change while talking */}
              <div className="mt-7 flex flex-wrap items-center gap-x-10 gap-y-4 border-y border-rule py-4">
                <StatusSelect
                  id={selected.id}
                  status={selected.status}
                  blocked={state.get(selected.id)?.is_blocked ?? false}
                  waitDays={state.get(selected.id)?.worst_wait ?? 0}
                />
                <Fact
                  label="Due"
                  value={selected.due_date ? formatDate(selected.due_date) : null}
                  note={
                    selected.due_date
                      ? relativeDays(daysBetween(today, selected.due_date))
                      : undefined
                  }
                  alarm={selected.due_date !== null && selected.due_date < today}
                />
                <Fact
                  label="Estimate"
                  value={
                    selected.estimate_low_days === null && selected.estimate_high_days === null
                      ? null
                      : `${selected.estimate_low_days ?? '?'} to ${selected.estimate_high_days ?? '?'} days`
                  }
                />
                <Fact label="Responsible" value={selected.owner} />
                <Fact
                  label="Priced"
                  value={
                    selectedCost && Number(selectedCost.once_priced) > 0
                      ? formatMoney(Number(selectedCost.once_priced), 'EUR')
                      : null
                  }
                  note={
                    selectedCost && Number(selectedCost.annual_priced) > 0
                      ? `plus ${formatMoney(Number(selectedCost.annual_priced), 'EUR')} a year`
                      : undefined
                  }
                />
                <span className="ml-auto flex items-center gap-4">
                  <QuickAddOn nodeId={selected.id} label="write a line" />
                  <Link
                    href={`${base}/cost?focus=${selected.id}`}
                    className="lbl-tight text-rule-strong hover:text-green"
                  >
                    price it
                  </Link>
                </span>
              </div>

              <WhichOne pricing />

              {selectedReady && !selectedReady.is_ready && (
                <div
                  className={`mt-4 text-[14px] ${
                    selectedReady.overdue_count > 0 ? 'text-oxblood' : 'text-muted'
                  }`}
                >
                  {selectedReady.overdue_count > 0
                    ? `Held up: ${selectedReady.overdue_count} predecessor past its own date.`
                    : `Waiting for ${selectedReady.waiting_on_count} to finish first. Nothing is late.`}
                  {deps.length > 0 && (
                    <span className="text-rule-strong">
                      {' '}
                      {deps
                        .filter((d) => inSelected.has(d.node_id))
                        .map((d) => byId.get(d.depends_on_id)?.title)
                        .filter(Boolean)
                        .join(', ')}
                    </span>
                  )}
                </div>
              )}

              <div className="mt-9 grid grid-cols-1 gap-y-9 lg:grid-cols-2 lg:gap-x-12 lg:gap-y-0">
                {/* Blockers */}
                <div>
                  <Head title="Blockers" action={{ href: at(selected.id, `bnew=${selected.id}`), label: 'New' }} />

                  {newBlocker === selected.id && (
                    <div className="mb-4">
                      <BlockerForm
                        nodeId={selected.id}
                        redirectTo={at(selected.id)}
                        cancelHref={at(selected.id)}
                      />
                    </div>
                  )}
                  {editing && (
                    <div className="mb-4">
                      <ResolveBlockerForm
                        blocker={editing}
                        redirectTo={at(selected.id)}
                        cancelHref={at(selected.id)}
                      />
                    </div>
                  )}

                  {blockers.length === 0 ? (
                    <p className="text-[13px] text-muted">None recorded.</p>
                  ) : (
                    blockers.map((b) => (
                      <div
                        key={b.id}
                        className={`flex items-baseline gap-3.5 border-t border-rule py-3 last:border-b ${
                          b.is_active ? '' : 'opacity-55'
                        }`}
                      >
                        <span
                          className={`num min-w-[40px] text-[24px] leading-none ${
                            b.is_active ? 'text-oxblood' : ''
                          }`}
                        >
                          {b.days_blocked}
                        </span>
                        <span className="flex-1">
                          <span className="block text-[13.5px] leading-snug">{b.title}</span>
                          <span className="mt-0.5 block text-[11px] text-muted">
                            {b.waiting_on}
                            {b.expected_by && <> · expected {formatDate(b.expected_by)}</>}
                          </span>
                        </span>
                        {b.is_active && (
                          <Link
                            href={at(selected.id, `bresolve=${b.id}`)}
                            className="lbl-tight text-green hover:text-oxblood"
                          >
                            Close
                          </Link>
                        )}
                      </div>
                    ))
                  )}
                </div>

                {/* Decisions */}
                <div>
                  <Head title="Decisions" action={{ href: at(selected.id, `dnew=${selected.id}`), label: 'New' }} />

                  {newDecision === selected.id && (
                    <div className="mb-4">
                      <DecisionForm
                        nodeId={selected.id}
                        redirectTo={at(selected.id)}
                        cancelHref={at(selected.id)}
                      />
                    </div>
                  )}

                  {decisions.length === 0 ? (
                    <p className="text-[13px] text-muted">
                      None yet. A meeting is where these happen.
                    </p>
                  ) : (
                    decisions.map((d) => (
                      <div key={d.id} className="border-t border-rule py-3 last:border-b">
                        <div className="flex items-baseline gap-2.5 text-[10px] tabular-nums text-muted">
                          {formatDate(d.decided_on)}
                          {d.topic !== 'other' && (
                            <span className="lbl-tight text-rule-strong">
                              {DECISION_TOPIC_LABEL[d.topic]}
                            </span>
                          )}
                        </div>
                        <div className="mt-1 text-[13.5px] leading-snug">{d.decision}</div>
                        {d.rationale && (
                          <p className="mt-1 text-[12px] leading-relaxed text-muted">
                            {d.rationale}
                          </p>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* The log, and what it has cost */}
              <div className="mt-9 grid grid-cols-1 gap-y-9 lg:grid-cols-2 lg:gap-x-12 lg:gap-y-0">
                <div>
                  <Head title="Log" />
                  {entries.length === 0 ? (
                    <p className="text-[13px] text-muted">
                      Nothing written here. Press Ctrl+K and it lands on this piece.
                    </p>
                  ) : (
                    entries.slice(0, 8).map((e) => (
                      <div key={e.id} className="border-t border-rule py-3 last:border-b">
                        <div className="text-[10px] tabular-nums text-muted">
                          {formatDate(e.entry_date)} · {byId.get(e.node_id)?.title}
                        </div>
                        <p className="mt-1 text-[13px] leading-relaxed">{e.body}</p>
                      </div>
                    ))
                  )}
                </div>

                <div>
                  <Head title="Cost" />
                  {lines.length === 0 ? (
                    <p className="text-[13px] text-muted">Nothing priced on this piece.</p>
                  ) : (
                    lines.map((l) => (
                      <div
                        key={l.id}
                        className="flex items-baseline gap-4 border-t border-rule py-3 last:border-b"
                      >
                        <span className="flex-1 text-[13px]">{l.description}</span>
                        <span className="lbl-tight text-rule-strong">
                          {COST_BUDGET_LABEL[l.budget]} · {COST_STATE_LABEL[l.state]}
                        </span>
                        <span className="num text-[14px]">
                          {formatMoney(Number(l.amount), l.currency)}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </>
          )}
        </section>
      </div>
    </main>
  )
}

function Head({
  title,
  action,
}: {
  title: string
  action?: { href: string; label: string }
}) {
  return (
    <div className="mb-2.5 flex items-baseline justify-between border-b border-rule-strong pb-1.5">
      <h3 className="lbl">{title}</h3>
      {action && (
        <Link href={action.href} className="lbl-tight text-green hover:text-oxblood">
          {action.label}
        </Link>
      )}
    </div>
  )
}

function Fact({
  label,
  value,
  note,
  alarm = false,
}: {
  label: string
  value: string | null
  note?: string
  alarm?: boolean
}) {
  return (
    <span className="flex flex-col">
      <span className="lbl-tight text-muted">{label}</span>
      <span className={`mt-0.5 text-[14px] tabular-nums ${alarm ? 'text-oxblood' : ''}`}>
        {value ?? <span className="text-rule-strong">not set</span>}
        {note && <span className="ml-2 text-[11px] text-muted">{note}</span>}
      </span>
    </span>
  )
}
