import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ProjectFrame } from '@/components/project-frame'
import { DecisionForm } from '@/components/decision-form'
import { QueryFailure, firstError } from '@/lib/failure'
import { createClient } from '@/lib/supabase/server'
import { subtreeSet } from '@/lib/subtree'
import { formatDate, Hint, Rule } from '@/components/ui'
import { formatMoney, lineAmount, lineEur } from '@/lib/cost'
import { referenceFrom, stagesFrom } from '@/lib/cogs'
import { Origin } from '@/components/origin'
import { pathTo } from '@/lib/wbs'
import {
  COST_KINDS,
  COST_KIND_HINT,
  COST_KIND_LABEL,
  COST_STATE_LABEL,
  DECISION_TOPICS,
  DECISION_TOPIC_HINT,
  DECISION_TOPIC_LABEL,
  type Cost,
  type CostKind,
  type Decision,
  type DecisionTopic,
  type Node,
  type NodeOrigin,
  type StageVolume,
  type Yardstick,
} from '@/lib/types'

export const dynamic = 'force-dynamic'

/**
 * What the work rests on.
 *
 * Two questions live here, and they are not the same question. What did we
 * choose, and what did we turn down, is a moment: it happened, it is fixed, and
 * six months later it is the only thing that answers «why didn't you just use a
 * Raspberry Pi». What does it consist of is a state: it moves until the cabinet
 * is built.
 *
 * So the choices come from `decision`, which has carried `rationale` and
 * `alternatives` since the first migration, and the parts come from `cost`.
 * There is deliberately no parts table. A sensor you are going to buy is
 * already a priced line with a vendor and a quotation attached; writing it a
 * second time as a specification would be the one thing this whole application
 * exists to avoid.
 */
