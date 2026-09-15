import Link from 'next/link'
import { daysBetween, today as todayIso } from '@/lib/date'
import { createClient } from '@/lib/supabase/server'
import { QueryFailure, firstError } from '@/lib/failure'
import { NodeForm } from '@/components/node-form'
import { looseEnds } from '@/lib/loose-ends'
import { childrenByParent, projectOf } from '@/lib/subtree'
import { readIdentity } from '@/lib/identity'
import { ProgressScale, formatDate } from '@/components/ui'
import { OverviewDate, OverviewMasthead } from '@/components/overview-clock'
import { OverviewAct } from '@/components/overview-act'
import { OverviewMore, type MoreItem } from '@/components/overview-more'
import type {
  ActiveBlocker,
  NextDate,
  Node,
  NodeProgress,
  Profile,
  Spark,
} from '@/lib/types'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Overview' }

/**
 * The front page: what today asks of you, and what is running.
 *
 * Nothing here is typed. Today is derived from the blockers, the log and the
 * inbox, and it empties by being answered rather than by being dismissed: chase
 * the supplier, write the line, sort the sparks, and the row is gone. Running
 * now is the portfolio cut to what is actually in motion; the rest lives in
 * All projects and is only counted here.
 */

/**
 * The wall clock where the page is read, for the first paint. The app keeps
 * every date in UTC, which is right for a due date and wrong for a clock: at
 * nine in the evening in Copenhagen the server says seven. The browser takes
 * over on mount, so this only has to be right for the second before that.
 */
