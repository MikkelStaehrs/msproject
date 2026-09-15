import { Fragment } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { QueryFailure, firstError } from '@/lib/failure'
import { pathTo } from '@/lib/wbs'
import { projectOf as projectMap } from '@/lib/subtree'
import { daysBetween, today } from '@/lib/date'
import { deleteSpark, reopenSpark } from '@/lib/spark-actions'
import { Prose, formatDate } from '@/components/ui'
import { Assessment } from '@/components/assessment'
import { SparkMenu, type SparkMenuItem } from '@/components/spark-menu'
import { SparkCaptureKey } from '@/components/spark-capture-key'
import {
  SparkCapture,
  SparkDrop,
  SparkEdit,
  SparkLogOn,
  SparkPromote,
} from '@/components/spark-forms'
import { annualEur, impactOf, referenceFrom, savingFrom, stagesFrom } from '@/lib/cogs'
import {
  SPARK_SOURCE_LABEL,
  SPARK_STATES,
  WORTH_BASIS_LABEL,
  type Node,
  type Spark,
  type SparkState,
  type StageVolume,
  type Yardstick,
} from '@/lib/types'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Sparks' }

/**
 * Thoughts before they are work.
 *
 * A thought is a node before anybody has decided anything about it. This page
 * is where that deciding happens: one table of what is waiting, what each
 * thought claims in the one currency the strategy is written in, and the two
 * ways out. Promoting gives it a type, a parent and a place in the tree.
 * Dropping keeps the verdict, so the same idea does not come round again in
 * three months.
 *
 * Everything here is either typed or derived, and the derived half is never
 * stored: the euro a year and the share of the target are worked out from the
 * saving and the yardstick every time, so the column cannot disagree with the
 * figure it came from.
 */

const LISTS: [SparkState, string][] = [
  ['new', 'Unresolved'],
  ['kept', 'Became work'],
  ['dropped', 'Decided against'],
]

/** Euro, whole, grouped with a space: the concept's spelling of a figure. */
const eur = (n: number) =>
  new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 }).format(n).replace(/,/g, ' ')

const pct = (share: number) => `${(share * 100).toFixed(1)} %`

/** One line of a longer text, cut at a length rather than a word: it is a table cell. */
const clip = (text: string, at: number) => {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > at ? `${flat.slice(0, at)}…` : flat
}

