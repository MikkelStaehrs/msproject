import Link from 'next/link'
import { notFound } from 'next/navigation'
import { QueryFailure, firstError } from '@/lib/failure'
import { createClient } from '@/lib/supabase/server'
import { childrenByParent, subtreeSet } from '@/lib/subtree'
import { readIdentity } from '@/lib/identity'
import { annualEur, referenceFrom, savingFrom, stagesFrom, targetAnnual } from '@/lib/cogs'
import { payback } from '@/lib/cost'
import { pathTo, wbsCodes } from '@/lib/wbs'
import { EconomicsCost, type PartRow } from '@/components/economics-cost'
import { EconomicsValue, type Missing, type SavingSource } from '@/components/economics-value'
import { EconomicsBasis } from '@/components/economics-basis'
import { EconomicsLineForm } from '@/components/economics-line-form'
import type {
  Cost,
  Decision,
  DecisionTopic,
  Node,
  NodeCost,
  NodeOrigin,
  StageVolume,
  Strategy,
  StrategyNode,
  Yardstick,
} from '@/lib/types'

/**
 * Economics: what it costs on the left, what it is worth on the right.
 *
 * The page owns nothing. Every figure on the left is the cost lines on the
 * parts of this project, rolled up through the tree by v_node_cost; every
 * figure on the right is the claim made when the work started, the marking
 * against a strategy, and the yardstick the whole portfolio is measured with.
 * Change a line on a part and the left changes; fill in Read and the right
 * does.
 *
 * Two routes render this one component. `/cost` is the page; `/grundlag` is
 * the same page with the Basis section open in the left column, which is what
 * `?basis=1` does from `/cost`. Two data layers for the same columns would be
 * the schema showing through the interface twice.
 */

export type EconomicsParams = {
  focus?: string
  /** `new`, or the id of a line to edit. */
  line?: string
  /** The part whose lines are listed under «Where it sits». */
  part?: string
  basis?: string
  /** A document to price: preselected on a new line. */
  doc?: string
  /** The node a new line lands on. */
  on?: string
  /** On Economics the old spelling of `line`; on Basis the decision to edit. */
  edit?: string
  /** On Basis: `1` or a topic, opening the decision form. */
  new?: string
}

type TreeNode = {
  id: string
  parent_id: string | null
  title: string
  type: string
  status: Node['status']
  sort_order: number
  completed_at: string | null
}

type DocRow = {
  id: string
  node_id: string
  name: string
  folder: string | null
  created_at: string
}

const EMPTY_ROLL = (nodeId: string): NodeCost => ({
  node_id: nodeId,
  once_estimated: 0,
  once_quoted: 0,
  once_ordered: 0,
  once_invoiced: 0,
  once_committed: 0,
  once_priced: 0,
  once_with_paper: 0,
  annual_committed: 0,
  annual_priced: 0,
  capex_once_priced: 0,
  capex_once_committed: 0,
  capex_annual_priced: 0,
  opex_once_priced: 0,
  opex_once_committed: 0,
  opex_annual_priced: 0,
  opex_annual_committed: 0,
  once_items: 0,
  annual_items: 0,
  items: 0,
})

