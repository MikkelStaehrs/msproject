import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { QueryFailure, firstError } from '@/lib/failure'
import { addDays, today as todayIso } from '@/lib/date'
import { looseEnds } from '@/lib/loose-ends'
import {
  agenda,
  attendees,
  movement,
  AGENDA_LABEL,
  AGENDA_ORDER,
  CADENCE_DAYS,
  type AgendaItem,
  type AgendaKind,
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
import { QuickAddOn } from '@/components/quick-add-on'
import { Rule, formatDate, formatDateLong } from '@/components/ui'
import type {
  Blocker,
  Decision,
  Node,
  NodeReady,
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

const kr = (n: number) =>
  new Intl.NumberFormat('da-DK', { maximumFractionDigits: 0 }).format(n)

/**
 * The weekly stand-up.
 *
 * Three parts, in the order the room walks them: what moved since last time,
 * what has to happen before next time, and which idea is ready to stop being an
 * idea. Nothing on this page was written for the meeting. The agenda is derived
 * from what is waiting, what is late and what nobody has picked up; the people
 * are derived from the agenda; the ideas are ranked by what they are worth
 * against the year's target.
 *
 * The one gesture is the button at the bottom left, and all it records is that
 * the meeting happened. Nothing is ticked off. An item leaves the agenda by
 * being answered, which means the list cannot quietly become a second, staler
 * copy of the work.
 */
export default async function StandupPage() {
  const supabase = await createClient()
  const today = todayIso()

  const [
    nodeRes, readyRes, blockerRes, entryRes, decisionRes,
    descendantRes, standupRes, sparkRes, yardstickRes, stageRes,
  ] = await Promise.all([
    supabase.from('node').select('*').order('sort_order'),
    supabase.from('v_node_ready').select('*'),
    supabase.from('blocker').select('*'),
    supabase.from('entry').select('node_id, entry_date'),
    supabase.from('decision').select('node_id'),
    supabase.from('v_node_descendant').select('root_id, node_id'),
    supabase.from('standup').select('*').order('held_on', { ascending: false }).limit(8),
    supabase.from('spark').select('*').eq('state', 'new'),
    supabase.from('yardstick').select('*').maybeSingle(),
    supabase.from('stage_volume').select('fiscal_year, stage, units'),
  ])

  const failure = firstError([
    nodeRes, readyRes, blockerRes, entryRes, decisionRes, descendantRes, standupRes,
  ])
  if (failure) return <QueryFailure message={failure} />

  const nodes = (nodeRes.data ?? []) as Node[]
  const blockers = (blockerRes.data ?? []) as Blocker[]
  const entries = (entryRes.data ?? []) as { node_id: string; entry_date: string }[]
  const held = (standupRes.data ?? []) as Standup[]

  /*
   * The boundary. Null where no stand-up has ever been held, which is not the
   * same as a quiet week: the first meeting should have the whole history in
   * front of it, and a fallback date would hide that.
   */
  const heldToday = held.find((h) => h.held_on === today) ?? null
  const previous = held.find((h) => h.held_on !== today) ?? null
  const since = (heldToday ? previous?.held_on : held[0]?.held_on) ?? null
  const nextOn = addDays(today, CADENCE_DAYS)

  const ready = new Map(
    ((readyRes.data ?? []) as NodeReady[]).map((r) => [r.node_id, r.is_ready]),
  )

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
    decisions: (decisionRes.data ?? []) as Decision[],
    blockers,
    today,
  })

  const items = agenda({
    nodes,
    blockers,
    ready,
    looseEnds: loose.map((l) => ({ nodeId: l.nodeId, what: l.what, on: l.on })),
    today,
  })
  const room = attendees(items)
  const moved = movement({ nodes, blockers, entries }, since)

  // Where a link should go. An item is about a task; the room opens the project.
  const rootIds = new Set(nodes.filter((n) => n.parent_id === null).map((n) => n.id))
  const projectOf = new Map<string, string>()
  for (const d of (descendantRes.data ?? []) as { root_id: string; node_id: string }[]) {
    if (rootIds.has(d.root_id)) projectOf.set(d.node_id, d.root_id)
  }
  const openHref = (nodeId: string) =>
    `/p/${projectOf.get(nodeId) ?? nodeId}/meeting?focus=${nodeId}`

  // --- Part three: which idea is worth becoming work ------------------------
  const yard = yardstickRes.data as Yardstick | null
  const reference = referenceFrom(yard)
  const stages = stagesFrom((stageRes.data ?? []) as StageVolume[], yard?.fiscal_year ?? null)
  const unitsAt = new Map(stages.map((s) => [s.stage, s.units]))
  const target = reference ? targetAnnual(reference) : null

  const sparks = (sparkRes.data ?? []) as Spark[]
  const weighed = sparks
    .map((s) => {
      const saving = savingFrom(
        s.saving_kind,
        s.saving_value,
        s.saving_stage === null ? null : (unitsAt.get(s.saving_stage) ?? null),
      )
      const impact = saving && reference ? impactOf(saving, reference) : null
      const judgement = {
        cost: s.cost_score,
        benefit: s.benefit_score,
        complexity: s.complexity_score,
      }
      return { spark: s, impact, score: priorityScore(judgement), where: quadrant(judgement) }
    })
    .filter((w) => w.impact !== null || w.score !== null)
    .sort(
      (a, b) =>
        (b.impact?.shareOfTarget ?? -1) - (a.impact?.shareOfTarget ?? -1) ||
        (b.score ?? -99) - (a.score ?? -99),
    )
  const unweighed = sparks.length - weighed.length

  const byKind = (k: AgendaKind) => items.filter((i) => i.kind === k)
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
          <QuickAddTrigger />
        </div>
      </div>
      <Rule strong />

      <div className="frame min-h-[70vh]">
        {/* Left: the boundary, and the one gesture */}
        <div className="pl-5 lg:pl-16 py-8 pr-5">
          <h1 className="font-display text-[30px] font-medium leading-[1.06] tracking-[-0.01em]">
            Stand&shy;up
          </h1>

          <dl className="mt-6 text-[11px] leading-relaxed text-muted">
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

          {heldToday ? (
            <div className="mt-6 border-l-2 border-green pl-3">
              <div className="lbl-tight text-green">Held today</div>
              <p className="mt-1.5 text-[11px] leading-relaxed text-muted">
                Everything still on the list below is still open. It stays there,
                counting days, until it is answered.
              </p>
              <form action={reopenStandup} className="mt-3">
                <input type="hidden" name="id" value={heldToday.id} />
                <input type="hidden" name="redirectTo" value="/standup" />
                <button className="btn btn-ghost w-full">Undo</button>
              </form>
            </div>
          ) : (
            <form action={holdStandup} className="mt-6">
              <input type="hidden" name="redirectTo" value="/standup" />
              <label className="block">
                <span className="lbl text-muted">Anything else agreed</span>
                <textarea
                  name="note"
                  rows={3}
                  placeholder="Usually empty. If it belongs to a project, put it on the project."
                  className="field resize-none text-[12px]"
                />
              </label>
              <button className="btn mt-3 w-full">We held it</button>
              <p className="mt-2 text-[10px] leading-snug text-rule-strong">
                Records today as the day the room met. That date is the only thing
                a stand-up stores.
              </p>
            </form>
          )}
        </div>

        {/* Middle: the three parts */}
        <div className="border-l border-rule">
          {/* 1 */}
          <section className="px-5 lg:px-10 py-8">
            <div className="flex items-baseline gap-3">
              <span className="num text-[20px] text-rule-strong">1</span>
              <h2 className="font-display text-[26px] font-medium">Since last time</h2>
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-muted">
              {since
                ? `What moved since the room last met on ${formatDate(since)}.`
                : 'No stand-up has been held before, so this is everything.'}
            </p>

            <div className="mt-5 grid gap-x-8 gap-y-6 md:grid-cols-3">
              <Moved
                title="Finished"
                empty="Nothing was completed."
                rows={moved.completed.map((c) => ({
                  key: c.nodeId + c.on,
                  on: c.on,
                  text: c.title,
                  href: openHref(c.nodeId),
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

            <p className="mt-5 text-[11px] text-rule-strong">
              {moved.written === 0
                ? 'Not one log line was written in the period. The weekly report is assembled from those, so it has nothing to say.'
                : `${moved.written} log ${moved.written === 1 ? 'line' : 'lines'} written. That is what Friday assembles the report from.`}
            </p>
          </section>
          <Rule />

          {/* 2 */}
          <section className="px-5 lg:px-10 py-8">
            <div className="flex items-baseline gap-3">
              <span className="num text-[20px] text-rule-strong">2</span>
              <h2 className="font-display text-[26px] font-medium">Until next time</h2>
            </div>
            <p className="mt-1 max-w-prose text-[11px] leading-relaxed text-muted">
              Everything that needs a person or a decision before {formatDate(nextOn)},
              hardest first. Nothing here is ticked off: an item leaves the list by
              being answered.
            </p>

            {items.length === 0 ? (
              <p className="mt-6 text-[13px] text-muted">
                Nothing is waiting, nothing is late, and nothing is sitting ready
                with no owner. Short meeting.
              </p>
            ) : (
              <div className="mt-6">
                {AGENDA_ORDER.map((kind) => {
                  const group = byKind(kind)
                  if (group.length === 0) return null
                  return (
                    <div key={kind} className="mb-6 last:mb-0">
                      <div className="flex items-baseline justify-between border-b border-rule-strong pb-1.5">
                        <span className="lbl">{AGENDA_LABEL[kind]}</span>
                        <span className="lbl-tight tabular-nums text-rule-strong">
                          {group.length}
                        </span>
                      </div>
                      {group.map((item, i) => (
                        <Row key={`${item.kind}-${item.nodeId}-${i}`} item={item} href={openHref(item.nodeId)} />
                      ))}
                    </div>
                  )
                })}
              </div>
            )}
          </section>
          <Rule />

          {/* 3 */}
          <section className="px-5 lg:px-10 py-8">
            <div className="flex items-baseline gap-3">
              <span className="num text-[20px] text-rule-strong">3</span>
              <h2 className="font-display text-[26px] font-medium">From spark to idea</h2>
            </div>
            <p className="mt-1 max-w-prose text-[11px] leading-relaxed text-muted">
              Assessed ideas, ranked by what they take out of the year&rsquo;s target.
              {target && (
                <>
                  {' '}
                  The whole target is {kr(target.dkk)} kr, so a percentage here is a
                  percentage of that.
                </>
              )}
            </p>

            {weighed.length === 0 ? (
              <p className="mt-5 text-[13px] text-muted">
                No idea has a figure on it yet.{' '}
                <Link href="/spark" className="text-green">
                  Assess one
                </Link>{' '}
                and it will be ranked here.
              </p>
            ) : (
              <div className="mt-5">
                {weighed.map(({ spark, impact, score, where }) => (
                  <div key={spark.id} className="border-t border-rule py-3.5 last:border-b">
                    <div className="flex items-baseline gap-4">
                      <span
                        className={`num min-w-[62px] shrink-0 text-[24px] leading-none ${
                          (impact?.shareOfTarget ?? 0) >= 0.1 ? 'text-green' : 'text-ink'
                        }`}
                      >
                        {impact ? `${(impact.shareOfTarget * 100).toFixed(1)}%` : '—'}
                      </span>
                      <div className="flex-1">
                        <p className="text-[13px] leading-snug">{spark.body}</p>
                        <div className="lbl-tight mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-muted">
                          {impact && (
                            <span className="num">{kr(impact.annualDkk)} kr a year</span>
                          )}
                          {where && <span>{where}</span>}
                          {score !== null && (
                            <span className="num text-rule-strong">priority {score}</span>
                          )}
                          <Link href="/spark" className="text-rule-strong hover:text-ink">
                            Open
                          </Link>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {unweighed > 0 && (
              <p className="mt-4 text-[11px] text-rule-strong">
                {unweighed} more {unweighed === 1 ? 'spark has' : 'sparks have'} no
                figure yet and cannot be ranked.{' '}
                <Link href="/spark" className="text-green">
                  Inbox
                </Link>
              </p>
            )}
          </section>
        </div>

        {/* Right: who the agenda needs, and the meetings behind it */}
        <div className="border-l border-rule">
          <section className="py-8 pl-5 lg:pl-8 pr-5 lg:pr-16">
            <h2 className="font-display text-[26px] font-medium">The room</h2>
            <p className="mt-1.5 text-[11px] leading-relaxed text-muted">
              Not an invitation list. Whoever something is actually waiting on,
              with the longest wait beside them.
            </p>

            {room.length === 0 ? (
              <p className="mt-4 text-[12.5px] text-muted">
                Nothing is waiting on anyone. Nobody has to be here but you.
              </p>
            ) : (
              <div className="mt-4">
                {room.map((a) => (
                  <div
                    key={a.who}
                    className="flex items-baseline gap-3.5 border-t border-rule py-3 last:border-b"
                  >
                    <span
                      className={`num min-w-[44px] text-[26px] leading-none ${
                        a.longestWait >= 30 ? 'text-oxblood' : 'text-ink'
                      }`}
                    >
                      {a.longestWait}
                    </span>
                    <div className="flex-1">
                      <div className="text-[13px] leading-snug">{a.who}</div>
                      <div className="mt-0.5 text-[11px] text-muted">
                        {a.items} {a.items === 1 ? 'item' : 'items'} · longest wait{' '}
                        {a.longestWait} days
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
          <Rule />

          <section className="py-7 pb-8 pl-5 lg:pl-8 pr-5 lg:pr-16">
            <h2 className="font-display text-[26px] font-medium">Held before</h2>
            {held.length === 0 ? (
              <p className="mt-3.5 text-[12.5px] text-muted">
                None yet. Until one is recorded, part one covers the whole history
                rather than a week.
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
          </section>
        </div>
      </div>
    </main>
  )
}

/** One column of what moved. Three of these are the whole of part one. */
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
      <div className="flex items-baseline justify-between border-b border-rule pb-1.5">
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
          {rows.slice(0, 6).map((r) => (
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
          {rows.length > 6 && (
            <p className="mt-1.5 text-[10px] text-rule-strong">
              and {rows.length - 6} more
            </p>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * One line of the agenda.
 *
 * The number on the left is days: waited, or late. It is the largest thing on
 * the row on purpose, because it is the only part that gets worse by itself.
 */
function Row({ item, href }: { item: AgendaItem; href: string }) {
  const loud = item.kind === 'overdue_blocker' || item.kind === 'overdue'

  return (
    <div className="flex items-baseline gap-3.5 border-b border-rule py-3">
      <span
        className={`num min-w-[44px] shrink-0 text-[26px] leading-none ${
          loud ? 'text-oxblood' : item.days === 0 ? 'text-rule-strong' : 'text-ink'
        }`}
      >
        {item.days === 0 ? '·' : item.days}
      </span>

      <div className="flex-1">
        <div className="flex items-baseline justify-between gap-4">
          <Link href={href} className="text-[13px] leading-snug hover:text-green">
            {item.title}
          </Link>
          {item.kind === 'loose_end' ? (
            <QuickAddOn nodeId={item.nodeId} />
          ) : (
            item.who && <span className="lbl-tight shrink-0 text-muted">{item.who}</span>
          )}
        </div>
        <p className="mt-0.5 text-[11px] leading-snug text-rule-strong">{item.why}</p>
      </div>
    </div>
  )
}