export default async function BasisPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ focus?: string; edit?: string; new?: string }>
}) {
  const { id } = await params
  const { focus: focusId, edit: editId, new: newTopic } = await searchParams
  const supabase = await createClient()

  const [projectRes, nodesRes, decisionRes, costRes, originRes, yardstickRes, stageRes] =
    await Promise.all([
    supabase.from('node').select('*').eq('id', id).single(),
    supabase.from('node').select('id, parent_id, title, type').order('sort_order'),
    supabase.from('decision').select('*').order('decided_on', { ascending: false }),
    supabase.from('cost').select('*').order('dated', { ascending: false }),
    // Appended at the end on purpose: inserting a query in the middle silently
    // rebinds every destructured result after it.
    supabase.from('node_origin').select('*'),
    supabase.from('yardstick').select('*').maybeSingle(),
    supabase.from('stage_volume').select('fiscal_year, stage, units'),
  ])

  const failure = firstError([projectRes, nodesRes, decisionRes, costRes])
  if (failure) return <QueryFailure message={failure} />

  const project = projectRes.data as Node | null
  if (!project) notFound()

  const everyNode = (nodesRes.data ?? []) as {
    id: string
    parent_id: string | null
    title: string
    type: string
  }[]
  // Fetched whole, cut here. See lib/subtree.
  const inProject = subtreeSet(everyNode, id)
  const nodes = everyNode.filter((n) => inProject.has(n.id))

  // Follows the focus, the way Cost and the tree do. Standing on Data Collector
  // shows what Data Collector rests on, not the whole programme.
  const focusNode = focusId ? nodes.find((n) => n.id === focusId) : undefined
  const scopeId = focusNode?.id ?? id
  const inScope = subtreeSet(nodes, scopeId)

  const decisions = ((decisionRes.data ?? []) as Decision[]).filter((d) =>
    inScope.has(d.node_id),
  )
  const lines = ((costRes.data ?? []) as Cost[]).filter((l) => inScope.has(l.node_id))

  /*
   * What was promised for this, while it was still an idea. Scoped like
   * everything else on the page, so standing on a part shows that part's
   * origin rather than the whole programme's.
   */
  const origins = ((originRes.data ?? []) as NodeOrigin[])
    .filter((o) => inScope.has(o.node_id))
    .sort((a, b) => (a.promised_at < b.promised_at ? -1 : 1))

  const yard = yardstickRes.data as Yardstick | null
  const reference = referenceFrom(yard)
  const unitsAt = new Map(
    stagesFrom((stageRes.data ?? []) as StageVolume[], yard?.fiscal_year ?? null).map(
      (v) => [v.stage, v.units],
    ),
  )

  const base = `/p/${id}`
  const here = focusNode ? `${base}/grundlag?focus=${focusNode.id}` : `${base}/grundlag`
  const keep = (extra: string) => `${here}${here.includes('?') ? '&' : '?'}${extra}`

  const titleOf = new Map(nodes.map((n) => [n.id, n.title]))
  const pathLabel = (nodeId: string) =>
    pathTo(nodes, id, nodeId)
      .slice(1)
      .map((n) => titleOf.get(n) ?? '')
      .join(' › ') || project.title

  const editing = editId ? decisions.find((d) => d.id === editId) : undefined
  const scopeTitle = focusNode ? focusNode.title : project.title

  // Grouped in the declared order, so the page reads the same way every time.
  const byTopic = new Map<DecisionTopic, Decision[]>()
  for (const d of decisions) {
    byTopic.set(d.topic, [...(byTopic.get(d.topic) ?? []), d])
  }
  const byKind = new Map<CostKind, Cost[]>()
  for (const l of lines) {
    byKind.set(l.kind, [...(byKind.get(l.kind) ?? []), l])
  }

  const unfiled = byTopic.get('other')?.length ?? 0
  const withoutRejected = decisions.filter(
    (d) => d.alternatives === null || d.alternatives.trim() === '',
  ).length

  return (
    <ProjectFrame projectId={id} frameNodeId={scopeId} focusId={focusNode?.id}>
      <div className="px-5 lg:px-10 py-7">
        <div className="flex items-baseline justify-between gap-5">
          <div className="min-w-0">
            {focusNode && (
              <div className="lbl mb-1 text-muted">
                <Link href={`${base}/grundlag`} className="text-ink hover:text-green">
                  Whole project
                </Link>
                <span className="mx-2 text-rule-strong">&rsaquo;</span>
                {pathLabel(focusNode.id)}
              </div>
            )}
            <h2 className="font-display text-[26px] leading-tight">Basis</h2>
            <p className="mt-1 max-w-prose text-[13px] leading-relaxed text-muted">
              What {scopeTitle} rests on: the choices that were made, what was
              turned down instead, and what it is going to be built out of.
            </p>
          </div>

          {!editing && newTopic === undefined && (
            <Link href={keep('new=1')} className="btn shrink-0">
              Record a decision
            </Link>
          )}
        </div>

        {(editing || newTopic !== undefined) && (
          <div className="mt-6">
            <DecisionForm
              decision={editing}
              nodeId={scopeId}
              redirectTo={here}
              cancelHref={here}
              defaultTopic={
                newTopic && newTopic !== '1'
                  ? (newTopic as DecisionTopic)
                  : undefined
              }
            />
          </div>
        )}

        {origins.length > 0 && (
          <div className="mt-10">
            <div className="flex items-baseline gap-4">
              <h3 className="lbl text-muted">Where it came from</h3>
              <span className="num text-[13px] text-rule-strong">
                {origins.length}
              </span>
            </div>
            <div className="mt-4 flex flex-col gap-6">
              {origins.map((o) => (
                <Origin
                  key={o.node_id}
                  origin={o}
                  reference={reference}
                  stageUnits={
                    o.saving_stage === null
                      ? null
                      : (unitsAt.get(o.saving_stage) ?? null)
                  }
                  title={o.node_id === scopeId ? undefined : titleOf.get(o.node_id)}
                />
              ))}
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------- */}
        {/* The choices                                                    */}
        {/* ------------------------------------------------------------- */}
        <div className="mt-10 flex items-baseline gap-4">
          <h3 className="lbl text-muted">Decisions</h3>
          <span className="num text-[13px] text-rule-strong">
            {decisions.length}
          </span>
          {unfiled > 0 && (
            <span className="lbl-tight text-rule-strong">
              {unfiled} not filed
            </span>
          )}
          {withoutRejected > 0 && (
            <span className="lbl-tight text-oxblood">
              <Hint text="A decision without the rejected option is a note. It is the half you are missing when someone asks why.">
                {withoutRejected} without an alternative
              </Hint>
            </span>
          )}
        </div>
        <Rule strong />

        {decisions.length === 0 ? (
          <p className="mt-4 max-w-prose text-[13px] leading-relaxed text-muted">
            Nothing decided here yet. The hardware, the software, the network
            segment, the supplier: each of those is a choice somebody will ask
            about later, and this is the cheapest place to answer them in
            advance.
          </p>
        ) : (
          DECISION_TOPICS.filter((t) => byTopic.has(t)).map((topic) => (
            <section key={topic} className="mt-6">
              <div className="flex items-baseline gap-3">
                <h4 className="font-display text-[17px]">
                  {DECISION_TOPIC_LABEL[topic]}
                </h4>
                <span className="text-[11px] text-rule-strong">
                  {topic === 'other'
                    ? 'captured in a hurry. Open one to give it a heading.'
                    : DECISION_TOPIC_HINT[topic]}
                </span>
              </div>

              <div className="mt-2 divide-y divide-rule border-y border-rule">
                {(byTopic.get(topic) ?? []).map((d) => (
                  <article key={d.id} className="py-3.5">
                    <div className="flex items-baseline gap-4">
                      <h5 className="min-w-0 flex-1 text-[15px] leading-snug">
                        {d.decision}
                      </h5>
                      <span className="num shrink-0 text-[11px] text-rule-strong">
                        {formatDate(d.decided_on)}
                      </span>
                      <Link
                        href={keep(`edit=${d.id}`)}
                        className="lbl-tight shrink-0 text-rule-strong hover:text-ink"
                      >
                        Edit
                      </Link>
                    </div>

                    {d.node_id !== scopeId && (
                      <div className="lbl-tight mt-1 text-rule-strong">
                        {pathLabel(d.node_id)}
                      </div>
                    )}

                    {d.rationale && (
                      <p className="mt-2 max-w-prose text-[13px] leading-relaxed text-muted">
                        {d.rationale}
                      </p>
                    )}

                    {/*
                      The rejected option is given its own rule and its own
                      label rather than being run in as a second paragraph. It
                      is the half that survives: the reasoning is often
                      guessable, what you turned down never is.
                    */}
                    {d.alternatives ? (
                      <div className="mt-2.5 border-l-2 border-rule-strong pl-3">
                        <span className="lbl-tight block text-rule-strong">
                          Turned down
                        </span>
                        <p className="mt-0.5 max-w-prose text-[13px] leading-relaxed text-muted">
                          {d.alternatives}
                        </p>
                      </div>
                    ) : (
                      <div className="mt-2 text-[11px] text-rule-strong">
                        Nothing recorded as turned down.
                      </div>
                    )}
                  </article>
                ))}
              </div>
            </section>
          ))
        )}

        {/* ------------------------------------------------------------- */}
        {/* The parts                                                      */}
        {/* ------------------------------------------------------------- */}
        <div className="mt-12 flex items-baseline gap-4">
          <h3 className="lbl text-muted">What it consists of</h3>
          <span className="num text-[13px] text-rule-strong">{lines.length}</span>
          <span className="text-[11px] text-rule-strong">
            the same lines as Cost, read as a specification instead of a total
          </span>
        </div>
        <Rule strong />

        {lines.length === 0 ? (
          <p className="mt-4 max-w-prose text-[13px] leading-relaxed text-muted">
            No parts yet. A part is a{' '}
            <Link href={`${base}/cost${focusNode ? `?focus=${focusNode.id}` : ''}`} className="text-ink underline decoration-rule-strong underline-offset-2 hover:text-green">
              cost line
            </Link>
            , so writing one here and a price there would be writing it twice.
            Free software counts too, at nothing: it is still part of what this
            is built from.
          </p>
        ) : (
          COST_KINDS.filter((k) => byKind.has(k)).map((kind) => {
            const group = byKind.get(kind) ?? []
            const total = group.reduce((sum, l) => sum + lineEur(l), 0)
            return (
              <section key={kind} className="mt-6">
                <div className="flex items-baseline gap-3">
                  <h4 className="font-display text-[17px]">
                    {COST_KIND_LABEL[kind]}
                  </h4>
                  <span className="text-[11px] text-rule-strong">
                    {COST_KIND_HINT[kind]}
                  </span>
                  <span className="num ml-auto text-[13px]">
                    {formatMoney(Math.round(total * 100) / 100, 'EUR')}
                  </span>
                </div>

                <div className="mt-2 divide-y divide-rule border-y border-rule">
                  {group.map((l) => (
                    <div
                      key={l.id}
                      className="grid grid-cols-[1fr_auto_auto] items-baseline gap-x-5 py-2.5"
                    >
                      <div className="min-w-0">
                        <span className="text-[14px]">{l.description}</span>
                        <div className="lbl-tight mt-0.5 flex flex-wrap items-baseline gap-x-3 text-rule-strong">
                          {l.vendor && <span>{l.vendor}</span>}
                          {l.reference && <span>{l.reference}</span>}
                          {l.node_id !== scopeId && (
                            <span>{pathLabel(l.node_id)}</span>
                          )}
                          <span>{COST_STATE_LABEL[l.state]}</span>
                          {l.document_id === null &&
                            l.state !== 'estimate' && (
                              <span className="text-oxblood">no paper</span>
                            )}
                        </div>
                      </div>

                      <div className="num text-right text-[13px] text-muted">
                        {Number(l.quantity) !== 1 && (
                          <>
                            {Number(l.quantity)} x{' '}
                            {formatMoney(Number(l.amount), '').trim()}
                          </>
                        )}
                      </div>

                      <div className="num text-right text-[14px]">
                        {formatMoney(lineAmount(l), l.currency)}
                        {l.recurrence !== 'once' && (
                          <span className="ml-1 text-[10px] text-muted">
                            {l.recurrence === 'monthly'
                              ? 'a month'
                              : l.recurrence === 'quarterly'
                                ? 'a quarter'
                                : 'a year'}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )
          })
        )}

        {/*
          The topics with nothing under them, offered rather than listed as a
          failure. An empty heading is a question worth being asked once.
        */}
        {decisions.length > 0 && (
          <div className="mt-12">
            <h3 className="lbl text-muted">Not decided here</h3>
            <Rule />
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
              {DECISION_TOPICS.filter(
                (t) => t !== 'other' && !byTopic.has(t),
              ).map((t) => (
                <Link
                  key={t}
                  href={keep(`new=${t}`)}
                  className="lbl-tight text-rule-strong hover:text-ink"
                >
                  {DECISION_TOPIC_LABEL[t]}
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </ProjectFrame>
  )
}