export async function EconomicsScreen({
  id,
  params,
  basisRoute = false,
}: {
  id: string
  params: EconomicsParams
  /** True on /grundlag, where Basis is the page rather than a section. */
  basisRoute?: boolean
}) {
  const supabase = await createClient()

  /*
   * One round trip. Everything the two columns need, fetched whole and cut in
   * memory: the portfolio is a few dozen rows and an id-list round trip would
   * cost a second wait for nothing.
   */
  const [
    projectRes,
    nodesRes,
    costRes,
    rollRes,
    docRes,
    decisionRes,
    originRes,
    markRes,
    strategyRes,
    yardstickRes,
    stageRes,
  ] = await Promise.all([
    supabase.from('node').select('*').eq('id', id).single(),
    supabase
      .from('node')
      .select('id, parent_id, title, type, status, sort_order, completed_at')
      .order('sort_order'),
    supabase.from('cost').select('*').order('dated', { ascending: false }),
    supabase.from('v_node_cost').select('*'),
    supabase
      .from('document')
      .select('id, node_id, name, folder, created_at')
      .order('created_at', { ascending: false }),
    supabase.from('decision').select('*').order('decided_on', { ascending: false }),
    supabase.from('node_origin').select('*'),
    supabase.from('v_strategy_node').select('*'),
    supabase.from('strategy').select('*').order('sort_order').order('name'),
    supabase.from('yardstick').select('*').maybeSingle(),
    supabase.from('stage_volume').select('fiscal_year, stage, units, scope'),
  ])

  /*
   * The yardstick and the stage volumes are deliberately absent from this
   * check. Without them the right column says «nothing to divide by» in so
   * many words, which is a narrower page rather than a broken one; taking the
   * cost lines down because the reference could not be read would be the
   * wrong trade.
   */
  const failure = firstError([
    projectRes,
    nodesRes,
    costRes,
    rollRes,
    docRes,
    decisionRes,
    originRes,
    markRes,
    strategyRes,
  ])
  if (failure) return <QueryFailure message={failure} />

  const project = projectRes.data as Node | null
  if (!project) notFound()

  const everyNode = (nodesRes.data ?? []) as TreeNode[]
  const inProject = subtreeSet(everyNode, id)
  const nodes = everyNode.filter((n) => inProject.has(n.id))
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const kids = childrenByParent(nodes)

  /*
   * The page follows the focus, the way the rail does. Standing on a part
   * prices that part; the project still sums all of it, because the roll-up
   * never cared where a line was written.
   */
  const focusNode = params.focus ? byId.get(params.focus) : undefined
  const scopeId = focusNode?.id ?? id
  const scopeTitle = focusNode?.title ?? project.title
  const scopeStatus = focusNode?.status ?? project.status
  const scopeDone = focusNode ? focusNode.completed_at : project.completed_at
  const atProject = scopeId === id
  const inScope = subtreeSet(nodes, scopeId)

  const identity = readIdentity(project.reporting)
  const projectNo = identity.admin.project_no ?? null
  const codes = wbsCodes(nodes, id, projectNo ?? '')
  const codeOf = (nodeId: string) =>
    nodeId === id ? (projectNo ?? 'no number') : (codes.get(nodeId) ?? '')
  const titleOf = (nodeId: string) => byId.get(nodeId)?.title ?? ''
  /** The chain below a node, so a line deeper down says where it sits. */
  const pathBelow = (from: string, nodeId: string) =>
    pathTo(nodes, from, nodeId).slice(1).map(titleOf).join(' › ')

  const allLines = ((costRes.data ?? []) as Cost[]).filter((l) => inProject.has(l.node_id))
  const lines = allLines.filter((l) => inScope.has(l.node_id))
  const rolls = new Map(((rollRes.data ?? []) as NodeCost[]).map((r) => [r.node_id, r]))
  const roll = rolls.get(scopeId) ?? EMPTY_ROLL(scopeId)

  const docsInProject = ((docRes.data ?? []) as DocRow[]).filter((d) => inProject.has(d.node_id))
  const docs = docsInProject.filter((d) => inScope.has(d.node_id))
  const docName = new Map(docsInProject.map((d) => [d.id, d.name]))
  /*
   * Paper without a price: a document no cost line rests on. A quote attached
   * to a part is a figure somebody still has to type, and the only evidence it
   * has been typed is a line pointing back at it.
   */
  const priced = new Set(
    allLines.map((l) => l.document_id).filter((d): d is string => d !== null),
  )
  const unpriced = docs.filter((d) => !priced.has(d.id))

  const yard = yardstickRes.data as Yardstick | null
  const reference = referenceFrom(yard)
  const stages = stagesFrom((stageRes.data ?? []) as StageVolume[], yard?.fiscal_year ?? null)
  const unitsAt = new Map(stages.map((v) => [v.stage, v.units]))

  /*
   * What was promised on the day this became work, in euro, through the same
   * arithmetic the spark and the budget use. Null without a yardstick: a
   * saving has no euro value until you say which year it is weighed against.
   */
  const origins = ((originRes.data ?? []) as NodeOrigin[]).filter((o) => inScope.has(o.node_id))
  const origin = origins.find((o) => o.node_id === scopeId) ?? null
  const claimEur = (() => {
    if (origin === null || reference === null) return null
    const stage =
      origin.saving_stage === null ? null : (unitsAt.get(origin.saving_stage) ?? null)
    const saving = savingFrom(origin.saving_kind, origin.saving_value, stage)
    return saving === null ? null : annualEur(saving, reference)
  })()

  /*
   * What the work serves. The topmost markings in this scope decide, the same
   * cut the budget adds up, so a project reads as serving the same strategy
   * here as it does there.
   */
  const marks = ((markRes.data ?? []) as StrategyNode[]).filter((m) => inScope.has(m.node_id))
  const strategies = (strategyRes.data ?? []) as Strategy[]
  const servedIds = new Set(marks.filter((m) => m.is_top).map((m) => m.strategy_id))
  const serves = strategies.filter((s) => servedIds.has(s.id))
  const markOnScope = marks.find((m) => m.node_id === scopeId) ?? null

  /*
   * The saving a year, most specific first: the figure on the marking, then
   * what Read says the project will deliver, then what was claimed when it
   * started. The same order lib/strategy uses, so the payback here and the
   * shortfall on the budget rest on the same number.
   */
  const ownBenefit =
    markOnScope?.benefit_eur != null
      ? Number(markOnScope.benefit_eur)
      : atProject
        ? identity.economics.benefit
        : null
  const saving: { eur: number | null; source: SavingSource } =
    markOnScope?.annual_eur != null
      ? { eur: Number(markOnScope.annual_eur), source: 'marking' }
      : ownBenefit !== null
        ? { eur: ownBenefit, source: 'read' }
        : claimEur !== null
          ? { eur: claimEur, source: 'claim' }
          : { eur: null, source: 'none' }

  /*
   * A share of the euro only exists against the strategy the euro belongs to:
   * the one whose target is the yardstick's. Marked against any other, or not
   * marked at all, the share is a dash rather than a nought, because nothing
   * has been said about what this is for.
   */
  const euroStrategy = serves.find((s) => s.target_from_yardstick) ?? null
  const target = reference === null ? null : targetAnnual(reference)
  const perUnit =
    claimEur !== null && reference !== null && reference.costBasisUnits > 0
      ? claimEur / reference.costBasisUnits
      : null
  const share =
    perUnit !== null &&
    euroStrategy !== null &&
    reference !== null &&
    reference.targetEurPerUnit > 0
      ? perUnit / reference.targetEurPerUnit
      : null
  const delivered = scopeStatus === 'done' ? saving.eur : null

  const investment = Number(roll.once_priced) > 0 ? Number(roll.once_priced) : null
  const running = Number(roll.annual_priced)
  const years = payback({ investment, annualBenefit: saving.eur, annualRunning: running })
  const limitFrom = serves.find((s) => s.max_payback_years !== null) ?? null
  const limitYears = limitFrom === null ? null : Number(limitFrom.max_payback_years)

  const base = `/p/${id}`
  const basisMode = basisRoute || params.basis === '1'
  const focusQ = focusNode ? `focus=${focusNode.id}` : null

  /** An address on this screen, in whichever mode, keeping the focus. */
  const costUrl = (...extra: (string | null | undefined)[]) => {
    const q = [focusQ, ...extra].filter((x): x is string => !!x)
    return q.length ? `${base}/cost?${q.join('&')}` : `${base}/cost`
  }
  const basisUrl = (...extra: (string | null | undefined)[]) => {
    const q = [basisRoute ? null : 'basis=1', focusQ, ...extra].filter(
      (x): x is string => !!x,
    )
    const path = basisRoute ? `${base}/grundlag` : `${base}/cost`
    return q.length ? `${path}?${q.join('&')}` : path
  }
  const partQ = params.part && inScope.has(params.part) ? `part=${params.part}` : null
  const here = basisMode ? basisUrl() : costUrl(partQ)

  /*
   * The line form. `edit` was the old spelling on this page and is still what
   * older links carry; on Basis the same word names a decision, so it only
   * counts as a line when the cost column is showing.
   */
  const lineParam = basisMode ? undefined : (params.line ?? params.edit)
  const editingLine =
    lineParam && lineParam !== 'new' ? allLines.find((l) => l.id === lineParam) : undefined
  const lineFormOpen = lineParam === 'new' || editingLine !== undefined
  const docToPrice = params.doc ? docs.find((d) => d.id === params.doc) : undefined

  /* «Where it sits»: the direct parts, then the scope itself when lines were written on it. */
  const viewOf = (l: Cost, from: string) => ({
    line: l,
    path: l.node_id === from ? null : pathBelow(from, l.node_id),
    docName: l.document_id === null ? null : (docName.get(l.document_id) ?? null),
  })
  const parts: PartRow[] = (kids.get(scopeId) ?? []).map((k) => {
    const under = subtreeSet(nodes, k.id)
    return {
      id: k.id,
      title: k.title,
      code: codeOf(k.id),
      parts: (kids.get(k.id) ?? []).length,
      roll: rolls.get(k.id) ?? null,
      lines: lines.filter((l) => under.has(l.node_id)).map((l) => viewOf(l, k.id)),
      self: false,
    }
  })
  const ownLines = lines.filter((l) => l.node_id === scopeId)
  if (ownLines.length > 0) {
    parts.push({
      id: scopeId,
      title: scopeTitle,
      code: codeOf(scopeId),
      parts: 0,
      roll: null,
      lines: ownLines.map((l) => viewOf(l, scopeId)),
      self: true,
    })
  }

  /* «What is missing»: what a person has to do before the page can say more. */
  const missing: Missing[] = []
  if (roll.items === 0) {
    missing.push({
      line: 'No cost line on any part',
      note:
        docs.length > 0
          ? `${docs.length} ${docs.length === 1 ? 'document is' : 'documents are'} attached; the figures on them have not been entered`
          : 'Nothing is attached either. The first quote that arrives is where to start',
      action: { label: 'Open files', href: `${base}/dokumenter` },
    })
  }
  if (serves.length === 0) {
    missing.push({
      line: 'Not marked against a strategy',
      note: 'Until it is, this project cannot appear in the portfolio total',
      action: { label: 'Open budget', href: '/strategy' },
    })
  }
  if (saving.eur === null) {
    missing.push({
      line: 'Nothing claimed for what it is worth',
      note: 'A saving a year, on Read, is what the payback and the share divide by',
      action: { label: 'Open Read', href: `${base}/identitet?edit=1` },
    })
  }
  if (reference !== null && !reference.confirmed) {
    missing.push({
      line: 'The yardstick is unconfirmed',
      note: 'Every share here divides by figures nobody has checked against their source',
      action: { label: 'Open budget', href: '/strategy' },
    })
  }

  /* Basis: the decisions in scope and the same lines read as a specification. */
  const decisions = ((decisionRes.data ?? []) as Decision[]).filter((d) => inScope.has(d.node_id))
  const editingDecision =
    basisMode && params.edit ? decisions.find((d) => d.id === params.edit) : undefined
  const newTopic = basisMode ? params.new : undefined

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_400px]">
      <div className="work min-w-0 px-[var(--gut)] py-[26px] lg:py-7 lg:pr-[26px]">
        {basisMode ? (
          <EconomicsBasis
            code={codeOf(scopeId)}
            scopeId={scopeId}
            scopeTitle={scopeTitle}
            whole={focusNode ? basisUrl().replace(`&${focusQ}`, '').replace(`?${focusQ}`, '') : null}
            economicsHref={costUrl()}
            here={here}
            newHref={(topic) => basisUrl(`new=${topic ?? '1'}`)}
            editHref={(decisionId) => basisUrl(`edit=${decisionId}`)}
            decisions={decisions}
            editing={editingDecision}
            newTopic={
              newTopic === undefined
                ? undefined
                : newTopic === '1'
                  ? null
                  : (newTopic as DecisionTopic)
            }
            lines={lines.map((l) => ({
              line: l,
              path: l.node_id === scopeId ? null : pathBelow(scopeId, l.node_id),
            }))}
            origins={origins.map((o) => ({
              origin: o,
              stageUnits:
                o.saving_stage === null ? null : (unitsAt.get(o.saving_stage) ?? null),
              title: o.node_id === scopeId ? undefined : titleOf(o.node_id),
            }))}
            reference={reference}
            pathOf={(nodeId) => pathBelow(scopeId, nodeId)}
          />
        ) : (
          <EconomicsCost
            code={codeOf(scopeId)}
            scopeTitle={scopeTitle}
            atProject={atProject}
            whole={focusNode ? `${base}/cost` : null}
            roll={roll}
            parts={parts}
            expanded={partQ ? (params.part ?? null) : null}
            unpriced={unpriced.map((d) => ({
              id: d.id,
              name: d.name,
              folder: d.folder,
              on: titleOf(d.node_id),
              priceHref: costUrl(partQ, 'line=new', `doc=${d.id}`, `on=${d.node_id}`),
            }))}
            docsTotal={docs.length}
            hrefs={{
              here,
              basis: basisUrl(),
              newLine: costUrl(partQ, 'line=new'),
              files: `${base}/dokumenter`,
              expand: (partId) => costUrl(`part=${partId}`),
              collapse: costUrl(),
              editLine: (lineId) => costUrl(partQ, `line=${lineId}`),
            }}
            form={
              lineFormOpen ? (
                <EconomicsLineForm
                  editing={editingLine}
                  targets={nodes
                    .filter((n) => inScope.has(n.id))
                    .map((n) => ({
                      id: n.id,
                      label: n.id === id ? project.title : pathBelow(id, n.id),
                    }))}
                  defaultTarget={params.on && inScope.has(params.on) ? params.on : scopeId}
                  defaultRate={Number(yard?.eur_rate ?? 7.46)}
                  documents={docsInProject.map((d) => ({ id: d.id, name: d.name }))}
                  defaultDocument={docToPrice?.id ?? editingLine?.document_id ?? null}
                  redirectTo={here}
                  cancelHref={here}
                  filesHref={`${base}/dokumenter`}
                />
              ) : null
            }
          />
        )}
      </div>

      <div className="min-w-0 border-t border-line px-[var(--gut)] py-[26px] lg:border-t-0 lg:border-l lg:py-7 lg:pl-[26px]">
        <EconomicsValue
          scopeTitle={scopeTitle}
          claimEur={claimEur}
          origin={origin}
          reference={reference}
          target={target?.eur ?? null}
          perUnit={perUnit}
          share={share}
          delivered={delivered}
          doneOn={delivered !== null ? scopeDone : null}
          serves={serves.map((s) => ({ id: s.id, name: s.name }))}
          euroStrategy={euroStrategy?.name ?? null}
          investment={investment}
          running={running}
          saving={saving}
          years={years}
          limit={limitFrom === null ? null : { name: limitFrom.name, years: limitYears }}
          missing={missing}
        />
        {/*
          The budget is where the portfolio's promise against the year lives.
          Named once, at the foot of the value column, rather than as a button
          on every row that mentions a share.
        */}
        <p className="sec-gap text-[12px] leading-[1.5] text-muted">
          What the portfolio promises against the year&rsquo;s euro lives on{' '}
          <Link href="/strategy" className="text-green underline-offset-[3px] hover:underline">
            Budget
          </Link>
          .
        </p>
      </div>
    </div>
  )
}
