import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { QueryFailure, firstError } from '@/lib/failure'
import { formatMoney } from '@/lib/cost'
import { readIdentity } from '@/lib/identity'
import { NodeForm } from '@/components/node-form'
import { QuickAddTrigger } from '@/components/quick-add-trigger'
import { ProgressScale, Rule, StatusMark, formatDate } from '@/components/ui'
import {
  CATEGORY_LABEL,
  EFFECTIVE_STATUS_LABEL,
  type EffectiveStatus,
  type NodeCost,
  type NodeState,
  type ActiveBlocker,
  type NextDate,
  type Node,
  type NodeProgress,
} from '@/lib/types'

export const dynamic = 'force-dynamic'

type Filter = 'running' | 'closed' | 'all'

/**
 * The whole portfolio, closed projects included. Without this page a finished
 * project can only be reached by knowing its URL, and the history is lost in
 * practice.
 */
export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: Filter; new?: string }>
}) {
  const { filter = 'running', new: creating } = await searchParams
  const supabase = await createClient()

  const [nodeRes, progressRes, nextRes, blockerRes, descRes, stateRes, costRes] = await Promise.all([
    supabase.from('node').select('*').order('sort_order'),
    supabase.from('v_node_progress').select('*'),
    supabase.from('v_next_date').select('*'),
    supabase.from('v_active_blocker').select('*'),
    supabase.from('v_node_descendant').select('root_id, node_id'),
    supabase.from('v_node_state').select('*'),
    supabase.from('v_node_cost').select('*'),
  ])

  const failure = firstError([
    nodeRes,
    progressRes,
    nextRes,
    blockerRes,
    descRes,
    stateRes,
    costRes,
  ])
  if (failure) return <QueryFailure message={failure} />

  const nodes = (nodeRes.data ?? []) as Node[]
  const state = new Map(((stateRes.data ?? []) as NodeState[]).map((s) => [s.node_id, s]))

  // What the portfolio is committed to. Ordered and invoiced only: a quote you
  // have not accepted has not spent anything.
  const cost = new Map(((costRes.data ?? []) as NodeCost[]).map((c) => [c.node_id, c]))
  const progress = new Map(
    ((progressRes.data ?? []) as NodeProgress[]).map((p) => [p.node_id, p]),
  )
  const nextDates = new Map(
    ((nextRes.data ?? []) as NextDate[]).map((n) => [n.node_id, n]),
  )
  const blockers = (blockerRes.data ?? []) as ActiveBlocker[]
  const descendants = (descRes.data ?? []) as { root_id: string; node_id: string }[]

  const roots = nodes.filter((n) => n.parent_id === null)
  const rootIds = new Set(roots.map((n) => n.id))
  const projectOfNode = new Map<string, string>()
  for (const d of descendants) {
    if (rootIds.has(d.root_id)) projectOfNode.set(d.node_id, d.root_id)
  }
  const blockerCount = new Map<string, number>()
  for (const b of blockers) {
    const key = projectOfNode.get(b.node_id)
    if (key) blockerCount.set(key, (blockerCount.get(key) ?? 0) + 1)
  }

  const closed = (n: Node) => n.status === 'done' || n.status === 'cancelled'
  const shown =
    filter === 'running'
      ? roots.filter((n) => !closed(n))
      : filter === 'closed'
        ? roots.filter(closed)
        : roots

  /*
   * Grouped by the state a project is actually in, blocked included, so the
   * heading and the row can never disagree. The order is what needs someone
   * first, then what is live, then what has been put down.
   */
  const GROUPS: EffectiveStatus[] = [
    'blocked',
    'active',
    'paused',
    'planned',
    'idea',
    'done',
    'cancelled',
  ]

  const effective = (n: Node): EffectiveStatus =>
    state.get(n.id)?.status_effective ?? n.status

  const base = '/projects'
  const href = (f: Filter) => (f === 'running' ? base : `${base}?filter=${f}`)

  return (
    <main>
      <div className="frame">
        <div className="lbl pl-5 lg:pl-16 py-3 pr-5 text-muted">Portfolio</div>
        <div className="flex items-center gap-3.5 border-l border-rule px-5 lg:px-10 py-3">
          {(
            [
              ['running', 'RUNNING'],
              ['closed', 'CLOSED'],
              ['all', 'ALL'],
            ] as const
          ).map(([key, label], i) => (
            <span key={key} className="flex items-center gap-3.5">
              {i > 0 && <span className="text-rule">|</span>}
              <Link
                href={href(key)}
                className={`lbl ${filter === key ? 'text-ink' : 'text-muted hover:text-ink'}`}
              >
                {label}
              </Link>
            </span>
          ))}
        </div>
        <div className="flex items-center justify-end gap-6 border-l border-rule py-3 pl-5 lg:pl-8 pr-5 lg:pr-16">
          <Link href={`${base}?new=root`} className="lbl text-muted hover:text-ink">
            New project
          </Link>
          <QuickAddTrigger />
        </div>
      </div>
      <Rule strong />

      {creating === 'root' && (
        <NodeForm parentId={null} redirectTo={base} cancelHref={href(filter)} />
      )}

      <div className="frame-pair min-h-[60vh]">
        <div className="pl-5 lg:pl-16 py-8 pr-5">
          <h1 className="font-display text-[30px] font-medium leading-[1.06] tracking-[-0.01em]">
            Projects
          </h1>
          <div className="mt-4 text-[11px] leading-relaxed text-muted">
            {roots.filter((n) => !closed(n)).length} running
            <br />
            {roots.filter(closed).length} closed
          </div>
        </div>

        <div className="border-l border-rule py-8 pl-10 pr-5 lg:pr-16">
          {shown.length === 0 ? (
            <p className="text-sm text-muted">No projects in this selection.</p>
          ) : (
            <div>
              <div className="hidden grid-cols-[1fr_150px_120px_92px_86px] items-baseline border-b border-rule-strong pb-2 lg:grid">
                <span className="lbl text-muted">Project</span>
                <span className="lbl text-muted">Progress</span>
                <span className="lbl text-right text-muted">Committed</span>
                <span className="lbl text-right text-muted">Next</span>
                <span className="lbl text-right text-muted">Blocked</span>
              </div>

              {GROUPS.map((group) => {
                const members = shown.filter((p) => effective(p) === group)
                if (members.length === 0) return null

                return (
                  <section key={group}>
                    {/* The status lives in the heading, so the rows stop repeating it. */}
                    <div className="mt-7 flex items-center gap-2.5 border-b border-rule pb-1.5">
                      <StatusMark
                        status={group === 'blocked' ? 'active' : group}
                        blocked={group === 'blocked'}
                      />
                      <span
                        className={`lbl ${group === 'blocked' ? 'text-oxblood' : 'text-ink'}`}
                      >
                        {EFFECTIVE_STATUS_LABEL[group]}
                      </span>
                      <span className="lbl-tight tabular-nums text-rule-strong">
                        {members.length}
                      </span>
                    </div>

                    {members.map((p) => {
                      const prog = progress.get(p.id)
                      const next = nextDates.get(p.id)
                      const open = blockerCount.get(p.id) ?? 0

                      return (
                        <div
                          key={p.id}
                          className="grid grid-cols-1 gap-y-3 border-b border-rule py-3.5 lg:grid-cols-[1fr_150px_120px_92px_86px] lg:items-center lg:gap-y-0"
                        >
                          <div className="lg:pr-6">
                            <Link
                              href={`/p/${p.id}`}
                              className={`text-[15px] hover:text-green ${
                                closed(p) ? 'text-muted' : ''
                              }`}
                            >
                              {p.title}
                            </Link>
                            <div className="mt-0.5 text-[10px] uppercase tracking-[0.14em] text-muted">
                              {p.category ? CATEGORY_LABEL[p.category] : 'No category'}
                              {/*
                                An absent number is the signal, not a blank.
                                It means the work exists here and has not been
                                registered in the company system, which is a
                                thing a project manager is asked about.
                              */}
                              {typeof p.reporting?.project_no === 'string' &&
                              p.reporting.project_no !== '' ? (
                                <> · {p.reporting.project_no}</>
                              ) : (
                                <span className="text-oxblood"> · not registered</span>
                              )}
                            </div>
                          </div>

                          {/*
                            The four measures. Their own line under the title on a
                            phone, each carrying the label the header would have given
                            it. `contents` at desk width, so the five column grid lays
                            them out exactly as it did before.
                          */}
                          <div className="flex flex-wrap items-baseline gap-x-7 gap-y-2 lg:contents">
                            <div className="flex items-center gap-3 lg:pr-6">
                              <span className="lbl-tight text-muted lg:hidden">Progress</span>
                              <ProgressScale
                              done={prog?.leaf_done ?? 0}
                              total={prog?.leaf_total ?? 0}
                            />
                            <span className="num min-w-[42px] text-right text-[15px]">
                              {prog?.progress_pct ?? 0} %
                            </span>
                          </div>

                          <div className="text-[11px] tabular-nums text-muted lg:text-right">
                            <span className="lbl-tight mr-2 lg:hidden">Committed</span>
                            {(() => {
                              const c = cost.get(p.id)
                              if (!c || Number(c.once_committed) === 0) {
                                return <span className="text-rule-strong">-</span>
                              }
                              return (
                                <>
                                  {formatMoney(
                                    Number(c.once_committed),
                                    readIdentity(p.reporting).economics.currency,
                                  )}
                                  {Number(c.annual_priced) > 0 && (
                                    <span className="block text-[10px] text-rule-strong">
                                      +{' '}
                                      {formatMoney(
                                        Number(c.annual_priced),
                                        readIdentity(p.reporting).economics.currency,
                                      )}{' '}
                                      a year
                                    </span>
                                  )}
                                </>
                              )
                            })()}
                          </div>

                          <div
                            className={`text-[11px] tabular-nums lg:text-right ${
                              next && next.days_until < 0 ? 'text-oxblood' : 'text-muted'
                            }`}
                          >
                            <span className="lbl-tight mr-2 text-muted lg:hidden">Next</span>
                            {next ? formatDate(next.due_date) : '-'}
                          </div>

                          <div
                            className={`num flex items-baseline gap-2 text-[17px] lg:block lg:text-right ${
                              open > 0 ? 'text-oxblood' : 'text-rule-strong'
                            }`}
                          >
                            <span className="lbl-tight text-muted lg:hidden">Blocked</span>
                            {open > 0 ? open : '-'}
                          </div>
                          </div>
                        </div>
                      )
                    })}
                  </section>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
