import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { QueryFailure, firstError } from '@/lib/failure'
import {
  annualEur,
  referenceFrom,
  savingFrom,
  stagesFrom,
  strategyTarget,
} from '@/lib/cogs'
import { subtreeSet } from '@/lib/subtree'
import { formatMoney } from '@/lib/cost'
import { contributionOf, strategyPicture, type Marking } from '@/lib/strategy'
import { setContribution, toggleNodeStrategy } from '@/lib/strategy-actions'
import { pathTo } from '@/lib/wbs'
import { Hint, Rule, StatusMark } from '@/components/ui'
import {
  TYPE_LABEL,
  type Node,
  type NodeCost,
  type StageVolume,
  type Strategy,
  type StrategyNode,
  type Yardstick,
} from '@/lib/types'

export const dynamic = 'force-dynamic'

/**
 * One strategy, and every piece of work marked as serving it.
 *
 * The list is the argument. A figure without the parts behind it is a number
 * somebody has to take on trust, and this is the page you open when they do not.
 */
export default async function StrategyDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ add?: string; edit?: string }>
}) {
  const { id } = await params
  const { add, edit: editId } = await searchParams
  const supabase = await createClient()

  const [strategyRes, markRes, nodeRes, costRes, yardRes, stageRes] = await Promise.all([
    supabase.from('strategy').select('*').eq('id', id).single(),
    supabase.from('v_strategy_node').select('*').eq('strategy_id', id),
    supabase.from('node').select('*').order('sort_order'),
    supabase.from('v_node_cost').select('*'),
    supabase.from('yardstick').select('*').maybeSingle(),
    supabase.from('stage_volume').select('fiscal_year, stage, units, scope'),
  ])

  const failure = firstError([markRes, nodeRes, costRes])
  if (failure) return <QueryFailure message={failure} />

  /*
   * The reference behind a claim. Absent, an origin figure cannot be turned
   * into euro at all and the contribution stays unknown, which is the honest
   * answer: a saving has no value until you say which year's volumes it is
   * weighed against.
   *
   * Deliberately outside firstError, like the yardstick on the cost page. A
   * missing reference makes one of three fallbacks unavailable; it is not a
   * reason to refuse to draw the page.
   */
  const yard = yardRes.data as Yardstick | null
  const reference = referenceFrom(yard)
  const stages = stagesFrom((stageRes.data ?? []) as StageVolume[], yard?.fiscal_year ?? null)

  const strategy = strategyRes.data as Strategy | null
  if (!strategy) notFound()

  const marks = (markRes.data ?? []) as StrategyNode[]
  const nodes = (nodeRes.data ?? []) as Node[]
  const rolls = new Map(((costRes.data ?? []) as NodeCost[]).map((r) => [r.node_id, r]))
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const roots = nodes.filter((n) => n.parent_id === null)
  const projectOf = (nodeId: string) =>
    roots.find((p) => subtreeSet(nodes, p.id).has(nodeId))

  const label = (nodeId: string) => {
    const project = projectOf(nodeId)
    if (!project) return byId.get(nodeId)?.title ?? 'gone'
    const rest = pathTo(nodes, project.id, nodeId)
      .slice(1)
      .map((n) => byId.get(n)?.title ?? '')
    return [project.title, ...rest].join(' › ')
  }

  /*
   * What the work promised on the day it became work.
   *
   * The view carries the claim raw, on purpose: converting it there would put a
   * third spelling of the euro rule into SQL beside lib/cogs and v_node_cost,
   * and two of the three would eventually disagree. So it is converted here,
   * with the same functions the spark page uses to show the same figure.
   *
   * Null without a yardstick, which is honest rather than unfortunate: a saving
   * has no euro value until you say which year's volumes it is weighed against.
   */
  const originEur = (m: StrategyNode): number | null => {
    if (reference === null) return null
    const stage = stages.find((v) => v.stage === m.origin_saving_stage)
    const saving = savingFrom(m.origin_saving_kind, m.origin_saving_value, stage?.units ?? null)
    return saving === null ? null : annualEur(saving, reference)
  }

  const markingFor = (m: StrategyNode): Marking => {
    const node = byId.get(m.node_id)
    return {
      nodeId: m.node_id,
      isTop: m.is_top,
      annualEur: m.annual_eur === null ? null : Number(m.annual_eur),
      ownBenefit: m.benefit_eur === null ? null : Number(m.benefit_eur),
      /*
       * The claim made when the work started, turned into euro by the same
       * arithmetic every other page uses. Last of the three to be believed, and
       * the only one a project promoted from a spark has before anybody fills in
       * its identity page, which is all of them at first.
       */
      originBenefit: originEur(m),
      status: m.node_status,
      blocked: m.node_blocked,
      investedEur: Number(rolls.get(m.node_id)?.once_committed ?? 0),
    }
  }

  const picture = strategyPicture(marks.map(markingFor), strategyTarget(strategy, reference))
  const markedIds = new Set(marks.map((m) => m.node_id))
  const editing = editId ? marks.find((m) => m.id === editId) : undefined

  const ordered = [...marks].sort((a, b) =>
    a.is_top !== b.is_top ? (a.is_top ? -1 : 1) : label(a.node_id) < label(b.node_id) ? -1 : 1,
  )

  return (
    <main>
      <div className="frame [--frame-margin:340px] items-baseline">
        <div className="lbl pl-5 lg:pl-16 py-3 pr-5 text-muted">
          <Link href="/strategy" className="hover:text-ink">
            Strategy
          </Link>
        </div>
        <div className="lbl border-l border-rule px-5 lg:px-10 py-3 text-muted">
          {strategy.name}
        </div>
        <div className="border-l border-rule py-3 pl-5 lg:pl-8 pr-5 lg:pr-16 text-right">
          <Link
            href={add ? `/strategy/${id}` : `/strategy/${id}?add=1`}
            className="lbl text-muted hover:text-ink"
          >
            {add ? 'Done' : 'Mark work'}
          </Link>
        </div>
      </div>
      <Rule strong />

      <div className="px-5 lg:px-16 py-8">
        <h1 className="font-display text-[34px] leading-tight">{strategy.name}</h1>
        {strategy.description && (
          <p className="mt-2 max-w-prose text-[13px] leading-relaxed text-muted">
            {strategy.description}
          </p>
        )}

        <div className="mt-6 flex max-w-3xl flex-wrap items-baseline gap-x-10 gap-y-2 border-y border-rule py-4">
          <span className="num text-[19px]">
            {formatMoney(Math.round(picture.promised), 'EUR')}
            <span className="lbl-tight ml-2 text-muted">promised a year</span>
          </span>
          <span className="num text-[19px]">
            {formatMoney(Math.round(picture.delivered), 'EUR')}
            <span className="lbl-tight ml-2 text-muted">delivered</span>
          </span>
          {picture.unquantified > 0 && (
            <span className="lbl-tight text-oxblood">
              {picture.unquantified} without a figure
            </span>
          )}
        </div>

        {/* ------------------------------------------------------------- */}
        {/* Marking work                                                  */}
        {/* ------------------------------------------------------------- */}
        {add && (
          <div className="mt-8 border border-rule bg-sheet px-6 py-5">
            <div className="lbl text-muted">Mark what serves this strategy</div>
            <p className="mt-2 max-w-prose text-[12px] leading-relaxed text-rule-strong">
              Mark the part that actually delivers the saving. Marking a whole
              project when only one subproject earns it overstates the strategy
              by everything else in that project. A part inside something
              already marked is kept but never added twice.
            </p>
            <div className="mt-4 flex flex-col gap-1">
              {nodes
                .filter((n) => n.type !== 'task')
                .map((n) => {
                  const on = markedIds.has(n.id)
                  return (
                    <form key={n.id} action={toggleNodeStrategy}>
                      <input type="hidden" name="node_id" value={n.id} />
                      <input type="hidden" name="strategy_id" value={id} />
                      <input type="hidden" name="redirectTo" value={`/strategy/${id}?add=1`} />
                      <button
                        className={`flex w-full items-baseline gap-3 py-1 text-left text-[12.5px] ${
                          on ? 'text-ink' : 'text-muted hover:text-ink'
                        }`}
                      >
                        <span className="w-3 shrink-0 text-center">{on ? '×' : '+'}</span>
                        <span className="lbl-tight w-24 shrink-0 text-rule-strong">
                          {TYPE_LABEL[n.type]}
                        </span>
                        <span className="min-w-0 flex-1">{label(n.id)}</span>
                      </button>
                    </form>
                  )
                })}
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------- */}
        {/* What is marked                                                */}
        {/* ------------------------------------------------------------- */}
        <div className="mt-10 flex items-baseline gap-4">
          <h2 className="lbl text-muted">What serves it</h2>
          <span className="num text-[13px] text-rule-strong">{marks.length}</span>
        </div>
        <Rule strong />

        {marks.length === 0 ? (
          <p className="mt-4 max-w-prose text-[13px] leading-relaxed text-muted">
            Nothing marked yet. Press <span className="text-ink">Mark work</span>{' '}
            and pick the parts of the tree that deliver this.
          </p>
        ) : (
          <div className="divide-y divide-rule border-b border-rule">
            {ordered.map((m) => {
              const node = byId.get(m.node_id)
              const marking = markingFor(m)
              const contribution = contributionOf(marking)
              const project = projectOf(m.node_id)

              return (
                <div key={m.id} className="py-3.5">
                  <div className="flex items-baseline gap-4">
                    <StatusMark
                      status={node?.status ?? 'idea'}
                      blocked={marking.blocked}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-[14px] leading-snug">
                        {project ? (
                          <Link
                            href={`/p/${project.id}${
                              project.id === m.node_id ? '' : `?focus=${m.node_id}`
                            }`}
                            className="hover:text-green"
                          >
                            {label(m.node_id)}
                          </Link>
                        ) : (
                          label(m.node_id)
                        )}
                      </div>
                      {!m.is_top && (
                        <div className="lbl-tight mt-0.5 text-rule-strong">
                          <Hint text="Something above this is marked for the same strategy, so its figure is already included there. Kept, because it says where the saving actually comes from.">
                            inside another marking, not counted again
                          </Hint>
                        </div>
                      )}
                      {m.note && (
                        <div className="mt-1 max-w-prose text-[12px] leading-relaxed text-muted">
                          {m.note}
                        </div>
                      )}
                    </div>

                    <div className="num shrink-0 text-right text-[14px]">
                      {contribution === null ? (
                        <span className="lbl-tight text-oxblood">no figure</span>
                      ) : (
                        <>
                          {formatMoney(Math.round(contribution), 'EUR')}
                          <span className="ml-1 text-[10px] text-muted">a year</span>
                        </>
                      )}
                      {m.annual_eur === null && contribution !== null && (
                        <div className="lbl-tight text-rule-strong">
                          its own expected benefit
                        </div>
                      )}
                    </div>

                    <div className="flex shrink-0 items-baseline gap-3">
                      <Link
                        href={`/strategy/${id}?edit=${m.id}`}
                        className="lbl-tight text-rule-strong hover:text-ink"
                      >
                        Figure
                      </Link>
                      <form action={toggleNodeStrategy}>
                        <input type="hidden" name="node_id" value={m.node_id} />
                        <input type="hidden" name="strategy_id" value={id} />
                        <input type="hidden" name="redirectTo" value={`/strategy/${id}`} />
                        <button className="lbl-tight text-rule-strong hover:text-oxblood">
                          Unmark
                        </button>
                      </form>
                    </div>
                  </div>

                  {editing?.id === m.id && (
                    <form
                      action={setContribution}
                      className="mt-3 flex max-w-3xl items-end gap-4 border-l-2 border-rule-strong pl-4"
                    >
                      <input type="hidden" name="id" value={m.id} />
                      <input type="hidden" name="redirectTo" value={`/strategy/${id}`} />
                      <label className="block">
                        <span className="lbl text-muted">
                          <Hint text="Leave it empty to use the project's own expected annual benefit. Fill it in where this part serves the strategy only partly, or where the node has no benefit of its own.">
                            Contributes a year
                          </Hint>
                        </span>
                        <input
                          name="annual_eur"
                          inputMode="decimal"
                          autoFocus
                          defaultValue={m.annual_eur ?? ''}
                          placeholder={
                            marking.ownBenefit === null
                              ? 'nothing to fall back on'
                              : `blank uses ${Math.round(marking.ownBenefit)}`
                          }
                          className="field tabular-nums"
                        />
                      </label>
                      <label className="block flex-1">
                        <span className="lbl text-muted">Where the saving comes from</span>
                        <input
                          name="note"
                          defaultValue={m.note ?? ''}
                          className="field"
                        />
                      </label>
                      <button className="btn">Save</button>
                      <Link href={`/strategy/${id}`} className="btn btn-ghost">
                        Cancel
                      </Link>
                    </form>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </main>
  )
}
