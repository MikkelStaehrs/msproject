import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { QueryFailure, firstError } from '@/lib/failure'
import { addDays, today as todayIso } from '@/lib/date'
import { looseEnds } from '@/lib/loose-ends'
import { projectOf } from '@/lib/subtree'
import {
  agenda,
  attendees,
  movement,
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
import { QuickAddTrigger } from '@/components/quick-add-trigger'
import { Rule, formatDate, formatDateLong } from '@/components/ui'
import { WhatIsInTheWay } from './_chapters/what-is-in-the-way'
import { WhatWeAreDoing } from './_chapters/what-we-are-doing'
import { WhatIsNext } from './_chapters/what-is-next'
import type {
  BlockerDays,
  Cost,
  Decision,
  Entry,
  Node,
  NodeCost,
  NodeReady,
  NodeState,
  Spark,
  StageVolume,
  Standup,
  Yardstick,
} from '@/lib/types'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Stand-up' }

const weekday = new Intl.DateTimeFormat('en-GB', {
  weekday: 'long',
  day: 'numeric',
  month: 'short',
})

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
    lineRes, standupRes, sparkRes, yardstickRes, stageRes,
  ] = await Promise.all([
    supabase.from('node').select('*').order('sort_order'),
    supabase.from('v_node_ready').select('*'),
    supabase.from('v_node_state').select('*'),
    supabase.from('v_blocker_days').select('*'),
    supabase.from('entry').select('*').order('entry_date', { ascending: false }),
    supabase.from('decision').select('*').order('decided_on', { ascending: false }),
    supabase.from('v_node_cost').select('*'),
    supabase.from('cost').select('*').order('dated', { ascending: false }),
    supabase.from('standup').select('*').order('held_on', { ascending: false }).limit(8),
    supabase.from('spark').select('*').eq('state', 'new'),
    supabase.from('yardstick').select('*').maybeSingle(),
    supabase.from('stage_volume').select('fiscal_year, stage, units, scope'),
  ])

  const failure = firstError([
    nodeRes, readyRes, stateRes, blockerRes, entryRes, decisionRes, standupRes,
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

  // Which project a node belongs to, so a row can say where it lives. Walked
  // from the rows above rather than fetched; see lib/subtree.
  const projectOfNode = projectOf(nodes)
  const projectTitle = (nodeId: string) =>
    byId.get(projectOfNode.get(nodeId) ?? nodeId)?.title ?? ''

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
  const OVER = new Set(['done', 'cancelled'])

  const childrenOf = new Map<string, Node[]>()
  for (const n of nodes) {
    if (n.parent_id !== null) {
      childrenOf.set(n.parent_id, [...(childrenOf.get(n.parent_id) ?? []), n])
    }
  }
  const walk = (nodeId: string, depth: number, into: Node[]) => {
    for (const kid of childrenOf.get(nodeId) ?? []) {
      /*
       * ACTIVE WORK, at the finest level it is described.
       *
       * This carried everything alive: every project with every piece under it
       * that was not done or cancelled. On the real tree that is thirty five
       * rows of which nineteen sit at «idea», and the room has decided it does
       * not discuss work nobody has begun.
       *
       * «Active tasks» was the instruction and a literal reading of it was
       * wrong. Eight nodes are active and only two are typed `task`; five of the
       * rest are containers with active work underneath, which the work itself
       * represents. But ONE is a subproject that is active with nothing active
       * under it, and a filter on the type would have hidden a real piece of
       * work with nothing below it to stand in.
       *
       * So the cut is the same one `v_node_progress` makes: the finest level at
       * which the work is described. Active, with nothing active underneath.
       */
      /*
       * Doing and on hold, both. Parking something is the decision this chapter
       * is for, and a list that dropped it the moment you pressed «hold» would
       * be a list you could put work into and never get it out of again.
       *
       * `idea` and `planned` stay off: those have not been started, which is the
       * thing the room decided not to discuss. `paused` HAS been started and is
       * waiting for a reason somebody chose.
       */
      const WALKED = new Set(['active', 'paused'])
      const under = (childrenOf.get(kid.id) ?? []).some((g) => WALKED.has(g.status))
      if (WALKED.has(kid.status) && !under) into.push(kid)
      walk(kid.id, depth + 1, into)
    }
  }

  /** Every project with active work under it, and that work. */
  const portfolio = nodes
    .filter((n) => n.parent_id === null && !OVER.has(n.status))
    .map((project) => {
      const pieces: Node[] = []
      walk(project.id, 1, pieces)
      return { project, pieces }
    })
    // A project with nothing active under it is not on the agenda either.
    .filter((p) => p.pieces.length > 0)

  /*
   * ONE QUEUE, ACROSS EVERY PROJECT.
   *
   * The rail grouped by project, which fights the thing this chapter is for: a
   * stand-up asks «what do we take first», and that is answered over all the
   * work at once or not at all. Grouping by project answers it once per
   * project, which is a different and less useful question.
   *
   * `standup_order` decides, null last, and among the unranked the tree's own
   * order. So an untouched list looks exactly as it did before anybody ranked
   * anything, and the first move ranks it in the order it was already shown.
   */
  const queue = portfolio
    .flatMap((p) => p.pieces.map((n) => ({ node: n, project: p.project })))
    .sort(
      (a, b) =>
        (a.node.standup_order ?? Number.MAX_SAFE_INTEGER) -
          (b.node.standup_order ?? Number.MAX_SAFE_INTEGER) ||
        a.node.sort_order - b.node.sort_order ||
        a.node.id.localeCompare(b.node.id),
    )

  const liveCount = queue.length

  /** The order Prev and Next walk: the queue, as shown. */
  const order = [
    ...queue.map((q) => q.node.id),
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
    .sort(
      (a, b) =>
        (b.impact?.shareOfTarget ?? -1) - (a.impact?.shareOfTarget ?? -1) ||
        (b.score ?? -99) - (a.score ?? -99),
    )
  /*
   * Everything in the inbox, not only what has been weighed.
   *
   * This chapter used to show the assessed ones and count the rest in a
   * footnote, which produced an empty chapter: nothing gets assessed until
   * somebody sits down and does it, and sitting down and doing it is what this
   * chapter IS. The ones with a figure sort to the top, so the ranking still
   * pays off where it exists without hiding what has none.
   */
  const unweighed = weighed.filter((w) => w.impact === null && w.score === null).length

  /*
   * Chapter one: what somebody is waiting on, worst first.
   *
   * Taken from the same agenda the rail is ranked by rather than from the
   * blockers table, so the status rule and the ordering are applied once. A
   * blocker that is late outranks one that is not, which AGENDA_ORDER already
   * decides.
   */
  const waitingRows = rows.filter(
    (r) => r.lead.kind === 'overdue_blocker' || r.lead.kind === 'blocker',
  )

  const needsAction = items.filter((i) => i.kind !== 'loose_end').length

  return (
    <main>
      {/* Context band */}
      <div className="frame [--frame-label:360px] [--frame-margin:330px]">
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

      {/*
        The retrospective, in one line.
        
        It had the whole first chapter: what finished, what came unstuck, what
        got stuck, and how much was written down. Useful to know and a READ
        rather than a working surface, so it was a third of a meeting spent not
        deciding anything.
        
        It stays here rather than going altogether, because `movement()` is the
        only thing that reads the meeting boundary. Delete it and «We held it»
        becomes a button that records a date nobody looks at, and standup.held_on
        stops earning its place.
      */}
      <div className="px-5 lg:px-16 pt-3.5 text-[11.5px] leading-relaxed text-muted">
        {since ? `Since ${formatDateLong(since)}: ` : 'Never held before, so this is everything: '}
        <span className="text-ink">{moved.completed.length} finished</span>
        {', '}
        <span className="text-ink">{moved.resolved.length} came unstuck</span>
        {', '}
        <span className={moved.opened.length > 0 ? 'text-oxblood' : 'text-ink'}>
          {moved.opened.length} got stuck
        </span>
        {', '}
        <span className="text-ink">{moved.written} written down</span>
        {'.'}
      </div>

      {/* The three chapters, in the order the room walks them */}
      <nav className="flex flex-wrap items-baseline gap-x-9 gap-y-2 px-5 lg:px-16 py-3.5">
        {(
          [
            ['1', 'What is in the way', waitingRows.length],
            ['2', 'What we are doing', liveCount],
            ['3', 'What is next', weighed.length],
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

      {/* ================= 1. What is in the way ================= */}
      {part === '1' && (
        <WhatIsInTheWay
          waitingRows={waitingRows}
          room={room}
          moved={moved}
          agreedLast={agreedLast}
          lastStandup={lastStandup}
          byId={byId}
          state={state}
          today={today}
          projectTitle={projectTitle}
          at={at}
          here={here}
        />
      )}

      {/*
        ================= 2. Until next time =================

        The rail scrolls on its own rather than taking the page with it. A
        stand-up is walked from a list, and a list you have to scroll the whole
        page to reach the bottom of stops being a list: the piece under
        discussion goes off screen the moment you look for the next one. So the
        rail sticks and carries its own overflow, and the grid keeps a viewport
        of height so there is always the scroll needed to seat it.

        Below the breakpoint the two stack, which is the right answer there: a
        340px column with its own scrollbar on a phone is two scrollbars
        fighting.
      */}
      {part === '2' && (
        <WhatWeAreDoing
          queue={queue}
          liveCount={liveCount}
          selected={selected}
          prev={prev}
          next={next}
          reasons={reasons}
          closing={closing}
          blockers={blockers}
          entries={entries}
          decisions={decisions}
          lines={lines}
          cost={cost}
          state={state}
          held={held}
          room={room}
          today={today}
          nextOn={nextOn}
          editId={editId}
          newBlocker={newBlocker}
          newDecision={newDecision}
          agreeing={agreeing}
          projectTitle={projectTitle}
          projectOfNode={projectOfNode}
          at={at}
        />
      )}

      {/* ================= 3. What is next ================= */}
      {part === '3' && (
        <WhatIsNext
          weighed={weighed}
          unweighed={unweighed}
          reference={reference}
          target={target}
          held={held}
          at={at}
          here={here}
        />
      )}
    </main>
  )
}
