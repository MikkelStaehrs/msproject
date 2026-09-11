import Link from 'next/link'
import { today as todayIso } from '@/lib/date'
import { createClient } from '@/lib/supabase/server'
import { QueryFailure, firstError } from '@/lib/failure'
import { NodeForm } from '@/components/node-form'
import { QuickAddTrigger } from '@/components/quick-add-trigger'
import { QuickAddOn } from '@/components/quick-add-on'
import { looseEnds } from '@/lib/loose-ends'
import {
  ProgressRow,
  Rule,
  StatusMark,
  formatDate,
  relativeDays,
} from '@/components/ui'
import {
  EFFECTIVE_STATUS_LABEL,
  type NodeState,
  type ActiveBlocker,
  type NextDate,
  type Node,
  type NodeProgress,
} from '@/lib/types'

export const dynamic = 'force-dynamic'

const today = new Intl.DateTimeFormat('en-GB', {
  weekday: 'long',
  day: 'numeric',
  month: 'short',
})

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string }>
}) {
  const { new: creating } = await searchParams
  const supabase = await createClient()

  const [
    nodesRes, progressRes, nextDateRes, blockerRes, descendantRes, stateRes,
    entryRes, allBlockerRes, decisionRes,
  ] = await Promise.all([
      supabase.from('node').select('*').order('sort_order'),
      supabase.from('v_node_progress').select('*'),
      supabase.from('v_next_date').select('*'),
      supabase.from('v_active_blocker').select('*'),
      supabase.from('v_node_descendant').select('root_id, node_id'),
      supabase.from('v_node_state').select('*'),
      supabase.from('entry').select('node_id, entry_date'),
      supabase.from('blocker').select('node_id, title, waiting_on, opened_at, resolved_at'),
      supabase.from('decision').select('node_id'),
    ])

  const failure = firstError([
    nodesRes, progressRes, nextDateRes, blockerRes, descendantRes, stateRes,
    entryRes, allBlockerRes, decisionRes,
  ])
  if (failure) return <QueryFailure message={failure} />

  const nodes = (nodesRes.data ?? []) as Node[]
  const progress = new Map(
    ((progressRes.data ?? []) as NodeProgress[]).map((p) => [p.node_id, p]),
  )
  const nextDates = new Map(
    ((nextDateRes.data ?? []) as NextDate[]).map((n) => [n.node_id, n]),
  )
  const blockers = (blockerRes.data ?? []) as ActiveBlocker[]
  const state = new Map(((stateRes.data ?? []) as NodeState[]).map((s) => [s.node_id, s]))

  // What happened that you have not written a line about. Derived, so it
  // disappears by being answered rather than by being dismissed.
  const loose = looseEnds({
    nodes: nodes.map((n) => ({
      id: n.id,
      title: n.title,
      type: n.type,
      status: n.status,
      due_date: n.due_date,
      completed_at: n.completed_at,
    })),
    entries: (entryRes.data ?? []) as { node_id: string; entry_date: string }[],
    blockers: (allBlockerRes.data ?? []) as {
      node_id: string
      title: string
      waiting_on: string
      opened_at: string
      resolved_at: string | null
    }[],
    decisions: (decisionRes.data ?? []) as { node_id: string }[],
    today: todayIso(),
  })
  const descendants = (descendantRes.data ?? []) as {
    root_id: string
    node_id: string
  }[]

  const byId = new Map(nodes.map((n) => [n.id, n]))
  const roots = nodes.filter((n) => n.parent_id === null)
  const rootIds = new Set(roots.map((n) => n.id))

  // Which top level project does a node belong to?
  const projectOfNode = new Map<string, string>()
  for (const d of descendants) {
    if (rootIds.has(d.root_id)) projectOfNode.set(d.node_id, d.root_id)
  }

  const blockersByProject = new Map<string, ActiveBlocker[]>()
  for (const b of blockers) {
    const key = projectOfNode.get(b.node_id) ?? b.node_id
    blockersByProject.set(key, [...(blockersByProject.get(key) ?? []), b])
  }

  const openRoots = roots.filter(
    (n) => n.status !== 'done' && n.status !== 'cancelled',
  )

  const waitDays = blockers.reduce((sum, b) => sum + b.days_blocked, 0)

  // Next steps: every dated, unfinished node across all projects.
  const upcoming = nodes
    .filter(
      (n) =>
        n.due_date !== null &&
        n.completed_at === null &&
        n.status !== 'done' &&
        n.status !== 'cancelled' &&
        n.parent_id !== null,
    )
    .sort((a, b) => (a.due_date! < b.due_date! ? -1 : 1))
    .slice(0, 7)

  return (
    <main>
      {/* Context band */}
      <div className="frame">
        <div className="lbl pl-5 lg:pl-16 py-3 pr-5 text-muted">
          {today.format(new Date())}
        </div>
        <div className="lbl border-l border-rule px-5 lg:px-10 py-3 text-muted">
          {openRoots.length} running projects · {blockers.length} open blockers ·{' '}
          {waitDays} waiting days
        </div>
        <div className="flex items-center justify-end gap-6 border-l border-rule py-3 pl-5 lg:pl-8 pr-5 lg:pr-16">
          <Link href="/?new=root" className="lbl text-muted hover:text-ink">
            New project
          </Link>
          <QuickAddTrigger />
        </div>
      </div>
      <Rule strong />

      {creating === 'root' && (
        <NodeForm parentId={null} redirectTo="/" cancelHref="/" />
      )}

      <div className="frame min-h-[70vh]">
        {/* Left label column */}
        <div className="pl-5 lg:pl-16 py-8 pr-5">
          <h1 className="font-display text-[30px] font-medium leading-[1.06] tracking-[-0.01em]">
            Over&shy;view
          </h1>
        </div>

        {/* Projects */}
        <div className="border-l border-rule">
          {openRoots.length === 0 && (
            <p className="px-5 lg:px-10 py-8 text-sm text-muted">
              No projects running. Create the first one with New project.
            </p>
          )}

          {openRoots.map((project, i) => {
            const p = progress.get(project.id)
            const next = nextDates.get(project.id)
            const open = blockersByProject.get(project.id) ?? []

            return (
              <article
                key={project.id}
                className={`px-5 lg:px-10 py-7 ${i > 0 ? 'border-t border-rule' : ''}`}
              >
                <div className="flex items-baseline justify-between gap-5">
                  <div className="lbl text-muted">
                    {typeof project.reporting?.project_no === 'string' && (
                      <> &nbsp;·&nbsp; {project.reporting.project_no}</>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusMark
                      status={project.status}
                      blocked={state.get(project.id)?.is_blocked ?? false}
                    />
                    <span className="lbl-tight">
                      {EFFECTIVE_STATUS_LABEL[
                        state.get(project.id)?.status_effective ?? project.status
                      ]}
                    </span>
                  </div>
                </div>

                <h2 className="mt-2">
                  <Link
                    href={`/p/${project.id}`}
                    className="font-display text-[27px] font-medium leading-[1.15] hover:text-green"
                  >
                    {project.title}
                  </Link>
                </h2>

                <div className="mt-5">
                  <ProgressRow
                    done={p?.leaf_done ?? 0}
                    total={p?.leaf_total ?? 0}
                    pct={p?.progress_pct ?? 0}
                  />
                </div>

                <dl className="mt-5 grid grid-cols-[128px_1fr]">
                  <dt className="lbl-tight border-t border-rule py-3 text-muted">
                    Next date
                  </dt>
                  <dd className="border-t border-rule py-3 text-[13px]">
                    {next ? (
                      <>
                        {next.title}{' '}
                        <span
                          className={next.days_until < 0 ? 'text-oxblood' : 'text-muted'}
                        >
                          · {formatDate(next.due_date)} · {relativeDays(next.days_until)}
                        </span>
                      </>
                    ) : (
                      <span className="text-rule-strong">No dated task</span>
                    )}
                  </dd>

                  <dt className="lbl-tight border-t border-rule py-3 text-muted">
                    Blockers
                  </dt>
                  <dd className="border-t border-rule py-3 text-[13px] leading-relaxed">
                    {open.length === 0 ? (
                      <span className="text-muted">None active.</span>
                    ) : (
                      open.map((b) => (
                        <div key={b.id}>
                          <span className="font-medium tabular-nums text-oxblood">
                            {b.days_blocked} days
                          </span>{' '}
                          waiting on {b.waiting_on}, {b.title}
                          {byId.get(b.node_id)?.id !== project.id && (
                            <span className="text-muted">
                              {' '}
                              ({byId.get(b.node_id)?.title})
                            </span>
                          )}
                        </div>
                      ))
                    )}
                  </dd>
                </dl>
              </article>
            )
          })}
        </div>

        {/* Right column */}
        <div className="border-l border-rule">
          {loose.length > 0 && (
            <>
              <section className="py-8 pl-5 lg:pl-8 pr-5 lg:pr-16">
                <div className="flex items-baseline justify-between gap-4">
                  <h2 className="font-display text-[26px] font-medium">Loose ends</h2>
                  <span className="lbl-tight tabular-nums text-rule-strong">
                    {loose.length}
                  </span>
                </div>
                <p className="mt-1.5 text-[11px] leading-relaxed text-muted">
                  Things that happened without a line about them. Writing one makes it go
                  away.
                </p>

                <div className="mt-4">
                  {loose.slice(0, 8).map((l) => (
                    <div
                      key={`${l.nodeId}-${l.kind}-${l.on}`}
                      className="border-t border-rule py-3 last:border-b"
                    >
                      <div className="flex items-baseline gap-3">
                        <span className="min-w-[52px] shrink-0 text-[10px] tabular-nums text-muted">
                          {formatDate(l.on)}
                        </span>
                        <span className="flex-1 text-[12.5px] leading-snug">{l.what}</span>
                        {/*
                          The one loose end whose answer is not a log line. A
                          decision belongs on Basis, so that is where the link
                          goes rather than into the entry box.
                        */}
                        {l.kind === 'undecided' ? (
                          <Link
                            href={`/p/${projectOfNode.get(l.nodeId) ?? l.nodeId}/grundlag?focus=${l.nodeId}`}
                            className="lbl-tight shrink-0 text-rule-strong hover:text-ink"
                          >
                            Basis
                          </Link>
                        ) : (
                          <QuickAddOn nodeId={l.nodeId} />
                        )}
                      </div>
                      <p className="ml-[64px] mt-1 text-[11px] leading-snug text-rule-strong">
                        {l.prompt}
                      </p>
                    </div>
                  ))}
                  {loose.length > 8 && (
                    <p className="mt-3 text-[11px] text-rule-strong">
                      and {loose.length - 8} more
                    </p>
                  )}
                </div>
              </section>
              <Rule />
            </>
          )}

          <section className="py-8 pl-5 lg:pl-8 pr-5 lg:pr-16">
            <h2 className="font-display text-[26px] font-medium">Open blockers</h2>
            {blockers.length === 0 ? (
              <p className="mt-4 text-[13px] text-muted">None. Rare, but pleasant.</p>
            ) : (
              <div className="mt-4">
                {[...blockers]
                  .sort((a, b) => b.days_blocked - a.days_blocked)
                  .map((b) => (
                    <div
                      key={b.id}
                      className="flex items-baseline gap-3.5 border-t border-rule py-3 last:border-b"
                    >
                      <div
                        className={`num min-w-[44px] text-[30px] leading-none ${
                          b.overdue ? 'text-oxblood' : 'text-ink'
                        }`}
                      >
                        {b.days_blocked}
                      </div>
                      <div className="flex-1">
                        <div className="text-[13px] leading-snug">{b.title}</div>
                        <div className="mt-0.5 text-[11px] text-muted">
                          {b.waiting_on}
                          {b.expected_by && (
                            <>
                              {' '}
                              · expected {formatDate(b.expected_by)}
                              {b.overdue && (
                                <span className="text-oxblood"> · overdue</span>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </section>
          <Rule />

          <section className="py-7 pl-5 lg:pl-8 pr-5 lg:pr-16">
            <h2 className="font-display text-[26px] font-medium">Next steps</h2>
            <div className="mt-3.5">
              {upcoming.map((n) => {
                const overdue = n.due_date! < todayIso()
                return (
                  <div
                    key={n.id}
                    className="flex gap-4 border-t border-rule py-2.5 last:border-b"
                  >
                    <div
                      className={`min-w-[58px] text-[11px] tabular-nums ${
                        overdue ? 'text-oxblood' : 'text-muted'
                      }`}
                    >
                      {formatDate(n.due_date!)}
                    </div>
                    <Link
                      href={`/p/${projectOfNode.get(n.id) ?? n.id}`}
                      className="flex-1 text-[12.5px] hover:text-green"
                    >
                      {n.title}
                    </Link>
                  </div>
                )
              })}
            </div>
          </section>
        </div>
      </div>
    </main>
  )
}
