import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { QueryFailure, firstError } from '@/lib/failure'
import {
  annualEur,
  referenceFrom,
  savingFrom,
  stagesFrom,
  strategyTarget,
  targetAnnual,
} from '@/lib/cogs'
import { contributionOf, strategyPicture, type Marking } from '@/lib/strategy'
import { subtreeSet } from '@/lib/subtree'
import { StrategyForm } from '@/components/budget-strategy-form'
import { formatDate } from '@/components/ui'
import type {
  Node,
  NodeCost,
  StageVolume,
  Spark,
  Strategy,
  StrategyNode,
  Yardstick,
} from '@/lib/types'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Budget' }

/**
 * What the work is FOR, one level above the projects.
 *
 * A company strategy is fed by pieces of several unrelated projects, so it can
 * never be read off one of them. This is the only page that cuts the tree that
 * way, and the question it answers is the one a strategy owner is actually
 * asked: how much of it have you got, and how much of that is real yet.
 */
export default async function StrategyPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string; new?: string }>
}) {
  const { edit: editId, new: creating } = await searchParams
  const supabase = await createClient()

  const [strategyRes, markRes, nodeRes, costRes, yardRes, stageRes, sparkRes] = await Promise.all([
    supabase.from('strategy').select('*').order('sort_order').order('name'),
    supabase.from('v_strategy_node').select('*'),
    supabase.from('node').select('*').order('sort_order'),
    supabase.from('v_node_cost').select('*'),
    supabase.from('yardstick').select('*').maybeSingle(),
    supabase.from('stage_volume').select('fiscal_year, stage, units, scope'),
    supabase.from('spark').select('*').eq('state', 'new'),
  ])

  const failure = firstError([strategyRes, markRes, nodeRes, costRes, sparkRes])
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

  const strategies = (strategyRes.data ?? []) as Strategy[]
  const marks = (markRes.data ?? []) as StrategyNode[]
  const nodes = (nodeRes.data ?? []) as Node[]
  const rolls = new Map(((costRes.data ?? []) as NodeCost[]).map((r) => [r.node_id, r]))
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const sparks = (sparkRes.data ?? []) as Spark[]

  /**
   * The expected annual benefit is typed on the PROJECT under Identity, so only
   * a marked project has one of its own. A marked subproject has to carry a
   * figure on the marking, and where it does not, the contribution is unknown.
   */
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
    const roll = rolls.get(m.node_id)
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
      investedEur: Number(roll?.once_committed ?? 0),
    }
  }

  /*
   * The picture per strategy, and the portfolio's own sum.
   *
   * `strategyPicture` is the one place the arithmetic lives, so the page never
   * adds a euro of its own. A project can be marked against two strategies, so
   * the portfolio total is taken over the markings that count rather than by
   * adding the per-strategy sums, which would count that project twice.
   */
  const picture = new Map(
    strategies.map((s) => [
      s.id,
      strategyPicture(
        marks.filter((m) => m.strategy_id === s.id).map(markingFor),
        strategyTarget(s, reference),
      ),
    ]),
  )

  const counted = marks.filter((m) => m.is_top)
  const seen = new Set<string>()
  let promised = 0
  let delivered = 0
  let unquantified = 0
  for (const m of counted) {
    if (seen.has(m.node_id)) continue
    seen.add(m.node_id)
    const mk = markingFor(m)
    const c = contributionOf(mk)
    if (c === null) {
      unquantified++
      continue
    }
    promised += c
    if (mk.status === 'done') delivered += c
  }

  /*
   * What is sitting in the inbox, worked out but not yet work. A spark with no
   * saving contributes nothing rather than nought: the two are different, and
   * this portfolio is entirely the first kind.
   */
  let inSparks = 0
  let sparksWithout = 0
  for (const s of sparks) {
    const stage = stages.find((v) => v.stage === s.saving_stage)
    const saving = savingFrom(s.saving_kind, s.saving_value, stage?.units ?? null)
    const eur = saving === null || reference === null ? null : annualEur(saving, reference)
    if (eur === null) sparksWithout++
    else inSparks += eur
  }

  const target = reference === null ? null : targetAnnual(reference)
  const unitEur = yard === null ? null : Number(yard.unit_cost_dkk) / Number(yard.eur_rate)

  /** What each project promises, over every marking inside it. */
  const projectClaim = (projectId: string) => {
    const inside = subtreeSet(nodes, projectId)
    const mine = counted.filter((m) => inside.has(m.node_id))
    if (mine.length === 0) return { eur: null as number | null, unknown: 0 }
    let eur: number | null = null
    let unknown = 0
    for (const m of mine) {
      const c = contributionOf(markingFor(m))
      if (c === null) unknown++
      else eur = (eur ?? 0) + c
    }
    return { eur, unknown }
  }

  const servesOf = (projectId: string) => {
    const inside = subtreeSet(nodes, projectId)
    const names = strategies
      .filter((s) => marks.some((m) => m.strategy_id === s.id && inside.has(m.node_id)))
      .map((s) => s.name)
    return names.length === 0 ? null : names.join(', ')
  }

  const roots = nodes.filter((n) => n.parent_id === null)
  const editing = editId ? strategies.find((s) => s.id === editId) : undefined

  const eur = (v: number) =>
    `${Math.round(v).toLocaleString('en-GB').replace(/,/g, ' ')} EUR`

  return (
    <main>
      {/* The yardstick everything on this page is divided by */}
      <div className="grid grid-cols-1 border-b border-line-strong lg:grid-cols-[auto_1fr_auto]">
        <div className="lbl px-[var(--gut)] py-2.5 text-muted lg:pr-6">Budget</div>
        <div className="lbl border-t border-line px-[var(--gut)] py-2.5 lg:border-l lg:border-t-0 lg:px-6">
          {yard === null ? (
            <span className="text-oxblood">no yardstick recorded, so nothing can be divided</span>
          ) : (
            <span className="text-ink">
              {yard.fiscal_year} &middot;{' '}
              {Number(yard.cost_basis_units).toLocaleString('en-GB').replace(/,/g, ' ')} units
              &middot; {String(yard.unit_cost_dkk).replace('.', ',')} kr a unit &middot; 1 EUR ={' '}
              {String(yard.eur_rate).replace('.', ',')} kr
            </span>
          )}
        </div>
        <div className="flex items-center justify-end gap-5 border-t border-line px-[var(--gut)] py-2.5 lg:border-l lg:border-t-0">
          <span className="micro text-muted">Rolled up from the nodes</span>
          <Link href="/strategy?new=1" className="act">
            New strategy
          </Link>
        </div>
      </div>

      {(creating || editing) && (
        <div className="px-[var(--gut)] py-6">
          <StrategyForm strategy={editing} reference={reference} />
        </div>
      )}

      <div className="px-[var(--gut)] py-7">
        <div className="work">
          <h1 className="font-display text-[34px] leading-[1.08] text-green">
            One euro out of every unit
          </h1>
          <p className="prose-measure grp-gap text-green-soft">
            Take a euro of cost out of every unit sold, every year.{' '}
            {yard === null ? (
              <>
                No yardstick has been recorded, so there is no target to divide by and no
                figure on this page can be worked out.
              </>
            ) : (
              <>
                {yard.fiscal_year} counts{' '}
                {Number(yard.cost_basis_units).toLocaleString('en-GB').replace(/,/g, ' ')} units
                at {String(yard.unit_cost_dkk).replace('.', ',')} kr all in, so the target is{' '}
                {target === null ? 'unknown' : eur(target.eur)} a year and{' '}
                {unitEur === null ? 'an unknown share' : `${(100 / unitEur).toFixed(1).replace('.', ',')} %`}{' '}
                of what a unit costs. Nothing on this page is typed in.
              </>
            )}
          </p>
        </div>
      </div>

      {/* Five figures, and four of them are rust because nothing has been marked */}
      <div className="grid grid-cols-2 border-y border-line-strong lg:grid-cols-5">
        <Figure
          value={target === null ? null : Math.round(target.eur)}
          label="Target a year, EUR"
        />
        <Figure value={Math.round(promised)} label="Promised by live work" rust={promised === 0} />
        <Figure value={Math.round(delivered)} label="Delivered" rust={delivered === 0} />
        <Figure value={Math.round(inSparks)} label="Worked out in sparks" rust={inSparks === 0} />
        <Figure
          value={target === null ? null : Math.round(target.eur - promised)}
          label="Still to find"
          rust
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="min-w-0 px-[var(--gut)] py-7">
          <div className="work">
            <h2 className="text-[17px] font-semibold tracking-[-0.025em]">
              Where the euro comes from
            </h2>
            <div className="panel grp-gap max-w-[1120px]">
              <table className="tbl">
                <thead>
                  <tr>
                    <th className="grow">Project</th>
                    <th>Serves</th>
                    <th className="num">EUR a year</th>
                    <th className="num">EUR a unit</th>
                    <th className="num">Share</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {roots.map((r) => {
                    const claim = projectClaim(r.id)
                    const serves = servesOf(r.id)
                    const perUnit =
                      claim.eur === null || yard === null
                        ? null
                        : claim.eur / Number(yard.cost_basis_units)
                    const share =
                      claim.eur === null || target === null ? null : (100 * claim.eur) / target.eur
                    return (
                      <tr key={r.id}>
                        <td className="grow">
                          <Link href={`/p/${r.id}/identitet`} className="font-medium hover:text-green">
                            {r.title}
                          </Link>
                          <div className="mt-1 text-[12px] text-muted">
                            {(r.reporting?.project_no as string | undefined) ?? ''}
                          </div>
                        </td>
                        <td>
                          {serves ? (
                            serves
                          ) : (
                            <span className="text-oxblood">Not marked</span>
                          )}
                        </td>
                        <td className="num mono">
                          {claim.eur === null ? (
                            <span className="text-oxblood">Nothing claimed</span>
                          ) : (
                            eur(claim.eur)
                          )}
                        </td>
                        <td className="num mono text-muted">
                          {perUnit === null ? '-' : perUnit.toFixed(3).replace('.', ',')}
                        </td>
                        <td className="num mono text-muted">
                          {share === null ? '-' : `${share.toFixed(1).replace('.', ',')} %`}
                        </td>
                        <td>
                          <Link href={`/p/${r.id}`} className="act">
                            Work
                          </Link>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {counted.length === 0 && (
              <p className="prose-measure grp-gap text-[12px] text-muted">
                No piece of work is marked against a strategy, so this table has nothing to add
                up. The {strategies.length} strategies exist; the link from work to strategy has
                never been made. It is made on a part, under Read, which is where somebody can
                say what that part is for.
              </p>
            )}

            <h2 className="sec-gap text-[17px] font-semibold tracking-[-0.025em]">
              What a unit costs
            </h2>
            <div className="panel grp-gap max-w-[1120px]">
              <table className="tbl">
                <tbody>
                  {yard === null || unitEur === null ? (
                    <tr>
                      <td className="grow text-oxblood">
                        No yardstick, so a unit has no recorded cost here.
                      </td>
                    </tr>
                  ) : (
                    <>
                      <tr>
                        <td className="grow">Unit cost, all in</td>
                        <td className="num mono">
                          {unitEur.toFixed(2).replace('.', ',')} EUR
                        </td>
                        <td className="num mono text-muted">100 %</td>
                      </tr>
                      <tr>
                        <td className="grow">The target, one euro</td>
                        <td className="num mono">1,00 EUR</td>
                        <td className="num mono text-muted">
                          {(100 / unitEur).toFixed(1).replace('.', ',')} %
                        </td>
                      </tr>
                      <tr>
                        <td className={`grow ${promised === 0 ? 'text-oxblood' : ''}`}>
                          Promised so far
                        </td>
                        <td className={`num mono ${promised === 0 ? 'text-oxblood' : ''}`}>
                          {(promised / Number(yard.cost_basis_units)).toFixed(2).replace('.', ',')}{' '}
                          EUR
                        </td>
                        <td className={`num mono ${promised === 0 ? 'text-oxblood' : 'text-muted'}`}>
                          {target === null
                            ? '-'
                            : `${((100 * promised) / target.eur).toFixed(1).replace('.', ',')} %`}
                        </td>
                      </tr>
                    </>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="min-w-0 border-t border-line px-[var(--gut)] py-7 xl:border-l xl:border-t-0">
          {yard !== null && yard.confirmed_at === null && (
            <>
              <h2 className="text-[15px] font-semibold text-oxblood">The figure is unconfirmed</h2>
              <div className="panel grp-gap border-oxblood">
                <div className="panel-b">
                  {yard.cost_basis_scope && yard.target_scope && (
                    <p className="prose-measure text-[13px]">
                      Basis: {yard.cost_basis_scope}. The strategy covers {yard.target_scope}. The
                      two do not match, so the denominator is too small, the target too small with
                      it, and every share of that target too large. This page says floor, not
                      figure.
                    </p>
                  )}
                  <p className="prose-measure mt-3 text-[13px]">
                    The euro rate of {String(yard.eur_rate).replace('.', ',')} was raised and
                    accepted rather than verified. It multiplies into every conversion on this
                    page.
                  </p>
                  <p className="prose-measure mt-3 text-[13px]">
                    Nobody has confirmed the row. Last touched{' '}
                    {formatDate(yard.updated_at.slice(0, 10))}.
                  </p>
                </div>
              </div>
            </>
          )}

          <h2 className={`text-[15px] font-semibold ${yard !== null && yard.confirmed_at === null ? 'sec-gap' : ''}`}>
            The {strategies.length} strategies
          </h2>
          <div className="panel grp-gap">
            <table className="tbl">
              <tbody>
                {strategies.map((s) => {
                  const p = picture.get(s.id)
                  return (
                    <tr key={s.id}>
                      <td className="grow">
                        <Link href={`/strategy/${s.id}`} className="font-medium hover:text-green">
                          {s.name}
                        </Link>
                        <div className="mt-1 text-[12px] leading-snug text-muted">
                          {clip(s.description, 120)}
                        </div>
                      </td>
                      <td
                        className={`num mono ${
                          s.target_from_yardstick ? '' : 'text-muted'
                        }`}
                      >
                        {s.target_from_yardstick
                          ? target === null
                            ? 'no yardstick'
                            : eur(target.eur)
                          : s.target_annual === null
                            ? 'No number'
                            : eur(Number(s.target_annual))}
                      </td>
                      <td
                        className={`num mono ${
                          (p?.counted ?? 0) === 0 ? 'text-oxblood' : 'text-muted'
                        }`}
                      >
                        {p?.counted ?? 0} parts
                      </td>
                      <td>
                        <Link href={`/strategy?edit=${s.id}`} className="act">
                          Edit
                        </Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p className="prose-measure grp-gap text-[12px] text-muted">
            {strategies.filter((s) => !s.target_from_yardstick).length} of them are headings
            rather than promises, which is deliberate: a heading carries no annual number of its
            own.{' '}
            {unquantified > 0 &&
              `${unquantified} marked ${unquantified === 1 ? 'part carries' : 'parts carry'} no figure, so the total above is a floor.`}
            {sparksWithout > 0 &&
              ` ${sparksWithout} ${sparksWithout === 1 ? 'spark has' : 'sparks have'} never been assessed.`}
          </p>
        </div>
      </div>
    </main>
  )
}

/** A key figure: the number in mono, the label under it, a rule between them. */
function Figure({
  value,
  label,
  rust = false,
}: {
  value: number | null
  label: string
  rust?: boolean
}) {
  return (
    <div className="border-l border-line px-6 py-[18px] first:border-l-0 lg:[&:nth-child(3)]:border-l">
      <b className={`fig-num block ${rust ? 'text-oxblood' : ''}`}>
        {value === null ? '-' : value.toLocaleString('en-GB').replace(/,/g, ' ')}
      </b>
      <span className="mt-2 block text-[12px] text-muted">{label}</span>
    </div>
  )
}

/** Cut at a word boundary, so a description never breaks mid-word. */
function clip(text: string | null, max: number) {
  const t = (text ?? '').replace(/\s+/g, ' ').trim()
  if (t.length <= max) return t
  const cut = t.slice(0, max)
  const space = cut.lastIndexOf(' ')
  return `${(space > max * 0.5 ? cut.slice(0, space) : cut).replace(/[,;:.-]$/, '')}…`
}