import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { QueryFailure, firstError } from '@/lib/failure'
import { addDays, daysBetween, today as todayIso } from '@/lib/date'
import { looseEnds } from '@/lib/loose-ends'
import {
  agenda,
  attendees,
  movement,
  AGENDA_LABEL,
  AGENDA_ORDER,
  CADENCE_DAYS,
  type AgendaItem,
} from '@/lib/standup'
import { holdStandup, reopenStandup } from '@/lib/standup-actions'
import {
  impactOf,
  referenceFrom,
  savingFrom,
  stagesFrom,
  targetAnnual,
} from '@/lib/cogs'
import { priorityScore, quadrant } from '@/lib/priority'
import { formatMoney } from '@/lib/cost'
import { BlockerForm, ResolveBlockerForm } from '@/components/blocker-form'
import { DecisionForm } from '@/components/decision-form'
import { AgreedHere } from '@/components/agreed-here'
import { DueDate } from '@/components/due-date'
import { NodeForm } from '@/components/node-form'
import { QuickAddOn } from '@/components/quick-add-on'
import { QuickAddTrigger } from '@/components/quick-add-trigger'
import { StatusSelect } from '@/components/status-select'
import {
  Prose,
  Rule,
  StatusMark,
  formatDate,
  formatDateLong,
  relativeDays,
} from '@/components/ui'
import {
  COST_BUDGET_LABEL,
  COST_STATE_LABEL,
  DECISION_TOPIC_LABEL,
  STATUS_LABEL,
  TYPE_LABEL,
  type BlockerDays,
  type Cost,
  type Decision,
  type Entry,
  type Node,
  type NodeCost,
  type NodeReady,
  type NodeState,
  type Spark,
  type StageVolume,
  type Standup,
  type Yardstick,
} from '@/lib/types'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Stand-up' }

const weekday = new Intl.DateTimeFormat('en-GB', {
  weekday: 'long',
  day: 'numeric',
  month: 'short',
})

const kr = (n: number) =>
  new Intl.NumberFormat('da-DK', { maximumFractionDigits: 0 }).format(n)

type Part = '1' | '2' | '3'

/**
 * The weekly stand-up.
 *
 * Three chapters, walked in the order a stand-up actually runs: what moved
 * since last time, what has to happen before next time, and which idea is ready
 * to stop being an idea.
 *
 * THE MIDDLE ONE IS A WORKING SURFACE, not a list to read out. It was a list
 * first, and that was the mistake: the agenda picked exactly the right things
 * to talk about and then made you leave the page to do anything about them,
 * which in a meeting is one click too many and, in practice, means the thing
 * does not get done. So it is the meeting screen's shape - the pieces on the
 * left, the one under discussion filling the right - with the difference that
 * matters here: the left is the ranked agenda ACROSS EVERY PROJECT rather than
 * the children of one node. A stand-up is not about a project.
 *
 * Nothing on the agenda is ticked off. An item leaves by being answered, which
 * is why every answer is on this page: the status, the date, the blocker, the
 * line in the log.
 */
