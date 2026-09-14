import Link from 'next/link'
import {
  costPicture,
  formatMoney,
  payback as paybackOf,
  unpricedShare,
} from '@/lib/cost'
import { today } from '@/lib/date'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { QueryFailure, firstError } from '@/lib/failure'
import { subtreeSet } from '@/lib/subtree'
import {
  PEOPLE_FIELDS,
  PID_FIELDS,
  approvalVariance,
  formatAmount,
  formatYears,
  readIdentity,
  splitList,
} from '@/lib/identity'
import { readStage } from '@/lib/report'
import { ProgressScale, Prose, Rule, formatDate, formatDateLong } from '@/components/ui'
import {
  DECISION_TOPICS,
  DECISION_TOPIC_LABEL,
  EFFECTIVE_STATUS_LABEL,
  type NodeState,
  type Blocker,
  type Decision,
  type Node,
  type NodeDependency,
  type NodeProgress,
  type NodeCost,
} from '@/lib/types'

export const dynamic = 'force-dynamic'

/**
 * The brief. Everything that frames the project, laid out to be read by
 * someone who was not in the room: printable, read only, no controls.
 * The map shows the structure; this shows the reasoning.
 */

function Block({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="break-inside-avoid border-t border-rule pt-3">
      <div className="lbl text-muted">{label}</div>
      <div className="mt-1.5 text-[13px] leading-relaxed text-pretty">{children}</div>
    </div>
  )
}

function Line({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-3 border-t border-rule py-2">
      <span className="lbl w-[132px] shrink-0 text-muted">{label}</span>
      <span className="flex-1 text-[12.5px]">{value}</span>
    </div>
  )
}