function copenhagenWall(): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Copenhagen',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date())
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00'
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`
}

/** Small counts read better as words in a sentence. Larger ones do not. */
function word(n: number) {
  const W = ['none', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve']
  return n < W.length ? W[n] : String(n)
}
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

type TodayRow = {
  key: string
  glyph: string
  rust?: boolean
  text: string
  ctx: React.ReactNode
  /** Where the row itself goes. The row is the primary action. */
  href: string
  /** A named action, only because it differs from «open». */
  action: React.ReactNode
  more: MoreItem[]
  right?: React.ReactNode
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string }>
}) {
  const { new: creating } = await searchParams
  const supabase = await createClient()

  const [
    nodesRes, progressRes, nextDateRes, blockerRes,
    entryRes, allBlockerRes, decisionRes, sparkRes, profileRes, authRes,
  ] = await Promise.all([
    supabase.from('node').select('*').order('sort_order'),
    supabase.from('v_node_progress').select('*'),
    supabase.from('v_next_date').select('*'),
    supabase.from('v_active_blocker').select('*'),
    supabase.from('entry').select('node_id, entry_date'),
    supabase.from('blocker').select('node_id, title, waiting_on, opened_at, resolved_at'),
    supabase.from('decision').select('node_id'),
    supabase
      .from('spark')
      .select('id, captured_at, saving_value')
      .eq('state', 'new')
      .order('captured_at', { ascending: false }),
    supabase.from('profile').select('id, full_name'),
    supabase.auth.getUser(),
  ])

  const failure = firstError([
    nodesRes, progressRes, nextDateRes, blockerRes,
    entryRes, allBlockerRes, decisionRes, sparkRes, profileRes,
  ])
  if (failure) return <QueryFailure message={failure} />

  const nodes = (nodesRes.data ?? []) as Node[]
  const progress = new Map(
    ((progressRes.data ?? []) as NodeProgress[]).map((p) => [p.node_id, p]),
  )
  const nextDates = new Map(
    ((nextDateRes.data ?? []) as NextDate[]).map((n) => [n.node_id, n]),
  )
  const blockers = (blockerRes.data ?? []) as ActiveBlocker[]
  const entries = (entryRes.data ?? []) as { node_id: string; entry_date: string }[]
  const sparks = (sparkRes.data ?? []) as Pick<Spark, 'id' | 'captured_at' | 'saving_value'>[]

  const me = ((profileRes.data ?? []) as Pick<Profile, 'id' | 'full_name'>[]).find(
    (p) => p.id === authRes.data.user?.id,
  )
  const first = (me?.full_name ?? '').trim().split(/\s+/)[0] || 'there'

  const today = todayIso()
  const wall = copenhagenWall()

  const byId = new Map(nodes.map((n) => [n.id, n]))
  const kids = childrenByParent(nodes)
  const roots = nodes.filter((n) => n.parent_id === null)

  // Which top level project does a node belong to? Walked from the rows above
  // rather than fetched: see lib/subtree on why the id list as its own round
  // trip is the wrong shape.
  const projectOfNode = projectOf(nodes)

  /** Where a node opens: the sheet for a task, the board for anything with parts. */
  const nodeHref = (nodeId: string) => {
    const project = projectOfNode.get(nodeId) ?? nodeId
    if (project === nodeId) return `/p/${project}`
    const n = byId.get(nodeId)
    const leaf = n?.type === 'task' && (kids.get(nodeId) ?? []).length === 0
    return leaf ? `/p/${project}?task=${nodeId}` : `/p/${project}?focus=${nodeId}`
  }
  const titleOf = (nodeId: string) => byId.get(nodeId)?.title ?? 'a part you cannot open'
  const projectTitleOf = (nodeId: string) => titleOf(projectOfNode.get(nodeId) ?? nodeId)

  // What happened that you have not written a line about. Derived, so it
  // disappears by being answered rather than by being dismissed.
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
    blockers: (allBlockerRes.data ?? []) as {
      node_id: string
      title: string
      waiting_on: string
      opened_at: string
      resolved_at: string | null
    }[],
    decisions: (decisionRes.data ?? []) as { node_id: string }[],
    today,
  })

  /* ------------------------------------------------------------------ */
  /* Today. Waits first, longest first; then the loose ends; then the     */
  /* inbox; then the log itself, which is always there.                   */
  /* ------------------------------------------------------------------ */
  const rows: TodayRow[] = []

  for (const b of [...blockers].sort((a, b) => b.days_blocked - a.days_blocked)) {
    const project = projectOfNode.get(b.node_id) ?? b.node_id
    rows.push({
      key: `b${b.id}`,
      glyph: '!',
      rust: true,
      text: `Chase ${b.waiting_on} on ${b.title}`,
      ctx: (
        <>
          Waiting <span className="mono text-rust">{b.days_blocked} days</span> ·{' '}
          {b.expected_by
            ? `expected by ${formatDate(b.expected_by)}`
            : 'no expected reply set'}{' '}
          · {titleOf(b.node_id)}
        </>
      ),
      href: `/p/${project}?bedit=${b.id}`,
      action: <OverviewAct nodeId={b.node_id} label="Chase" />,
      more: [
        { label: 'Open', href: `/p/${project}?bedit=${b.id}` },
        { label: 'Chase again', nodeId: b.node_id },
        { label: 'Close it', href: `/p/${project}?bresolve=${b.id}` },
        { label: 'Set an expected date', href: `/p/${project}?bedit=${b.id}` },
      ],
      right: b.expected_by ? (
        b.overdue ? <span className="tag tag-rust">Overdue</span> : null
      ) : (
        <span className="tag tag-rust">No date</span>
      ),
    })
  }

  for (const l of loose.slice(0, 2)) {
    const project = projectOfNode.get(l.nodeId) ?? l.nodeId
    const inside = project === l.nodeId ? '' : ` · ${projectTitleOf(l.nodeId)}`
    /*
     * The one loose end whose answer is not a log line. A decision has its own
     * form, so that is where Record it goes rather than into the entry box.
     */
    const undecided = l.kind === 'undecided'
    rows.push({
      key: `l${l.nodeId}-${l.kind}-${l.on}`,
      glyph: undecided ? '?' : '·',
      text: l.what,
      ctx: `${titleOf(l.nodeId)}${inside} · ${formatDate(l.on)} · ${l.prompt}`,
      href: nodeHref(l.nodeId),
      action: undecided ? (
        <Link href={`/p/${project}?dnew=${l.nodeId}`} className="act relative z-10">
          Record it
        </Link>
      ) : (
        <OverviewAct nodeId={l.nodeId} label="Write a line" />
      ),
      more: [
        { label: 'Open', href: nodeHref(l.nodeId) },
        { label: 'Write a line', nodeId: l.nodeId },
        { label: 'Record a decision', href: `/p/${project}?dnew=${l.nodeId}` },
      ],
    })
  }

  if (sparks.length > 0) {
    const oldest = sparks[sparks.length - 1]
    const noFigure = sparks.filter((s) => s.saving_value === null).length
    const figures =
      noFigure === sparks.length
        ? sparks.length === 1
          ? 'it carries no figure yet'
          : 'none of them carries a figure yet'
        : noFigure === 0
          ? sparks.length === 1
            ? 'it carries a figure'
            : 'each of them carries a figure'
          : `${noFigure} of them carry no figure yet`
    rows.push({
      key: 'sparks',
      glyph: '○',
      text:
        sparks.length === 1
          ? '1 spark has not been sorted'
          : `${sparks.length} sparks have not been sorted`,
      ctx: `Oldest is from ${formatDate(oldest.captured_at.slice(0, 10))} · ${figures}`,
      href: '/spark',
      action: (
        <Link href="/spark" className="act relative z-10">
          Sort
        </Link>
      ),
      more: [
        { label: 'Open', href: '/spark' },
        { label: 'Assess the oldest', href: `/spark?assess=${oldest.id}` },
      ],
      right: <span className="tag">{sparks.length}</span>,
    })
  }

  const last = [...entries].sort((a, b) => (a.entry_date < b.entry_date ? 1 : -1))[0]
  rows.push({
    key: 'log',
    glyph: '·',
    text:
      entries.length === 0
        ? 'The log holds nothing yet'
        : `The log holds ${entries.length} line${entries.length === 1 ? '' : 's'} in total`,
    ctx: last
      ? `Last one ${formatDate(last.entry_date)}, ${daysBetween(last.entry_date, today)} days ago · Friday assembles the report from these`
      : 'Ctrl K writes the first · Friday assembles the report from these',
    href: '/standup',
    action: (
      <Link href="/standup" className="act relative z-10">
        Open stand-up
      </Link>
    ),
    more: [
      { label: 'Open stand-up', href: '/standup' },
      { label: 'Open Friday', href: '/friday' },
    ],
  })

  /*
   * The line under the greeting. Derived from the same list, so it can only
   * ever say what the rows below it say: how much of today is waiting on
   * somebody else, and whether any of it has a date to argue with.
   */
  const waits = blockers.length
  const dated = blockers.filter((b) => b.expected_by).length
  const waitDays = blockers.reduce((s, b) => s + b.days_blocked, 0)
  const who = [...new Set(blockers.map((b) => b.waiting_on))]
  const whoText =
    who.length <= 1 ? who.join('') : `${who.slice(0, -1).join(', ')} and ${who[who.length - 1]}`
  const share =
    waits === rows.length
      ? waits === 1
        ? 'The one thing on your list is a wait'
        : 'Everything on your list is a wait'
      : `${cap(word(waits))} of the ${word(rows.length)} things on your list ${waits === 1 ? 'is a wait' : 'are waits'}`
  const argue = (() => {
    if (waits === 1) {
      return dated === 1
        ? 'it has an expected reply date to argue with'
        : 'it has no expected reply date to argue with'
    }
    if (dated === 0) return 'none of them has an expected reply date to argue with'
    if (dated === waits) return 'each of them has an expected reply date to argue with'
    return `only ${word(dated)} of them ${dated === 1 ? 'has' : 'have'} an expected reply date to argue with`
  })()
  const greetsub =
    waits > 0
      ? `${share}: ${waitDays} days with ${whoText}, and ${argue}.`
      : 'Nothing is waiting on anybody else today.'

  /* ------------------------------------------------------------------ */
  /* Running now                                                          */
  /* ------------------------------------------------------------------ */
  const running = roots.filter((r) => r.status === 'active')
  const others = roots.length - running.length

  const openIn = new Map<string, number>()
  for (const b of blockers) {
    const key = projectOfNode.get(b.node_id) ?? b.node_id
    openIn.set(key, (openIn.get(key) ?? 0) + 1)
  }

  const cols =
    'lg:grid-cols-[minmax(0,1fr)_200px_100px_90px_120px_120px_44px]'

  return (
    <main>
      <OverviewMasthead first={first} wall={wall}>
        <p className="prose-measure mx-auto mt-[var(--grp)] max-w-[58ch] text-center text-green-soft">
          {greetsub}
        </p>
      </OverviewMasthead>
      <div className="h-px bg-line-strong" />

      <div className="px-[var(--gut)] py-[26px]">
        <div className="work mx-auto">
          {/* Today */}
          <div className="flex flex-wrap items-baseline justify-between gap-4">
            <h2 className="m-0 text-[17px] font-semibold tracking-[-0.025em]">Today</h2>
            <span className="micro text-muted">
              <OverviewDate wall={wall} />
            </span>
          </div>
          <div className="panel grp-gap">
            {rows.map((r) => (
              <div
                key={r.key}
                className="relative flex flex-wrap items-baseline gap-[14px] border-b border-line p-[14px] last:border-b-0 hover:bg-hover"
              >
                <span
                  className={`mono w-[1.1em] shrink-0 text-center ${
                    r.rust ? 'text-rust' : 'text-muted'
                  }`}
                >
                  {r.glyph}
                </span>
                <div className="min-w-0 flex-1 basis-[240px] leading-[1.5]">
                  {/* The row is the action: the link stretches over the whole row. */}
                  <Link href={r.href} className="after:absolute after:inset-0">
                    {r.text}
                  </Link>
                  <div className="mt-[5px] text-[12px] leading-[1.45] text-muted">{r.ctx}</div>
                </div>
                <span className="inline-flex items-baseline gap-[13px] whitespace-nowrap">
                  {r.action}
                  <OverviewMore items={r.more} label={r.text} />
                </span>
                {r.right}
              </div>
            ))}
          </div>

          {/* Running now */}
          <div className="sec-gap">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <h2 className="m-0 text-[17px] font-semibold tracking-[-0.025em]">Running now</h2>
              <div className="flex flex-wrap items-center gap-2.5">
                <Link href="/projects" className="btn btn-ghost">
                  All projects
                </Link>
                <Link href="/?new=root" className="btn">
                  New project
                </Link>
              </div>
            </div>

            {creating === 'root' && (
              <div className="grp-gap">
                <NodeForm parentId={null} redirectTo="/" cancelHref="/" />
              </div>
            )}

            <div className="panel grp-gap text-[13px]">
              <div className={`hidden lg:grid ${cols} border-b border-line-strong`}>
                {['Project', 'Progress', 'Done', 'Next', 'Waiting', 'Stage', ''].map((h, i) => (
                  <div
                    key={h || 'more'}
                    className={`micro px-[14px] py-2 text-muted ${i === 2 || i === 3 ? 'text-right' : ''}`}
                  >
                    {h}
                  </div>
                ))}
              </div>

              {running.length === 0 && (
                <p className="m-0 px-[14px] py-3 text-[13px] text-muted">
                  Nothing is running. New project starts one
                  {others > 0
                    ? `, and the ${others === 1 ? 'one' : others} in another state ${others === 1 ? 'lives' : 'live'} in All projects.`
                    : '.'}
                </p>
              )}

              {running.map((r) => {
                const p = progress.get(r.id)
                const next = nextDates.get(r.id)
                const waiting = openIn.get(r.id) ?? 0
                const identity = readIdentity(r.reporting)
                const code = identity.admin.project_no ?? 'no number'
                const parts = (kids.get(r.id) ?? []).map((k) => k.title)
                const readHref = `/p/${r.id}/identitet`
                return (
                  <div
                    key={r.id}
                    className={`relative grid grid-cols-1 ${cols} border-b border-line last:border-b-0 hover:bg-hover`}
                  >
                    <div className="min-w-0 px-[14px] py-2">
                      <Link
                        href={readHref}
                        className="text-[17px] font-semibold leading-[1.25] tracking-[-0.02em] text-green after:absolute after:inset-0"
                      >
                        {r.title}
                      </Link>
                      <div className="mt-[5px] text-[12px] leading-[1.45] text-muted">
                        {code} · {parts.length > 0 ? parts.join(', ') : 'not broken down yet'}
                      </div>
                    </div>

                    {/*
                      Stacked on a phone, each measure carrying the label the
                      column head would have given it; `contents` at desk width,
                      so the column grid lays them out untouched.
                    */}
                    <div className="flex flex-wrap items-baseline gap-x-7 gap-y-2 px-[14px] pb-3 lg:contents">
                      <div className="flex items-center gap-3 lg:px-[14px] lg:py-2">
                        <span className="micro text-muted lg:hidden">Progress</span>
                        <span className="flex w-[180px] max-w-full">
                          <ProgressScale done={p?.leaf_done ?? 0} total={p?.leaf_total ?? 0} />
                        </span>
                      </div>
                      <div className="mono text-muted lg:px-[14px] lg:py-2 lg:text-right">
                        <span className="micro mr-3 lg:hidden">Done</span>
                        {p?.leaf_done ?? 0} of {p?.leaf_total ?? 0}
                      </div>
                      <div className="mono lg:px-[14px] lg:py-2 lg:text-right">
                        <span className="micro mr-3 text-muted lg:hidden">Next</span>
                        {next ? (
                          <span className={next.days_until < 0 ? 'text-rust' : ''}>
                            {formatDate(next.due_date)}
                          </span>
                        ) : (
                          <span className="text-muted">None</span>
                        )}
                      </div>
                      <div className="lg:px-[14px] lg:py-2">
                        <span className="micro mr-3 text-muted lg:hidden">Waiting</span>
                        {waiting > 0 ? (
                          <span className="tag tag-rust">{waiting} waiting</span>
                        ) : (
                          <span className="text-muted">Nothing</span>
                        )}
                      </div>
                      {/*
                        The one stage this application records for a project is
                        the funding gate. Nothing else in the row is typed.
                      */}
                      <div
                        className={`lg:px-[14px] lg:py-2 ${
                          identity.approval.state === 'Not applied' ? 'text-muted' : ''
                        }`}
                      >
                        <span className="micro mr-3 text-muted lg:hidden">Stage</span>
                        {identity.approval.state}
                      </div>
                      <div className="lg:px-[9px] lg:py-2">
                        <OverviewMore
                          label={r.title}
                          items={[
                            { label: 'Open', href: readHref },
                            { label: 'Work', href: `/p/${r.id}` },
                            { label: 'Edit', href: `/p/${r.id}?edit=${r.id}` },
                            { label: 'Write a line', nodeId: r.id },
                            { label: 'Add a part', href: `/p/${r.id}?new=${r.id}` },
                            { label: 'Record a decision', href: `/p/${r.id}?dnew=${r.id}` },
                          ]}
                        />
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            <p className="prose-measure grp-gap m-0 text-[12px] leading-[1.5] text-muted">
              {running.length} running.
              {others > 0 && ` ${others} more in another state live in All projects.`}
            </p>
          </div>

          {/* Guide left the header; this is the one place it is still named. */}
          <p className="sec-gap m-0">
            <Link href="/guide" className="micro text-muted hover:text-ink">
              Guide
            </Link>
          </p>
        </div>
      </div>
    </main>
  )
}