export default async function StandupPage({
  searchParams,
}: {
  searchParams: Promise<{
    part?: Part
    task?: string
    edit?: string
    bnew?: string
    bresolve?: string
    dnew?: string
    agree?: string
  }>
}) {
  const {
    /*
     * Chapter two by default, not one. The meeting is walked 1, 2, 3 and the
     * numbers say so, but the page you want open when you arrive is the one
     * holding the work: chapter one is a read of what already happened, and
     * landing on it meant the portfolio was always one click away.
     */
    part = '2',
    task: taskId,
    edit: editId,
    bnew: newBlocker,
    bresolve: resolveBlocker,
    dnew: newDecision,
    agree: agreeing,
  } = await searchParams

  const supabase = await createClient()
  const today = todayIso()

  const [
    nodeRes, readyRes, stateRes, blockerRes, entryRes, decisionRes, costRollRes,
    lineRes, descendantRes, standupRes, sparkRes, yardstickRes, stageRes,
  ] = await Promise.all([
    supabase.from('node').select('*').order('sort_order'),
    supabase.from('v_node_ready').select('*'),
    supabase.from('v_node_state').select('*'),
    supabase.from('v_blocker_days').select('*'),
    supabase.from('entry').select('*').order('entry_date', { ascending: false }),
    supabase.from('decision').select('*').order('decided_on', { ascending: false }),
    supabase.from('v_node_cost').select('*'),
    supabase.from('cost').select('*').order('dated', { ascending: false }),
    supabase.from('v_node_descendant').select('root_id, node_id'),
    supabase.from('standup').select('*').order('held_on', { ascending: false }).limit(8),
    supabase.from('spark').select('*').eq('state', 'new'),
    supabase.from('yardstick').select('*').maybeSingle(),
    supabase.from('stage_volume').select('fiscal_year, stage, units'),
  ])

  const failure = firstError([
    nodeRes, readyRes, stateRes, blockerRes, entryRes, decisionRes, descendantRes, standupRes,
  ])
  if (failure) return <QueryFailure message={failure} />

  const nodes = (nodeRes.data ?? []) as Node[]
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const blockers = (blockerRes.data ?? []) as BlockerDays[]
  const entries = (entryRes.data ?? []) as Entry[]
  const decisions = (decisionRes.data ?? []) as Decision[]
  const lines = (lineRes.data ?? []) as Cost[]
  const held = (standupRes.data ?? []) as Standup[]

  const state = new Map(((stateRes.data ?? []) as NodeState[]).map((s) => [s.node_id, s]))
  const readyBy = new Map(((readyRes.data ?? []) as NodeReady[]).map((r) => [r.node_id, r]))
  const cost = new Map(((costRollRes.data ?? []) as NodeCost[]).map((c) => [c.node_id, c]))

  /*
   * The boundary. Null where no stand-up has ever been held, which is not the
   * same as a quiet week: the first meeting should have the whole history in
   * front of it, and a fallback date would hide that.
   */
  const heldToday = held.find((h) => h.held_on === today) ?? null
  const previous = held.find((h) => h.held_on !== today) ?? null
  const since = (heldToday ? previous?.held_on : held[0]?.held_on) ?? null
  const nextOn = addDays(today, CADENCE_DAYS)

  const loose = looseEnds({
    nodes: nodes.map((n) => ({
      id: n.id,
      title: n.title,
      type: n.type,
      status: n.status,
      due_date: n.due_date,
      completed_at: n.completed_at,
    })),
    entries,
    decisions,
    blockers,
    today,
  })

  const items = agenda({
    nodes,
    blockers,
    ready: new Map([...readyBy].map(([k, v]) => [k, v.is_ready])),
    looseEnds: loose.map((l) => ({ nodeId: l.nodeId, what: l.what, on: l.on })),
    today,
  })
  const room = attendees(items)
  const moved = movement({ nodes, blockers, entries }, since)

  /*
   * What the room asked for last time, and what became of it.
   *
   * Derived from a stamp rather than kept as minutes. The status beside each
   * line is the task's own, so a thing that got done reads as done without
   * anybody going back to a document to say so - which is the single reason
   * minutes stop being true by the second meeting.
   */
  const lastStandup = heldToday ? previous : (held[0] ?? null)
  const agreedLast = lastStandup
    ? {
        lines: entries.filter((e) => e.standup_id === lastStandup.id),
        tasks: nodes.filter((n) => n.standup_id === lastStandup.id),
        decisions: decisions.filter((d) => d.standup_id === lastStandup.id),
      }
    : null

  // Which project a node belongs to, so a row can say where it lives.
  const rootIds = new Set(nodes.filter((n) => n.parent_id === null).map((n) => n.id))
  const projectOf = new Map<string, string>()
  for (const d of (descendantRes.data ?? []) as { root_id: string; node_id: string }[]) {
    if (rootIds.has(d.root_id)) projectOf.set(d.node_id, d.root_id)
  }
  const projectTitle = (nodeId: string) =>
    byId.get(projectOf.get(nodeId) ?? nodeId)?.title ?? ''

  /*
   * One row per NODE on the left, not one per reason. A task with two blockers
   * and a missed date is one conversation, and three rows for it would push the
   * next person's item off the screen.
   */
  const rows: { nodeId: string; lead: AgendaItem; also: AgendaItem[] }[] = []
  const seen = new Map<string, number>()
  for (const item of items) {
    const at = seen.get(item.nodeId)
    if (at === undefined) {
      seen.set(item.nodeId, rows.length)
      rows.push({ nodeId: item.nodeId, lead: item, also: [] })
    } else {
      rows[at].also.push(item)
    }
  }

  /*
   * EVERYTHING ELSE THAT IS ALIVE, and this is the correction that mattered.
   *
   * The agenda ranks what needs action, and on the real portfolio that came to
   * four pieces out of thirty five: twenty five of them carry no date at all
   * and sit at status «idea», so not one of the dated rules could see them. A
   * stand-up screen that shows a ninth of the work is not a stand-up screen,
   * however well the ninth is chosen.
   *
   * So the rail carries both. What needs action stays at the top, ranked; the
   * rest follows underneath, by project, in tree order. Nothing is behind a
   * toggle, because a toggle is where the twenty five would go to be forgotten
   * again.
   */
  const onAgenda = new Set(rows.map((r) => r.nodeId))
  const OVER = new Set(['done', 'cancelled'])

  const depthOf = new Map<string, number>()
  const childrenOf = new Map<string, Node[]>()
  for (const n of nodes) {
    if (n.parent_id !== null) {
      childrenOf.set(n.parent_id, [...(childrenOf.get(n.parent_id) ?? []), n])
    }
  }
  const walk = (nodeId: string, depth: number, into: Node[]) => {
    for (const kid of childrenOf.get(nodeId) ?? []) {
      depthOf.set(kid.id, depth)
      if (!OVER.has(kid.status)) into.push(kid)
      walk(kid.id, depth + 1, into)
    }
  }

  /** Every live project, with everything alive underneath it in tree order. */
  const portfolio = nodes
    .filter((n) => n.parent_id === null && !OVER.has(n.status))
    .map((project) => {
      const pieces: Node[] = []
      walk(project.id, 1, pieces)
      return { project, pieces }
    })

  const liveCount = portfolio.reduce((n, p) => n + p.pieces.length, 0)

  /** The order Prev and Next walk: the agenda first, then the rest. */
  const order = [
    ...rows.map((r) => r.nodeId),
    ...portfolio.flatMap((p) => [p.project.id, ...p.pieces.map((n) => n.id)]),
  ].filter((id, i, all) => all.indexOf(id) === i)

  const selected = (taskId ? byId.get(taskId) : undefined) ?? byId.get(order[0] ?? '')
  const index = selected ? order.indexOf(selected.id) : -1
  const prev = index > 0 ? byId.get(order[index - 1]) : undefined
  const next = index >= 0 && index < order.length - 1 ? byId.get(order[index + 1]) : undefined
  const reasons = selected
    ? (() => {
        const row = rows.find((r) => r.nodeId === selected.id)
        return row ? [row.lead, ...row.also] : []
      })()
    : []

  const closing = resolveBlocker
    ? blockers.find((b) => b.id === resolveBlocker && b.is_active)
    : undefined

  const here = (p: Part, extra = '') =>
    `/standup?part=${p}${extra ? `&${extra}` : ''}`
  const at = (nodeId: string, extra = '') =>
    here('2', `task=${nodeId}${extra ? `&${extra}` : ''}`)

  // --- Chapter three: which idea is worth becoming work ---------------------
  const yard = yardstickRes.data as Yardstick | null
  const reference = referenceFrom(yard)
  const unitsAt = new Map(
    stagesFrom((stageRes.data ?? []) as StageVolume[], yard?.fiscal_year ?? null).map(
      (v) => [v.stage, v.units],
    ),
  )
  const target = reference ? targetAnnual(reference) : null

  const sparks = (sparkRes.data ?? []) as Spark[]
  const weighed = sparks
    .map((s) => {
      const saving = savingFrom(
        s.saving_kind,
        s.saving_value,
        s.saving_stage === null ? null : (unitsAt.get(s.saving_stage) ?? null),
      )
      const judgement = {
        cost: s.cost_score,
        benefit: s.benefit_score,
        complexity: s.complexity_score,
      }
      return {
        spark: s,
        impact: saving && reference ? impactOf(saving, reference) : null,
        score: priorityScore(judgement),
        where: quadrant(judgement),
      }
    })
    .filter((w) => w.impact !== null || w.score !== null)
    .sort(
      (a, b) =>
        (b.impact?.shareOfTarget ?? -1) - (a.impact?.shareOfTarget ?? -1) ||
        (b.score ?? -99) - (a.score ?? -99),
    )
  const unweighed = sparks.length - weighed.length

  const needsAction = items.filter((i) => i.kind !== 'loose_end').length

  return (
    <main>
      {/* Context band */}
      <div className="frame">
        <div className="lbl pl-5 lg:pl-16 py-3 pr-5 text-muted">
          {weekday.format(new Date())}
        </div>
        <div className="lbl border-l border-rule px-5 lg:px-10 py-3 text-muted">
          {since ? `Since ${formatDate(since)}` : 'First stand-up'} · {needsAction}{' '}
          {needsAction === 1 ? 'thing needs' : 'things need'} action · {room.length}{' '}
          {room.length === 1 ? 'person' : 'people'} needed
        </div>
        <div className="flex items-center justify-end gap-6 border-l border-rule py-3 pl-5 lg:pl-8 pr-5 lg:pr-16">
          {heldToday ? (
            <form action={reopenStandup} className="flex items-center gap-3">
              <input type="hidden" name="id" value={heldToday.id} />
              <input type="hidden" name="redirectTo" value={here(part)} />
              <span className="lbl-tight text-green">Held today</span>
              <button className="lbl text-rule-strong hover:text-ink">Undo</button>
            </form>
          ) : (
            <form action={holdStandup}>
              <input type="hidden" name="redirectTo" value={here(part)} />
              <button className="lbl text-muted hover:text-ink">We held it</button>
            </form>
          )}
          <QuickAddTrigger />
        </div>
      </div>
      <Rule strong />

      {/* The three chapters, in the order the room walks them */}
      <nav className="flex flex-wrap items-baseline gap-x-9 gap-y-2 px-5 lg:px-16 py-3.5">
        {(
          [
            ['1', 'Since last time', moved.completed.length + moved.resolved.length + moved.opened.length],
            ['2', 'Until next time', liveCount],
            ['3', 'From spark to idea', weighed.length],
          ] as [Part, string, number][]
        ).map(([n, label, count]) => (
          <Link
            key={n}
            href={here(n)}
            className={`flex items-baseline gap-2.5 ${
              part === n ? 'text-ink' : 'text-muted hover:text-ink'
            }`}
          >
            <span className={`num text-[17px] ${part === n ? '' : 'text-rule-strong'}`}>
              {n}
            </span>
            <span
              className={`text-[13px] ${part === n ? 'border-b border-ink pb-0.5 font-medium' : ''}`}
            >
              {label}
            </span>
            <span className="lbl-tight tabular-nums text-rule-strong">
              {n === '2' && rows.length > 0 ? `${rows.length} / ${count}` : count}
            </span>
          </Link>
        ))}
      </nav>
      <Rule />

      {/* ================= 1. Since last time ================= */}
      {part === '1' && (
        <div className="frame min-h-[60vh]">
          <div className="pl-5 lg:pl-16 py-8 pr-5">
            <h1 className="font-display text-[30px] font-medium leading-[1.06]">
              Since last time
            </h1>
            <dl className="mt-5 text-[11px] leading-relaxed text-muted">
              <dt className="lbl-tight">Last held</dt>
              <dd className="mb-3 text-ink">
                {previous || heldToday ? (
                  formatDateLong((heldToday ?? previous)!.held_on)
                ) : (
                  <span className="text-rule-strong">never</span>
                )}
              </dd>
              <dt className="lbl-tight">Next</dt>
              <dd className="text-ink">{formatDateLong(nextOn)}</dd>
            </dl>
            <p className="mt-5 max-w-[24ch] text-[11px] leading-relaxed text-rule-strong">
              {since
                ? 'Measured from the day the room last met, not from a week ago. Skip a week and this still tells the truth.'
                : 'No stand-up has been recorded, so this is the whole history rather than a week of it.'}
            </p>
          </div>

          <div className="border-l border-rule px-5 lg:px-10 py-8">
            <div className="grid gap-x-8 gap-y-7 md:grid-cols-3">
              <Moved
                title="Finished"
                empty="Nothing was completed."
                rows={moved.completed.map((c) => ({
                  key: c.nodeId + c.on,
                  on: c.on,
                  text: c.title,
                  href: at(c.nodeId),
                }))}
              />
              <Moved
                title="Came unstuck"
                empty="No blocker was resolved."
                rows={moved.resolved.map((r, i) => ({
                  key: r.title + i,
                  on: r.on,
                  text: `${r.title} · ${r.who}`,
                }))}
              />
              <Moved
                title="Got stuck"
                empty="Nothing new is waiting."
                tone="oxblood"
                rows={moved.opened.map((o, i) => ({
                  key: o.title + i,
                  on: o.on,
                  text: `${o.title} · ${o.who}`,
                }))}
              />
            </div>

            {/*
              What the room asked for last time. The status beside each line is
              the task's own, so something that got done reads as done without
              anybody returning to a document to say so - which is the single
              reason minutes stop being true by the second meeting.
            */}
            {agreedLast && (
              <div className="mt-8 border-t border-rule-strong pt-5">
                <div className="flex items-baseline gap-4">
                  <h2 className="lbl">Agreed last time</h2>
                  <span className="lbl-tight tabular-nums text-rule-strong">
                    {formatDate(lastStandup!.held_on)}
                  </span>
                </div>

                {agreedLast.lines.length === 0 && agreedLast.tasks.length === 0 ? (
                  <p className="mt-2.5 max-w-prose text-[11.5px] leading-relaxed text-rule-strong">
                    Nothing was written down at that stand-up. Use{' '}
                    <span className="text-ink">agreed here</span> on a piece in
                    chapter two and it lands in this list next week.
                  </p>
                ) : (
                  <div className="mt-3">
                    {agreedLast.tasks.map((n) => {
                      const done = n.status === 'done' || n.completed_at !== null
                      const late =
                        !done && n.due_date !== null && n.due_date < today
                      return (
                        <div
                          key={n.id}
                          className="flex items-baseline gap-3 border-t border-rule py-2.5 last:border-b"
                        >
                          <StatusMark
                            status={n.status}
                            blocked={state.get(n.id)?.is_blocked ?? false}
                          />
                          <Link
                            href={at(n.id)}
                            className={`min-w-0 flex-1 text-[12.5px] leading-snug hover:text-green ${
                              done ? 'text-muted line-through' : ''
                            }`}
                          >
                            {n.title}
                          </Link>
                          {n.owner && (
                            <span className="lbl-tight shrink-0 text-muted">
                              {n.owner}
                            </span>
                          )}
                          <span
                            className={`shrink-0 text-[10px] tabular-nums ${
                              late ? 'text-oxblood' : 'text-rule-strong'
                            }`}
                          >
                            {done
                              ? 'done'
                              : n.due_date
                                ? formatDate(n.due_date)
                                : STATUS_LABEL[n.status]}
                          </span>
                        </div>
                      )
                    })}

                    {/* Lines that changed nothing structural. Still the record. */}
                    {agreedLast.lines
                      .filter(
                        (e) => !agreedLast.tasks.some((n) => n.title === e.body),
                      )
                      .map((e) => (
                        <div
                          key={e.id}
                          className="flex items-baseline gap-3 border-t border-rule py-2.5 last:border-b"
                        >
                          <span className="w-[9px] shrink-0" />
                          <Link
                            href={at(e.node_id)}
                            className="min-w-0 flex-1 text-[12.5px] leading-snug hover:text-green"
                          >
                            {e.body}
                            <span className="text-rule-strong">
                              {' '}
                              · {byId.get(e.node_id)?.title}
                            </span>
                          </Link>
                        </div>
                      ))}

                    {agreedLast.decisions.map((d) => (
                      <div
                        key={d.id}
                        className="flex items-baseline gap-3 border-t border-rule py-2.5 last:border-b"
                      >
                        <span className="lbl-tight w-[9px] shrink-0 text-green">
                          &#9670;
                        </span>
                        <span className="min-w-0 flex-1 text-[12.5px] leading-snug">
                          {d.decision}
                        </span>
                        <span className="lbl-tight shrink-0 text-rule-strong">
                          decided
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <p className="mt-7 max-w-prose border-t border-rule pt-3.5 text-[11.5px] leading-relaxed text-rule-strong">
              {moved.written === 0
                ? 'Not one log line was written in the period. Friday assembles the weekly report out of those, so it has nothing to say. That is the cheapest thing on this whole page to fix.'
                : `${moved.written} log ${moved.written === 1 ? 'line' : 'lines'} written. That is what Friday assembles the report from.`}
            </p>
          </div>

          <div className="border-l border-rule py-8 pl-5 lg:pl-8 pr-5 lg:pr-16">
            <Room room={room} />
          </div>
        </div>
      )}

      {/* ================= 2. Until next time ================= */}
      {part === '2' && (
        <div className="grid min-h-[76vh] grid-cols-1 lg:grid-cols-[340px_1fr]">
          {/* The agenda, always in view */}
          <aside className="border-b border-rule lg:border-b-0 lg:border-r">
            <div className="border-b border-rule-strong px-5 lg:px-7 py-5">
              <h1 className="font-display text-[24px] font-medium leading-tight">
                The whole portfolio
              </h1>
              <p className="mt-1.5 text-[11px] leading-relaxed text-muted">
                <span className="num text-ink">{rows.length}</span> of{' '}
                <span className="num text-ink">{liveCount}</span> live pieces need
                something before {formatDate(nextOn)}. Those come first; the rest
                follows by project, so nothing is out of sight.
              </p>
            </div>

            {rows.length === 0 ? (
              <p className="px-5 lg:px-7 py-6 text-[13px] text-muted">
                Nothing is waiting, nothing is late, and nothing is sitting ready
                with no owner. Short meeting.
              </p>
            ) : (
              <nav>
                {AGENDA_ORDER.map((kind) => {
                  const group = rows.filter((r) => r.lead.kind === kind)
                  if (group.length === 0) return null
                  return (
                    <div key={kind}>
                      <div className="flex items-baseline justify-between border-b border-rule bg-sheet px-5 lg:px-7 py-1.5">
                        <span className="lbl-tight text-muted">
                          {AGENDA_LABEL[kind]}
                        </span>
                        <span className="lbl-tight tabular-nums text-rule-strong">
                          {group.length}
                        </span>
                      </div>
                      {group.map((r) => {
                        const node = byId.get(r.nodeId)
                        const isOn = selected?.id === r.nodeId
                        const loud =
                          kind === 'overdue_blocker' || kind === 'overdue'
                        return (
                          <Link
                            key={r.nodeId}
                            href={at(r.nodeId)}
                            className={`flex items-baseline gap-3 border-b border-rule px-5 lg:px-7 py-3 ${
                              isOn ? 'bg-sheet' : 'hover:bg-sheet'
                            }`}
                          >
                            <span
                              className={`num w-9 shrink-0 text-[19px] leading-none ${
                                loud
                                  ? 'text-oxblood'
                                  : r.lead.days === 0
                                    ? 'text-rule-strong'
                                    : 'text-ink'
                              }`}
                            >
                              {r.lead.days === 0 ? '·' : r.lead.days}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span
                                className={`block text-[13.5px] leading-snug ${
                                  isOn ? 'font-medium text-ink' : 'text-muted'
                                }`}
                              >
                                {node?.title ?? r.lead.title}
                              </span>
                              <span className="mt-0.5 block text-[10px] text-rule-strong">
                                {projectTitle(r.nodeId)}
                                {r.lead.who && <> · {r.lead.who}</>}
                                {r.also.length > 0 && (
                                  <> · and {r.also.length} more here</>
                                )}
                              </span>
                            </span>
                          </Link>
                        )
                      })}
                    </div>
                  )
                })}
              </nav>
            )}

            {/*
              Everything else that is alive. Not a second screen and not behind a
              toggle: the agenda saw four of thirty five pieces, and the other
              thirty one are the ones a toggle would hide again.
            */}
            {portfolio.map(({ project, pieces }) => {
              const rest = pieces.filter((n) => !onAgenda.has(n.id))
              return (
                <div key={project.id}>
                  <Link
                    href={at(project.id)}
                    className={`flex items-baseline gap-3 border-y border-rule-strong px-5 lg:px-7 py-2 ${
                      selected?.id === project.id ? 'bg-sheet' : 'hover:bg-sheet'
                    }`}
                  >
                    <StatusMark
                      status={project.status}
                      blocked={state.get(project.id)?.is_blocked ?? false}
                    />
                    <span className="lbl min-w-0 flex-1 truncate text-ink">
                      {project.title}
                    </span>
                    <span className="lbl-tight tabular-nums text-rule-strong">
                      {pieces.length}
                    </span>
                  </Link>

                  {rest.length === 0 ? (
                    <p className="px-5 lg:px-7 py-2.5 text-[11px] text-rule-strong">
                      Everything alive here is already on the agenda above.
                    </p>
                  ) : (
                    rest.map((n) => {
                      const isOn = selected?.id === n.id
                      const late = n.due_date !== null && n.due_date < today
                      return (
                        <Link
                          key={n.id}
                          href={at(n.id)}
                          className={`flex items-baseline gap-2.5 border-b border-rule py-2 pr-5 lg:pr-7 ${
                            isOn ? 'bg-sheet' : 'hover:bg-sheet'
                          }`}
                          style={{
                            paddingLeft: `${20 + (depthOf.get(n.id) ?? 1) * 11}px`,
                          }}
                        >
                          <StatusMark
                            status={n.status}
                            blocked={state.get(n.id)?.is_blocked ?? false}
                          />
                          <span
                            className={`min-w-0 flex-1 truncate text-[12.5px] ${
                              isOn ? 'font-medium text-ink' : 'text-muted'
                            }`}
                          >
                            {n.title}
                          </span>
                          {n.due_date ? (
                            <span
                              className={`shrink-0 text-[10px] tabular-nums ${
                                late ? 'text-oxblood' : 'text-rule-strong'
                              }`}
                            >
                              {formatDate(n.due_date)}
                            </span>
                          ) : (
                            <span className="lbl-tight shrink-0 text-rule-strong">
                              {STATUS_LABEL[n.status]}
                            </span>
                          )}
                        </Link>
                      )
                    })
                  )}
                </div>
              )
            })}

            <div className="px-5 lg:px-7 py-6">
              <Room room={room} />
            </div>
          </aside>

          {/* The item under discussion */}
          <section className="px-5 lg:px-12 py-8">
            {!selected ? (
              <p className="text-[15px] text-muted">
                Nothing needs the room. Chapter three is where the time goes.
              </p>
            ) : (
              <>
                <div className="flex flex-wrap items-start justify-between gap-6">
                  <div className="min-w-0">
                    <div className="lbl text-rule-strong">
                      <Link
                        href={`/p/${projectOf.get(selected.id) ?? selected.id}`}
                        className="hover:text-ink"
                      >
                        {projectTitle(selected.id)}
                      </Link>
                      &nbsp;·&nbsp; {TYPE_LABEL[selected.type]}
                    </div>
                    <h2 className="mt-1.5 font-display text-[36px] font-medium leading-[1.08] tracking-[-0.02em]">
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
                    <Link
                      href={`/p/${projectOf.get(selected.id) ?? selected.id}/meeting?task=${selected.id}`}
                      className="lbl-tight text-rule-strong hover:text-ink"
                    >
                      Open in project
                    </Link>
                  </div>
                </div>

                {/* Why it is on the agenda at all */}
                <div
                  className={`mt-4 flex flex-col gap-1.5 pl-3 ${
                    reasons.length > 0 ? 'border-l-2 border-rule-strong' : ''
                  }`}
                >
                  {reasons.map((i, n) => (
                    <p key={n} className="text-[12.5px] leading-snug text-muted">
                      <span className="lbl-tight text-rule-strong">
                        {AGENDA_LABEL[i.kind]}
                      </span>{' '}
                      {i.why}
                    </p>
                  ))}
                </div>

                {editId === selected.id ? (
                  <div className="mt-6">
                    <NodeForm
                      node={selected}
                      redirectTo={at(selected.id)}
                      cancelHref={at(selected.id)}
                    />
                  </div>
                ) : (
                  <Prose
                    text={selected.description}
                    className="mt-5 max-w-[760px] text-[15px] leading-[1.7]"
                  />
                )}

                {/* What you change while somebody is still talking */}
                <div className="mt-7 flex flex-wrap items-center gap-x-10 gap-y-4 border-y border-rule py-4">
                  <StatusSelect
                    id={selected.id}
                    status={selected.status}
                    blocked={state.get(selected.id)?.is_blocked ?? false}
                    waitDays={state.get(selected.id)?.worst_wait ?? 0}
                  />
                  <DueDate id={selected.id} due={selected.due_date} today={today} />
                  {selected.due_date && (
                    <span className="text-[11px] text-muted">
                      {relativeDays(daysBetween(today, selected.due_date))}
                    </span>
                  )}
                  <Fact label="Responsible" value={selected.owner} />
                  <Fact
                    label="Priced"
                    value={
                      cost.get(selected.id) && Number(cost.get(selected.id)!.once_priced) > 0
                        ? formatMoney(Number(cost.get(selected.id)!.once_priced), 'EUR')
                        : null
                    }
                  />
                  <span className="ml-auto flex items-center gap-5">
                    <AgreedHere
                      nodeId={selected.id}
                      nextOn={nextOn}
                      open={agreeing === selected.id}
                      openHref={at(selected.id, `agree=${selected.id}`)}
                      closeHref={at(selected.id)}
                      redirectTo={at(selected.id)}
                    />
                    <QuickAddOn nodeId={selected.id} label="write a line" />
                    <Link
                      href={at(selected.id, `bnew=${selected.id}`)}
                      className="lbl-tight text-rule-strong hover:text-green"
                    >
                      new blocker
                    </Link>
                    <Link
                      href={at(selected.id, `dnew=${selected.id}`)}
                      className="lbl-tight text-rule-strong hover:text-green"
                    >
                      record a decision
                    </Link>
                  </span>
                </div>

                {agreeing === selected.id && (
                  <AgreedHere
                    nodeId={selected.id}
                    nextOn={nextOn}
                    open
                    openHref={at(selected.id, `agree=${selected.id}`)}
                    closeHref={at(selected.id)}
                    redirectTo={at(selected.id)}
                  />
                )}

                {newBlocker === selected.id && (
                  <div className="mt-5">
                    <BlockerForm
                      nodeId={selected.id}
                      redirectTo={at(selected.id)}
                      cancelHref={at(selected.id)}
                    />
                  </div>
                )}
                {/*
                  Found rather than asserted. A stale link - somebody resolved it
                  from another screen while this one was open - would otherwise
                  hand the form undefined and take the page down mid-meeting.
                */}
                {closing && (
                  <div className="mt-5">
                    <ResolveBlockerForm
                      blocker={closing}
                      redirectTo={at(selected.id)}
                      cancelHref={at(selected.id)}
                    />
                  </div>
                )}
                {newDecision === selected.id && (
                  <div className="mt-5">
                    <DecisionForm
                      nodeId={selected.id}
                      redirectTo={at(selected.id)}
                      cancelHref={at(selected.id)}
                    />
                  </div>
                )}

                <div className="mt-9 grid gap-x-12 gap-y-8 lg:grid-cols-2">
                  <div>
                    <Head title="Blockers" />
                    {blockers.filter((b) => b.node_id === selected.id).length === 0 ? (
                      <p className="text-[13px] text-muted">None recorded.</p>
                    ) : (
                      blockers
                        .filter((b) => b.node_id === selected.id)
                        .map((b) => (
                          <div
                            key={b.id}
                            className={`flex items-baseline gap-3.5 border-t border-rule py-3 last:border-b ${
                              b.is_active ? '' : 'opacity-55'
                            }`}
                          >
                            <span
                              className={`num min-w-[40px] text-[22px] leading-none ${
                                b.is_active ? 'text-oxblood' : ''
                              }`}
                            >
                              {b.days_blocked}
                            </span>
                            <span className="flex-1">
                              <span className="block text-[13.5px] leading-snug">
                                {b.title}
                              </span>
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

                  <div>
                    <Head title="Log" />
                    {entries.filter((e) => e.node_id === selected.id).length === 0 ? (
                      <p className="text-[13px] text-muted">
                        Nothing written here. &laquo;Write a line&raquo; above lands
                        on this piece.
                      </p>
                    ) : (
                      entries
                        .filter((e) => e.node_id === selected.id)
                        .slice(0, 6)
                        .map((e) => (
                          <div key={e.id} className="border-t border-rule py-3 last:border-b">
                            <div className="text-[10px] tabular-nums text-muted">
                              {formatDate(e.entry_date)}
                            </div>
                            <p className="mt-1 text-[13px] leading-relaxed">{e.body}</p>
                          </div>
                        ))
                    )}
                  </div>

                  <div>
                    <Head title="Decisions" />
                    {decisions.filter((d) => d.node_id === selected.id).length === 0 ? (
                      <p className="text-[13px] text-muted">
                        None yet. A meeting is where these happen.
                      </p>
                    ) : (
                      decisions
                        .filter((d) => d.node_id === selected.id)
                        .map((d) => (
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
                          </div>
                        ))
                    )}
                  </div>

                  <div>
                    <Head title="Cost" />
                    {lines.filter((l) => l.node_id === selected.id).length === 0 ? (
                      <p className="text-[13px] text-muted">Nothing priced on this piece.</p>
                    ) : (
                      lines
                        .filter((l) => l.node_id === selected.id)
                        .map((l) => (
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
      )}

      {/* ================= 3. From spark to idea ================= */}
      {part === '3' && (
        <div className="frame min-h-[60vh]">
          <div className="pl-5 lg:pl-16 py-8 pr-5">
            <h1 className="font-display text-[30px] font-medium leading-[1.06]">
              From spark to idea
            </h1>
            <p className="mt-4 max-w-[26ch] text-[11px] leading-relaxed text-muted">
              Ranked by what each takes out of the year&rsquo;s target, so the
              last five minutes go on the biggest one rather than the newest.
            </p>
            {target && (
              <p className="mt-4 text-[11px] leading-relaxed text-rule-strong">
                The whole target is
                <br />
                <span className="num text-[17px] text-ink">{kr(target.dkk)} kr</span>
                <br />
                a year. A percentage here is a percentage of that.
              </p>
            )}
          </div>

          <div className="border-l border-rule px-5 lg:px-10 py-8">
            {weighed.length === 0 ? (
              <p className="text-[13px] text-muted">
                No idea has a figure on it yet.{' '}
                <Link href="/spark" className="text-green">
                  Assess one
                </Link>{' '}
                and it will be ranked here.
              </p>
            ) : (
              weighed.map(({ spark, impact, score, where }) => (
                <div key={spark.id} className="border-t border-rule py-4 last:border-b">
                  <div className="flex items-baseline gap-5">
                    <span
                      className={`num min-w-[72px] shrink-0 text-[26px] leading-none ${
                        (impact?.shareOfTarget ?? 0) >= 0.1 ? 'text-green' : 'text-ink'
                      }`}
                    >
                      {impact ? `${(impact.shareOfTarget * 100).toFixed(1)}%` : '—'}
                    </span>
                    <div className="flex-1">
                      <p className="max-w-prose text-[14px] leading-relaxed">{spark.body}</p>
                      <div className="lbl-tight mt-2 flex flex-wrap gap-x-4 gap-y-1 text-muted">
                        {impact && (
                          <span className="num">{kr(impact.annualDkk)} kr a year</span>
                        )}
                        {where && <span>{where}</span>}
                        {score !== null && (
                          <span className="num text-rule-strong">priority {score}</span>
                        )}
                        <Link href="/spark" className="text-rule-strong hover:text-ink">
                          Open the inbox
                        </Link>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}

            {unweighed > 0 && (
              <p className="mt-5 text-[11.5px] leading-relaxed text-rule-strong">
                {unweighed} more {unweighed === 1 ? 'spark has' : 'sparks have'} no
                figure yet and cannot be ranked. An empty assessment is not zero,
                it is not worked out.{' '}
                <Link href="/spark" className="text-green">
                  Inbox
                </Link>
              </p>
            )}
          </div>

          <div className="border-l border-rule py-8 pl-5 lg:pl-8 pr-5 lg:pr-16">
            <h2 className="font-display text-[24px] font-medium">Held before</h2>
            {held.length === 0 ? (
              <p className="mt-3.5 text-[12.5px] text-muted">
                None yet. Until one is recorded, chapter one covers the whole
                history rather than a week.
              </p>
            ) : (
              <div className="mt-3.5">
                {held.map((h) => (
                  <div key={h.id} className="border-t border-rule py-2.5 last:border-b">
                    <div className="text-[11px] tabular-nums text-muted">
                      {formatDateLong(h.held_on)}
                    </div>
                    {h.note && (
                      <p className="mt-1 text-[12px] leading-relaxed">{h.note}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  )
}

/**
 * Who the agenda needs in the room.
 *
 * Not an invitation list. A standing one invites the same six people every week
 * whether or not anything needs them, and then the one person who could unblock
 * the oldest item is not there.
 */
function Room({ room }: { room: { who: string; items: number; longestWait: number }[] }) {
  return (
    <>
      <h2 className="font-display text-[22px] font-medium">The room</h2>
      {room.length === 0 ? (
        <p className="mt-2.5 text-[12.5px] text-muted">
          Nothing is waiting on anyone. Nobody has to be here but you.
        </p>
      ) : (
        <div className="mt-3">
          {room.map((a) => (
            <div
              key={a.who}
              className="flex items-baseline gap-3.5 border-t border-rule py-2.5 last:border-b"
            >
              <span
                className={`num min-w-[38px] text-[22px] leading-none ${
                  a.longestWait >= 30 ? 'text-oxblood' : 'text-ink'
                }`}
              >
                {a.longestWait}
              </span>
              <span className="flex-1">
                <span className="block text-[12.5px] leading-snug">{a.who}</span>
                <span className="mt-0.5 block text-[10.5px] text-muted">
                  {a.items} {a.items === 1 ? 'item' : 'items'} · longest wait{' '}
                  {a.longestWait} days
                </span>
              </span>
            </div>
          ))}
        </div>
      )}
    </>
  )
}

/** One column of what moved. Three of these are the whole of chapter one. */
function Moved({
  title,
  empty,
  rows,
  tone,
}: {
  title: string
  empty: string
  rows: { key: string; on: string; text: string; href?: string }[]
  tone?: 'oxblood'
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between border-b border-rule-strong pb-1.5">
        <span className="lbl text-muted">{title}</span>
        <span
          className={`num text-[18px] leading-none ${
            rows.length === 0
              ? 'text-rule-strong'
              : tone === 'oxblood'
                ? 'text-oxblood'
                : 'text-ink'
          }`}
        >
          {rows.length}
        </span>
      </div>
      {rows.length === 0 ? (
        <p className="mt-2 text-[11px] text-rule-strong">{empty}</p>
      ) : (
        <div className="mt-1">
          {rows.slice(0, 8).map((r) => (
            <div key={r.key} className="border-b border-rule py-2 last:border-b-0">
              <div className="text-[10px] tabular-nums text-muted">{formatDate(r.on)}</div>
              {r.href ? (
                <Link href={r.href} className="text-[12px] leading-snug hover:text-green">
                  {r.text}
                </Link>
              ) : (
                <span className="text-[12px] leading-snug">{r.text}</span>
              )}
            </div>
          ))}
          {rows.length > 8 && (
            <p className="mt-1.5 text-[10px] text-rule-strong">
              and {rows.length - 8} more
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function Head({ title }: { title: string }) {
  return (
    <div className="mb-2.5 border-b border-rule-strong pb-1.5">
      <h3 className="lbl">{title}</h3>
    </div>
  )
}

function Fact({ label, value }: { label: string; value: string | null }) {
  return (
    <span className="flex flex-col">
      <span className="lbl-tight text-muted">{label}</span>
      <span className="mt-0.5 text-[14px] tabular-nums">
        {value ?? <span className="text-rule-strong">not set</span>}
      </span>
    </span>
  )
}