export default async function BriefPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  /*
   * One round trip. Asking which nodes sit underneath and only then filtering
   * by the answer costs a second wait for nothing at this size.
   */
  const [
    projectRes,
    progressRes,
    milestoneRes,
    blockerRes,
    decisionRes,
    depsRes,
    projectsRes,
    partsRes,
    stateRes,
    costRollRes,
    treeRes,
  ] = await Promise.all([
      supabase.from('node').select('*').eq('id', id).single(),
      supabase.from('v_node_progress').select('*').eq('node_id', id).maybeSingle(),
      supabase
        .from('node')
        .select('id, title, due_date, status')
        
        .eq('is_milestone', true)
        .order('due_date'),
      supabase.from('blocker').select('*'),
      supabase
        .from('decision')
        .select('*')
        
        .order('decided_on', { ascending: false }),
      supabase.from('node_dependency').select('*').eq('node_id', id),
      supabase.from('node').select('id, title').is('parent_id', null),
      supabase
        .from('node')
        .select('id, title, type, reporting')
        
        .neq('id', id)
        .order('sort_order'),
      supabase.from('v_node_state').select('*'),
      supabase.from('v_node_cost').select('*').eq('node_id', id).maybeSingle(),
      supabase.from('node').select('id, parent_id'),
    ])

  /*
   * The brief is the copy handed to somebody who was not in the room, and it is
   * printed. A section that silently comes out empty is not caught by the
   * reader, who has no way of knowing it should have said anything.
   */
  const failure = firstError([
    milestoneRes,
    blockerRes,
    decisionRes,
    depsRes,
    projectsRes,
    partsRes,
    stateRes,
    treeRes,
  ])
  if (failure) return <QueryFailure message={failure} />

  const project = projectRes.data as Node | null
  if (!project) notFound()

  const state = new Map(((stateRes.data ?? []) as NodeState[]).map((s) => [s.node_id, s]))

  const identity = readIdentity(project.reporting)
  const stage = readStage(project.reporting)
  const progress = progressRes.data as NodeProgress | null
  // Fetched whole, cut here. See lib/subtree.
  const inProject = subtreeSet(
    (treeRes.data ?? []) as { id: string; parent_id: string | null }[],
    id,
  )

  const milestones = ((milestoneRes.data ?? []) as Pick<
    Node,
    'id' | 'title' | 'due_date' | 'status'
  >[]).filter((m) => inProject.has(m.id))
  const blockers = ((blockerRes.data ?? []) as Blocker[]).filter((b) =>
    inProject.has(b.node_id),
  )
  const decisions = ((decisionRes.data ?? []) as Decision[]).filter((d) =>
    inProject.has(d.node_id),
  )
  const deps = (depsRes.data ?? []) as NodeDependency[]
  const projectTitle = new Map(
    ((projectsRes.data ?? []) as { id: string; title: string }[]).map((p) => [p.id, p.title]),
  )

  const costRoll = costRollRes.data as NodeCost | null
  /*
   * The money, laid out for someone who was not in the room. This is the page
   * that goes across a desk, and «paid back in 3.5 years» without saying what
   * it costs is half an answer.
   */
  const money: NodeCost = costRoll ?? {
    node_id: id,
    once_estimated: 0, once_quoted: 0, once_ordered: 0, once_invoiced: 0,
    once_committed: 0, once_priced: 0, once_with_paper: 0,
    annual_committed: 0, annual_priced: 0,
    capex_once_priced: 0, capex_once_committed: 0, capex_annual_priced: 0,
    opex_once_priced: 0, opex_once_committed: 0,
    opex_annual_priced: 0, opex_annual_committed: 0,
    once_items: 0, annual_items: 0, items: 0,
  }
  const picture = costPicture({
    roll: money,
    approved: identity.approval.amount,
    planned: identity.economics.cost,
  })
  const share = unpricedShare(picture)

  const payback = paybackOf({
    investment: identity.economics.cost,
    annualBenefit: identity.economics.benefit,
    annualRunning: Number(costRoll?.opex_annual_priced ?? 0),
  })
  const variance = approvalVariance(identity.approval, identity.economics)
  const goal = identity.pid.goal
  const body = PID_FIELDS.filter((f) => f.key !== 'goal' && identity.pid[f.key])
  const people = PEOPLE_FIELDS.filter((f) => identity.people[f.key])
  /*
   * Parts that carry their own roles. A subproject run by someone other than
   * the project lead is exactly what a handover document has to say out loud.
   */
  const parts = ((partsRes.data ?? []) as {
    id: string
    title: string
    type: string
    reporting: Record<string, unknown> | null
  }[])
    .filter((n) => inProject.has(n.id))
    .map((n) => ({
      title: n.title,
      roles: PEOPLE_FIELDS.map((f) => ({
        label: f.label,
        value: ((n.reporting?.people ?? {}) as Record<string, string>)[f.key],
      })).filter((r) => r.value),
    }))
    .filter((n) => n.roles.length > 0)

  const dependsOnPeople = [
    ...new Set([
      ...blockers.map((b) => b.waiting_on),
      ...(project.owner ? [project.owner] : []),
      ...splitList(identity.people.stakeholders),
    ]),
  ]

  return (
    <main className="print-sheet page-brief">
      <div className="no-print frame">
        <div className="lbl pl-5 lg:pl-16 py-3 pr-5 text-muted">Brief</div>
        <div className="lbl border-l border-rule px-5 lg:px-10 py-3 text-muted">
          Read only. Print with Ctrl+P.
        </div>
        <div className="flex items-center justify-end gap-6 border-l border-rule py-3 pl-5 lg:pl-8 pr-5 lg:pr-16">
          <Link href={`/p/${id}/map`} className="lbl text-muted hover:text-ink">
            Map
          </Link>
          <Link href={`/p/${id}`} className="lbl text-muted hover:text-ink">
            Back to the project
          </Link>
        </div>
      </div>
      <div className="no-print">
        <Rule strong />
      </div>

      <article
        /*
         * An actual A4 page: 794 px is A4 at 96 dpi, and the 52 px padding is
         * the 14 mm margin the @page rule uses, so what is on screen is what
         * comes out of Ctrl+P. The old 880 px was wider than the paper and
         * printed clipped on the right.
         */
        className="mx-auto max-w-[794px] px-5 lg:px-[52px] pb-16 pt-12 print:max-w-none print:p-0"
      >
        {/* Head */}
        <div className="lbl text-muted">
          {identity.admin.project_no && <> &nbsp;·&nbsp; {identity.admin.project_no}</>}
          {identity.admin.portfolio && <> &nbsp;·&nbsp; {identity.admin.portfolio}</>}
        </div>

        <h1 className="mt-2 font-display text-[44px] font-medium leading-[1.06] tracking-[-0.02em]">
          {project.title}
        </h1>

        {/* Printed. Nothing is folded away on paper. */}
        <Prose
          text={project.description}
          className="mt-4 max-w-[640px] text-[14px] text-pretty"
        />

        {goal && (
          <div className="mt-7 border-y border-rule-strong py-5">
            <div className="lbl text-muted">Goal</div>
            <p className="mt-2 max-w-[640px] text-[15px] leading-relaxed text-pretty">
              {goal}
            </p>
          </div>
        )}

        {/* Framing */}
        <section className="mt-9">
          <h2 className="font-display text-[22px] font-medium">Framing</h2>
          <div className="mt-3">
            <Line
              label="Status"
              value={
                <>
                  {EFFECTIVE_STATUS_LABEL[state.get(project.id)?.status_effective ?? project.status]}
                  {stage && <span className="text-muted"> · {stage}</span>}
                </>
              }
            />
            <Line
              label="Period"
              value={
                <span className="tabular-nums">
                  {project.start_date ? formatDateLong(project.start_date) : 'no start date'}
                  {' to '}
                  {project.due_date ? formatDateLong(project.due_date) : 'no deadline'}
                </span>
              }
            />
            <Line
              label="Progress"
              value={
                <span className="flex items-center gap-3">
                  <span className="w-[160px]">
                    <ProgressScale
                      done={progress?.leaf_done ?? 0}
                      total={progress?.leaf_total ?? 0}
                    />
                  </span>
                  <span className="num text-[16px]">{progress?.progress_pct ?? 0} %</span>
                  <span className="text-[11px] tabular-nums text-muted">
                    {progress?.leaf_done ?? 0} of {progress?.leaf_total ?? 0} leaves
                  </span>
                </span>
              }
            />
            {identity.location && <Line label="Location" value={identity.location} />}
            {project.owner && <Line label="Responsible" value={project.owner} />}
            {identity.admin.account && (
              <Line label="Account string" value={identity.admin.account} />
            )}
          </div>
        </section>

        {/* People */}
        {people.length > 0 && (
          <section className="mt-9">
            <h2 className="font-display text-[22px] font-medium">People</h2>
            <div className="mt-3">
              {people.map((f) => (
                <Line key={f.key} label={f.label} value={identity.people[f.key]} />
              ))}
            </div>
          </section>
        )}

        {parts.length > 0 && (
          <section className="mt-9">
            <h2 className="font-display text-[22px] font-medium">Roles by part</h2>
            <div className="mt-3">
              {parts.map((n) => (
                <div
                  key={n.title}
                  className="break-inside-avoid border-t border-rule py-2.5"
                >
                  <div className="text-[13px]">{n.title}</div>
                  <div className="mt-1 flex flex-wrap gap-x-5 gap-y-1 text-[11.5px] text-muted">
                    {n.roles.map((r) => (
                      <span key={r.label}>
                        <span className="lbl-tight">{r.label}</span> {r.value}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Economics */}
        {(identity.economics.cost !== null ||
          identity.economics.benefit !== null ||
          identity.approval.state !== 'Not applied' ||
          money.items > 0) && (
          <section className="mt-9">
            <h2 className="font-display text-[22px] font-medium">Economics</h2>
            <div className="mt-3">
              {identity.economics.cost !== null && (
                <Line
                  label="Cost"
                  value={
                    <span className="tabular-nums">
                      {formatAmount(identity.economics.cost, identity.economics.currency)}
                    </span>
                  }
                />
              )}
              {identity.economics.benefit !== null && (
                <Line
                  label="Benefit per year"
                  value={
                    <span className="tabular-nums">
                      {formatAmount(identity.economics.benefit, identity.economics.currency)}
                    </span>
                  }
                />
              )}
              {money.once_items > 0 && (
                <Line
                  label="Priced so far"
                  value={
                    <>
                      <span className="tabular-nums">
                        {formatMoney(Number(money.once_priced), identity.economics.currency)}
                      </span>
                      <span className="text-muted">
                        {' '}
                        · {money.once_items} lines ·{' '}
                        {formatMoney(
                          Number(money.once_committed),
                          identity.economics.currency,
                        )}{' '}
                        committed ·{' '}
                        {formatMoney(
                          Number(money.once_with_paper),
                          identity.economics.currency,
                        )}{' '}
                        with a document behind it
                      </span>
                    </>
                  }
                />
              )}
              {picture.unpriced !== null && picture.unpriced > 0 && (
                <Line
                  label="Not priced yet"
                  value={
                    <>
                      <span className="tabular-nums">
                        {formatMoney(picture.unpriced, identity.economics.currency)}
                      </span>
                      {share !== null && (
                        <span className="text-muted">
                          {' '}
                          · {share} per cent of the plan is still a guess
                        </span>
                      )}
                    </>
                  }
                />
              )}
              {picture.over !== null && (
                <Line
                  label="Over the plan"
                  value={
                    <span className="tabular-nums text-oxblood">
                      {formatMoney(picture.over, identity.economics.currency)}
                    </span>
                  }
                />
              )}
              {money.annual_items > 0 && (
                <Line
                  label="Running cost"
                  value={
                    <>
                      <span className="tabular-nums">
                        {formatMoney(
                          Number(money.annual_priced),
                          identity.economics.currency,
                        )}
                      </span>
                      <span className="text-muted"> a year</span>
                    </>
                  }
                />
              )}
              {payback !== null && (
                <Line
                  label="Payback"
                  value={
                    <>
                      <span className="num text-[16px]">{formatYears(payback)}</span>
                      {money.annual_priced > 0 && (
                        <span className="text-muted">
                          {' '}
                          · after the running cost
                        </span>
                      )}
                    </>
                  }
                />
              )}
              {payback === null &&
                identity.economics.cost !== null &&
                identity.economics.benefit !== null &&
                money.annual_priced >= identity.economics.benefit && (
                  <Line
                    label="Payback"
                    value={
                      <span className="text-oxblood">
                        Never. The running cost is at or above the yearly benefit
                      </span>
                    }
                  />
                )}
              <Line
                label="Grant"
                value={
                  <>
                    {identity.approval.state}
                    {identity.approval.amount !== null && (
                      <span className="tabular-nums">
                        {' '}
                        ·{' '}
                        {formatAmount(
                          identity.approval.amount,
                          identity.economics.currency,
                        )}
                      </span>
                    )}
                    {identity.approval.decided_on && (
                      <span className="text-muted">
                        {' '}
                        · {formatDateLong(identity.approval.decided_on)}
                      </span>
                    )}
                    {identity.approval.by && (
                      <span className="text-muted"> · {identity.approval.by}</span>
                    )}
                    {variance !== null && variance < 0 && (
                      <span className="text-oxblood">
                        {' '}
                        · estimate is{' '}
                        {formatAmount(-variance, identity.economics.currency)} above the
                        grant
                      </span>
                    )}
                  </>
                }
              />
            </div>
          </section>
        )}

        {/* The written half of the PID */}
        {body.length > 0 && (
          <section className="mt-10">
            <h2 className="font-display text-[22px] font-medium">Project basis</h2>
            <div className="mt-4 flex flex-col gap-5">
              {body.map((f) => (
                <Block key={f.key} label={f.label}>
                  <span className="block max-w-[640px] whitespace-pre-line">
                    {identity.pid[f.key]}
                  </span>
                </Block>
              ))}
            </div>
          </section>
        )}

        {/* Derived */}
        <section className="mt-10">
          <h2 className="font-display text-[22px] font-medium">Milestones</h2>
          <div className="mt-3">
            {milestones.length === 0 ? (
              <p className="border-t border-rule py-2.5 text-[12.5px] text-muted">
                No nodes are marked as milestones.
              </p>
            ) : (
              milestones.map((m) => (
                <div
                  key={m.id}
                  className="flex items-baseline gap-4 border-t border-rule py-2.5"
                >
                  <span className="w-[132px] shrink-0 text-[11.5px] tabular-nums text-muted">
                    {m.due_date ? formatDateLong(m.due_date) : 'no date'}
                  </span>
                  <span
                    className={`flex-1 text-[13px] ${
                      m.status === 'done' ? 'text-muted line-through decoration-rule' : ''
                    }`}
                  >
                    {m.title}
                  </span>
                  <span className="lbl-tight shrink-0 text-muted">
                    {EFFECTIVE_STATUS_LABEL[state.get(m.id)?.status_effective ?? m.status]}
                  </span>
                </div>
              ))
            )}
          </div>
        </section>

        {(deps.length > 0 || dependsOnPeople.length > 0) && (
          <section className="mt-9">
            <h2 className="font-display text-[22px] font-medium">Dependencies</h2>
            <div className="mt-3">
              {deps.map((d) => (
                <Line
                  key={d.id}
                  label="Waits on project"
                  value={
                    <>
                      {projectTitle.get(d.depends_on_id) ?? 'Unknown project'}
                      {d.note && <span className="text-muted">, {d.note}</span>}
                    </>
                  }
                />
              ))}
              {dependsOnPeople.length > 0 && (
                <Line label="Waiting on" value={dependsOnPeople.join(' · ')} />
              )}
            </div>
          </section>
        )}

        {decisions.length > 0 && (
          <section className="mt-9">
            <h2 className="font-display text-[22px] font-medium">Decisions</h2>
            {/*
              Grouped, because this is the page somebody else reads. Twenty
              decisions in date order is a log; the same twenty under Hardware,
              Software and Network is the specification they were asking for.
            */}
            <div className="mt-3 flex flex-col gap-4">
              {DECISION_TOPICS.filter((t) =>
                decisions.some((d) => d.topic === t),
              ).map((topic) => (
                <section key={topic} className="break-inside-avoid">
                  {topic !== 'other' && (
                    <h3 className="lbl mt-2 text-muted">
                      {DECISION_TOPIC_LABEL[topic]}
                    </h3>
                  )}
                  <div className="flex flex-col gap-4">
              {decisions.filter((d) => d.topic === topic).map((d) => (
                <div key={d.id} className="break-inside-avoid border-t border-rule pt-3">
                  <div className="text-[10.5px] tabular-nums text-muted">
                    {formatDateLong(d.decided_on)}
                  </div>
                  <div className="mt-1 max-w-[640px] text-[13px] font-medium leading-snug">
                    {d.decision}
                  </div>
                  {d.rationale && (
                    <p className="mt-1.5 max-w-[640px] text-[12px] leading-relaxed">
                      {d.rationale}
                    </p>
                  )}
                  {d.alternatives && (
                    <p className="mt-1.5 max-w-[640px] border-l border-rule pl-3 text-[12px] leading-relaxed text-muted">
                      Rejected: {d.alternatives}
                    </p>
                  )}
                </div>
              ))}
                  </div>
                </section>
              ))}
            </div>
          </section>
        )}

        <div className="mt-12 flex items-baseline justify-between border-t border-rule pt-3 text-[10px] uppercase tracking-[0.12em] text-muted">
          <span>{project.title}</span>
          <span className="tabular-nums">
            Printed {formatDate(today())}
          </span>
        </div>
      </article>
    </main>
  )
}