export default async function SparkPage({
  searchParams,
}: {
  searchParams: Promise<{
    list?: string
    show?: string
    capture?: string
    open?: string
    assess?: string
    promote?: string
    log?: string
    drop?: string
    edit?: string
  }>
}) {
  const params = await searchParams
  const supabase = await createClient()

  const [sparkRes, nodeRes, yardstickRes, stageRes, strategyRes] = await Promise.all([
    supabase.from('spark').select('*').order('captured_at', { ascending: false }),
    supabase.from('node').select('id, parent_id, title, type').order('sort_order'),
    supabase.from('yardstick').select('*').maybeSingle(),
    supabase.from('stage_volume').select('fiscal_year, stage, units, scope'),
    supabase.from('strategy').select('id, name').order('sort_order').order('name'),
  ])

  const failure = firstError([sparkRes, nodeRes, yardstickRes, stageRes, strategyRes])
  if (failure) return <QueryFailure message={failure} />

  /*
   * The yardstick is what a saving is measured against. Absent, the page still
   * works and simply says nothing about what an idea is worth: an assessment
   * with no reference is not zero, it is not yet knowable.
   */
  const yard = yardstickRes.data as Yardstick | null
  const reference = referenceFrom(yard)
  const stages = stagesFrom((stageRes.data ?? []) as StageVolume[], yard?.fiscal_year ?? null)
  const strategies = (strategyRes.data ?? []) as { id: string; name: string }[]

  const sparks = (sparkRes.data ?? []) as Spark[]
  const nodes = (nodeRes.data ?? []) as Pick<Node, 'id' | 'parent_id' | 'title' | 'type'>[]

  /*
   * The old `?show=` still answers, because links to it exist in the log and
   * in people's browsers, and a parameter that stops working is a broken link
   * nobody reports.
   */
  const asked = params.list ?? params.show ?? 'new'
  const list: SparkState = (SPARK_STATES as readonly string[]).includes(asked)
    ? (asked as SparkState)
    : 'new'
  const here = `/spark?list=${list}`
  const at = (extra: string) => `${here}&${extra}`

  const titleOf = new Map(nodes.map((n) => [n.id, n.title]))
  const rootOf = projectMap(nodes)
  const label = (nodeId: string) => {
    const project = rootOf.get(nodeId) ?? nodeId
    const rest = pathTo(nodes, project, nodeId)
      .slice(1)
      .map((n) => titleOf.get(n) ?? '')
    return [titleOf.get(project) ?? '', ...rest].filter(Boolean).join(' › ')
  }
  const nodeOptions = nodes.map((n) => ({ id: n.id, label: label(n.id), type: n.type }))

  /*
   * What a thought claims, from its assessment and the yardstick. Null where a
   * term is missing: a saving per unit through a stage with no recorded
   * volume is not worth nothing, it is not yet known.
   */
  const figures = (s: Spark) => {
    const stage = s.saving_stage === null ? undefined : stages.find((v) => v.stage === s.saving_stage)
    const saving = savingFrom(s.saving_kind, s.saving_value, stage?.units ?? null)
    const yearly = saving && reference ? annualEur(saving, reference) : null
    const impact = saving && reference ? impactOf(saving, reference) : null
    return { worked: s.saving_kind !== null, eur: yearly, share: impact?.shareOfTarget ?? null }
  }

  const counts: Record<SparkState, number> = { new: 0, kept: 0, dropped: 0 }
  for (const s of sparks) counts[s.state] += 1

  const shown = sparks.filter((s) => s.state === list)
  const unresolved = sparks.filter((s) => s.state === 'new')
  const dropped = sparks.filter((s) => s.state === 'dropped')

  // The inbox as a whole: what it adds up to, and how much of it is still a guess.
  const claims = unresolved.map(figures)
  const claimedEur = claims.reduce((sum, f) => sum + (f.eur ?? 0), 0)
  const claimedShare = claims.reduce((sum, f) => sum + (f.share ?? 0), 0)
  const noFigure = claims.filter((f) => !f.worked).length
  const oldest = unresolved.at(-1)
  const viaClaude = unresolved.filter((s) => s.source === 'claude').length

  const opened = params.open ? shown.find((s) => s.id === params.open) : undefined
  const assessing = params.assess ? shown.find((s) => s.id === params.assess) : undefined
  const promoting = params.promote ? shown.find((s) => s.id === params.promote) : undefined
  const logging = params.log ? shown.find((s) => s.id === params.log) : undefined
  const dropping = params.drop ? shown.find((s) => s.id === params.drop) : undefined
  const editing = params.edit ? shown.find((s) => s.id === params.edit) : undefined

  /** What sits behind the `⋯`, by where the thought is in its life. */
  const menuFor = (s: Spark): SparkMenuItem[] => {
    const openIt = { label: 'Open', href: at(`open=${s.id}`) }
    const back = { label: 'Back to inbox', action: reopenSpark, fields: { id: s.id, redirectTo: here } }
    const gone = {
      label: 'Delete for good',
      action: deleteSpark,
      fields: { id: s.id, redirectTo: here },
      danger: true,
    }
    if (s.state === 'new') {
      return [
        openIt,
        { label: 'Assess it', href: at(`assess=${s.id}`) },
        { label: 'Log it on existing work', href: at(`log=${s.id}`) },
        { label: 'Edit the thought', href: at(`edit=${s.id}`) },
        { label: 'Drop it', href: at(`drop=${s.id}`), danger: true },
        gone,
      ]
    }
    if (s.state === 'kept') {
      return [
        openIt,
        ...(s.became_node_id && rootOf.has(s.became_node_id)
          ? [
              {
                label: 'Open what it became',
                href: `/p/${rootOf.get(s.became_node_id)}?focus=${s.became_node_id}`,
              },
            ]
          : []),
        back,
        gone,
      ]
    }
    return [openIt, { label: 'Edit the thought', href: at(`edit=${s.id}`) }, back, gone]
  }

  /*
   * The row, opened. Everything the table clipped, the assessment in full, and
   * what became of it. The same rendering for all three lists, because a
   * thought does not change shape by being decided about.
   */
  const Opened = ({ s }: { s: Spark }) => (
    <div className="panel panel-b max-w-[960px]">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <span className="micro text-muted">
          {SPARK_SOURCE_LABEL[s.source]} · caught {formatDate(s.captured_at.slice(0, 10))}
        </span>
        <Link href={here} className="act">
          Close
        </Link>
      </div>
      <Prose text={s.body} className="grp-gap max-w-[64ch] text-[15px]" />
      {s.note ? (
        <Prose text={s.note} className="grp-gap max-w-[64ch] text-[13px] text-muted" />
      ) : (
        <p className="grp-gap text-[12px] text-muted">No note</p>
      )}

      {s.state === 'new' && (
        <Assessment
          spark={s}
          reference={reference}
          stages={stages}
          editing={false}
          editHref={at(`assess=${s.id}`)}
          cancelHref={here}
          redirectTo={here}
        />
      )}

      {s.state === 'kept' && (
        <p className="grp-gap text-[13px]">
          {s.became_node_id && rootOf.has(s.became_node_id) ? (
            <>
              <span className="text-muted">Became </span>
              <Link
                href={`/p/${rootOf.get(s.became_node_id)}?focus=${s.became_node_id}`}
                className="text-green hover:underline"
              >
                {label(s.became_node_id)}
              </Link>
              {s.became_entry_id && <span className="text-muted">, as a line in its log</span>}
            </>
          ) : (
            // It became a node, and that node has since been deleted. The
            // record that the thought was had and acted on stays.
            <span className="text-muted">What it became is gone</span>
          )}
          {s.worth_basis && (
            <span className="text-muted">
              {' '}
              · {WORTH_BASIS_LABEL[s.worth_basis]}
              {s.worth_note ? `: ${s.worth_note}` : ''}
            </span>
          )}
        </p>
      )}

      {s.state === 'dropped' && (
        <p className={`grp-gap text-[13px] ${s.verdict ? '' : 'text-rust'}`}>
          {s.verdict ? (
            <>
              <span className="text-muted">Decided against: </span>
              {s.verdict}
            </>
          ) : (
            'No verdict written down'
          )}
        </p>
      )}
    </div>
  )

  return (
    <main>
      {/* The band: what this is, how many wait, and the way in. */}
      <div className="grid grid-cols-1 border-b border-line-strong md:grid-cols-[auto_1fr_auto]">
        <div className="lbl px-[var(--gut)] py-2.5 text-muted md:pr-6">Sparks</div>
        <div className="lbl border-t border-line px-[var(--gut)] py-2.5 text-muted md:border-l md:border-t-0 md:px-6">
          Thoughts before they are work · {counts.new} unresolved
        </div>
        <div className="flex flex-wrap items-center gap-4 border-t border-line px-[var(--gut)] py-2.5 md:border-l md:border-t-0 md:pl-6">
          <Link href={at('capture=1')} className="btn">
            Capture a thought
          </Link>
          <SparkCaptureKey />
        </div>
      </div>

      {/*
        Work area and two rails. One column on a phone, the rails stacked to
        the right from lg, and side by side above 1900 where the work area has
        stopped growing and a third column is the right answer rather than
        more air. Written here rather than through `.frame`, which is the
        label, content, margin frame and not this shape.
      */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_400px] min-[1900px]:grid-cols-[minmax(0,1fr)_400px_400px]">
        <div className="work min-w-0 px-[var(--gut)] py-[26px] lg:row-span-2 lg:py-7 lg:pr-[26px] min-[1900px]:row-span-1">
          <h1 className="text-balance text-[34px] font-semibold leading-[1.08] tracking-[-0.03em] text-green">
            Sparks
          </h1>
          <p className="prose-measure grp-gap text-green-soft">
            A thought is a node before anybody has decided anything about it.
            Promoting one gives it a type, a parent and a place in the tree.
            Dropping it keeps the verdict, so the same idea does not come round
            again in three months.
          </p>

          {params.capture && (
            <div className="grp-gap">
              <SparkCapture redirectTo={here} cancelHref={here} />
            </div>
          )}

          <div className="filterrow sec-gap">
            {LISTS.map(([state, name]) => (
              <Link
                key={state}
                href={`/spark?list=${state}`}
                aria-pressed={list === state}
              >
                {name} {counts[state]}
              </Link>
            ))}
          </div>

          <div className="panel grp-gap max-w-[1360px]">
            <table className="tbl">
              <thead>
                <tr>
                  <th className="grow">Thought</th>
                  <th className="text-right">EUR a year</th>
                  <th className="hidden text-right lg:table-cell">Share</th>
                  <th className="hidden lg:table-cell">Caught by</th>
                  <th className="hidden text-right lg:table-cell">Caught</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {shown.length === 0 && (
                  <tr>
                    <td className="grow text-muted" colSpan={6}>
                      Nothing in this list.
                    </td>
                  </tr>
                )}
                {shown.map((s) => {
                  const f = figures(s)
                  const inPlace =
                    opened?.id === s.id
                      ? 'open'
                      : assessing?.id === s.id
                        ? 'assess'
                        : promoting?.id === s.id
                          ? 'promote'
                          : logging?.id === s.id
                            ? 'log'
                            : dropping?.id === s.id
                              ? 'drop'
                              : editing?.id === s.id
                                ? 'edit'
                                : null
                  return (
                    <Fragment key={s.id}>
                      <tr>
                        <td className="grow">
                          {/* The row is the primary action: it opens the thought. */}
                          <Link href={at(`open=${s.id}`)} className="block">
                            <div className="text-[13px] font-medium">{clip(s.body, 190)}</div>
                            <div className="mt-[5px] text-[12px] leading-[1.45] text-muted">
                              {s.note ? clip(s.note, 110) : 'No note'}
                            </div>
                            {/*
                              Below lg the three metadata columns fold into the
                              row, so nothing the wide table says is lost.
                            */}
                            <div className="mono mt-[5px] text-[11px] text-muted lg:hidden">
                              {SPARK_SOURCE_LABEL[s.source]} · {formatDate(s.captured_at.slice(0, 10))}
                              {f.share !== null ? ` · ${pct(f.share)} of the year` : ''}
                            </div>
                          </Link>
                        </td>
                        <td className={`mono text-right ${f.worked ? '' : 'text-rust'}`}>
                          {!f.worked
                            ? 'Not worked out'
                            : f.eur === null
                              ? <span className="text-muted">Needs the yardstick</span>
                              : eur(f.eur)}
                        </td>
                        <td className="mono hidden text-right text-muted lg:table-cell">
                          {f.share === null ? '-' : pct(f.share)}
                        </td>
                        <td className="hidden text-muted lg:table-cell">
                          {SPARK_SOURCE_LABEL[s.source]}
                        </td>
                        <td className="mono hidden text-right text-muted lg:table-cell">
                          {formatDate(s.captured_at.slice(0, 10))}
                        </td>
                        <td>
                          <span className="inline-flex items-baseline gap-[13px] whitespace-nowrap">
                            {/*
                              A named action only where it differs from open:
                              Promote on a thought with a figure, Assess on one
                              without. A decided thought has no second verb.
                            */}
                            {s.state === 'new' && (
                              <Link
                                href={at(f.worked ? `promote=${s.id}` : `assess=${s.id}`)}
                                className="act"
                              >
                                {f.worked ? 'Promote' : 'Assess'}
                              </Link>
                            )}
                            <SparkMenu items={menuFor(s)} label={`More on: ${clip(s.body, 60)}`} />
                          </span>
                        </td>
                      </tr>
                      {inPlace && (
                        <tr className="hover:!bg-inset">
                          <td className="grow" colSpan={6}>
                            {inPlace === 'open' && <Opened s={s} />}
                            {inPlace === 'assess' && (
                              <Assessment
                                spark={s}
                                reference={reference}
                                stages={stages}
                                editing
                                editHref={at(`assess=${s.id}`)}
                                cancelHref={here}
                                redirectTo={here}
                              />
                            )}
                            {inPlace === 'promote' && (
                              <SparkPromote
                                spark={s}
                                nodes={nodeOptions}
                                strategies={strategies}
                                stages={stages}
                                redirectTo={here}
                                cancelHref={here}
                              />
                            )}
                            {inPlace === 'log' && (
                              <SparkLogOn
                                spark={s}
                                nodes={nodeOptions}
                                redirectTo={here}
                                cancelHref={here}
                              />
                            )}
                            {inPlace === 'drop' && (
                              <SparkDrop spark={s} redirectTo={here} cancelHref={here} />
                            )}
                            {inPlace === 'edit' && (
                              <SparkEdit spark={s} redirectTo={here} cancelHref={here} />
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Rail 1: what the inbox adds up to. */}
        <div className="min-w-0 border-t border-line px-[var(--gut)] py-[26px] lg:border-l lg:border-t-0 lg:px-[26px] lg:py-7 lg:pr-[var(--gut)] min-[1900px]:pr-[26px]">
          <h2 className="text-[15px] font-semibold tracking-[-0.02em]">What the inbox claims</h2>
          <div className="panel grp-gap">
            <table className="tbl">
              <tbody>
                <tr>
                  <td className="grow">Claimed a year</td>
                  <td className={`mono text-right ${claimedEur > 0 ? '' : 'text-rust'}`}>
                    {claimedEur > 0 ? `${eur(claimedEur)} EUR` : 'Nothing yet'}
                  </td>
                </tr>
                <tr>
                  <td className="grow">Of the year&rsquo;s target</td>
                  <td className="mono text-right text-muted">
                    {claimedShare > 0 ? pct(claimedShare) : '-'}
                  </td>
                </tr>
                <tr>
                  <td className={`grow ${noFigure > 0 ? 'text-rust' : ''}`}>Carry no figure</td>
                  <td className={`mono text-right ${noFigure > 0 ? 'text-rust' : ''}`}>
                    {noFigure} of {counts.new}
                  </td>
                </tr>
                <tr>
                  <td className="grow">Oldest waited</td>
                  <td className="mono text-right">
                    {oldest
                      ? `${daysBetween(oldest.captured_at.slice(0, 10), today())} days`
                      : '-'}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          {/*
            The note says what the figures cannot: where the thoughts came
            from and whether the ranking this page exists to produce can be
            produced at all. Derived, so it stops saying it the day it stops
            being true.
          */}
          <p className="grp-gap max-w-[64ch] text-[12px] leading-[1.5] text-muted">
            {counts.new === 0
              ? 'Nothing is waiting. An empty inbox is the normal state rather than an achievement to protect.'
              : [
                  viaClaude === counts.new
                    ? 'Every one of them came in through Claude.'
                    : viaClaude > 0
                      ? `${viaClaude} of them came in through Claude.`
                      : null,
                  noFigure === counts.new
                    ? 'Not one has been assessed, so the ranking this page exists to produce cannot be produced.'
                    : noFigure > 0
                      ? `${noFigure} still carry no figure, so the ranking is only as complete as the ones that do.`
                      : 'Every one has been assessed.',
                ]
                  .filter(Boolean)
                  .join(' ')}
          </p>
        </div>

        {/* Rail 2: the verdicts, which are the reason a dropped thought is kept. */}
        <div className="min-w-0 border-t border-line px-[var(--gut)] py-[26px] lg:border-l lg:px-[26px] lg:py-7 lg:pr-[var(--gut)] min-[1900px]:border-t-0">
          <h2 className="text-[15px] font-semibold tracking-[-0.02em]">Decided against</h2>
          {dropped.length === 0 ? (
            <p className="prose-measure grp-gap text-green-soft">
              Nothing has been dropped yet. The verdict on a dead idea is what
              stops it arriving again in three months, so an empty list here is
              a list that has not been used rather than a clean one.
            </p>
          ) : (
            <div className="panel panel-list grp-gap">
              {dropped.map((s) => (
                <Link key={s.id} href={`/spark?list=dropped&open=${s.id}`} className="block">
                  <div className="text-[13px] leading-[1.4]">{clip(s.body, 110)}</div>
                  <div
                    className={`mt-[5px] text-[12px] leading-[1.45] ${
                      s.verdict ? 'text-muted' : 'text-rust'
                    }`}
                  >
                    {s.verdict ?? 'No verdict written down'}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
