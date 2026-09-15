import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { QueryFailure, firstError } from '@/lib/failure'
import { subtreeSet } from '@/lib/subtree'
import { paragraphs } from '@/lib/prose'
import { readIdentity } from '@/lib/identity'
import { readStage } from '@/lib/report'
import { formatDate, formatDateLong } from '@/components/ui'
import { ReadEdit } from '@/components/read-edit'
import { WhereItStands } from '@/components/read-stands'
import type {
  BlockerDays,
  Decision,
  Entry,
  NextDate,
  Node,
  NodeCost,
  NodeDependency,
  NodeProgress,
  NodeStatus,
  ProjectMember,
  Report,
} from '@/lib/types'

export const dynamic = 'force-dynamic'

/**
 * Read: the project's front page.
 *
 * The left column is what somebody wrote: the title, the description as lead
 * paragraphs, and the three questions the PID answers. The right column is
 * what the tree and the log say: four figures, a summary assembled from the
 * work log, and the next dated work. Nothing on the right is typed, and the
 * one form the page has, the identity itself, sits behind «Edit identity» and
 * takes the left column's place while it is open.
 */

/** The state labels as the board names its columns. */
const STATE_LABEL: Record<NodeStatus, string> = {
  idea: 'Idea',
  planned: 'Planned',
  active: 'Active',
  paused: 'On hold',
  done: 'Done',
  cancelled: 'Cancelled',
}

const ROLES: [string, string][] = [
  ['project_owner', 'Project owner'],
  ['project_manager', 'Project manager'],
  ['process_owner', 'Process owner'],
  ['product_owner', 'Product owner'],
  ['creator', 'Created by'],
]

/** Cut at a word boundary, never mid word, and never leaving a comma dangling. */
function clip(text: string, n: number) {
  const t = text.replace(/\s+/g, ' ').trim()
  if (t.length <= n) return t
  const cut = t.slice(0, n)
  const sp = cut.lastIndexOf(' ')
  return `${(sp > n * 0.5 ? cut.slice(0, sp) : cut).replace(/[,;:.-]$/, '')}…`
}

function Sec({ children, small = false }: { children: React.ReactNode; small?: boolean }) {
  return (
    <h2
      className={
        small
          ? 'text-[15px] font-semibold tracking-[-0.02em]'
          : 'text-[17px] font-semibold tracking-[-0.025em]'
      }
    >
      {children}
    </h2>
  )
}

function Paras({ text, ink = false }: { text: string; ink?: boolean }) {
  return (
    <div
      className={`grp-gap flex max-w-[64ch] flex-col gap-[18px] text-[15px] leading-[1.55] ${
        ink ? 'text-ink' : 'text-green-soft'
      }`}
    >
      {paragraphs(text).map((p, i) => (
        <p key={i} className="whitespace-pre-line">
          {p}
        </p>
      ))}
    </div>
  )
}

export default async function ReadPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ edit?: string }>
}) {
  const { id } = await params
  const { edit } = await searchParams
  const supabase = await createClient()

  /*
   * One round trip. The portfolio is fetched whole and cut to the subtree
   * here, and the edit form's data rides along rather than being a second
   * wait when the link is followed: it is a few dozen rows either way.
   */
  const [
    nodeRes,
    entryRes,
    blockerRes,
    decisionRes,
    progressRes,
    nextRes,
    costRes,
    markRes,
    strategyRes,
    sparkRes,
    reportRes,
    dependsRes,
    dependedRes,
    memberRes,
    profileRes,
  ] = await Promise.all([
    supabase.from('node').select('*').order('sort_order'),
    supabase.from('entry').select('*').order('entry_date', { ascending: false }),
    supabase.from('v_blocker_days').select('*'),
    supabase.from('decision').select('*').order('decided_on', { ascending: false }),
    supabase.from('v_node_progress').select('*').eq('node_id', id).maybeSingle(),
    supabase.from('v_next_date').select('*').eq('node_id', id).maybeSingle(),
    supabase.from('v_node_cost').select('*').eq('node_id', id).maybeSingle(),
    supabase.from('v_strategy_node').select('node_id, strategy_id').eq('node_id', id),
    supabase.from('strategy').select('id, name'),
    supabase.from('spark').select('id, body').eq('became_node_id', id).limit(1),
    supabase
      .from('report')
      .select('*')
      .eq('node_id', id)
      .order('period_end', { ascending: false }),
    supabase.from('node_dependency').select('*').eq('node_id', id),
    supabase.from('node_dependency').select('*').eq('depends_on_id', id),
    supabase.from('project_member').select('*').eq('project_id', id),
    supabase.from('profile').select('id, email, full_name'),
  ])

  /*
   * Every read is load bearing: a failed one renders a project that looks
   * empty rather than a page that says why. The project itself is found in
   * the node list below and left to notFound(), because a project you are not
   * a member of is absent rather than broken.
   */
  const failure = firstError([
    nodeRes,
    entryRes,
    blockerRes,
    decisionRes,
    progressRes,
    nextRes,
    costRes,
    markRes,
    strategyRes,
    sparkRes,
    reportRes,
    dependsRes,
    dependedRes,
    memberRes,
    profileRes,
  ])
  if (failure) return <QueryFailure message={failure} />

  const everyNode = (nodeRes.data ?? []) as Node[]
  const project = everyNode.find((n) => n.id === id)
  if (!project) notFound()

  const inProject = subtreeSet(everyNode, id)
  const nodes = everyNode.filter((n) => inProject.has(n.id))
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const titleOf = (nodeId: string) => byId.get(nodeId)?.title ?? ''
  const hasKids = new Set(nodes.map((n) => n.parent_id).filter((p): p is string => p !== null))

  const entries = ((entryRes.data ?? []) as Entry[]).filter((e) => inProject.has(e.node_id))
  const blockers = ((blockerRes.data ?? []) as BlockerDays[]).filter((b) =>
    inProject.has(b.node_id),
  )
  const open = blockers.filter((b) => b.is_active)
  const decisions = ((decisionRes.data ?? []) as Decision[]).filter((d) =>
    inProject.has(d.node_id),
  )
  const progress = progressRes.data as NodeProgress | null
  const next = nextRes.data as NextDate | null
  const cost = costRes.data as NodeCost | null
  const reports = (reportRes.data ?? []) as Report[]
  const origin = ((sparkRes.data ?? []) as { id: string; body: string }[])[0]

  // What the project itself is marked as serving. A marking on a part below
  // says where a saving comes from, and belongs to the budget, not here.
  const strategyName = new Map(
    ((strategyRes.data ?? []) as { id: string; name: string }[]).map((s) => [s.id, s.name]),
  )
  const serves = ((markRes.data ?? []) as { strategy_id: string }[])
    .map((m) => strategyName.get(m.strategy_id))
    .filter((n): n is string => !!n)

  const identity = readIdentity(project.reporting)
  const stage = readStage(project.reporting)
  const base = `/p/${id}`
  const here = `${base}/identitet`

  /** Open blockers on the node itself: its own wait, not its subtree's. */
  const worstWait = (nodeId: string) =>
    open.filter((b) => b.node_id === nodeId).reduce((w, b) => Math.max(w, b.days_blocked), 0)

  /**
   * What is next: the dated, unfinished work under the project, soonest
   * first, six of it. The project's own deadline is left out because it is
   * the frame, not a piece of work.
   */
  const upcoming = nodes
    .filter(
      (n) =>
        n.id !== id &&
        n.due_date !== null &&
        n.status !== 'done' &&
        n.status !== 'cancelled',
    )
    .sort((a, b) => (a.due_date! < b.due_date! ? -1 : 1))
    .slice(0, 6)

  /** A part opens on the board at its level; a task opens as a sheet over it. */
  const hrefOf = (n: Node) =>
    hasKids.has(n.id) ? `${base}?focus=${n.id}` : `${base}?task=${n.id}`

  const label = [
    identity.admin.project_no ?? 'No number',
    identity.location,
    stage,
  ].filter(Boolean)
  const roles = ROLES.filter(([key]) => identity.people[key])

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
      {/* ------------------------------------------------------------------ */}
      {/* Left: what was written                                              */}
      {/* ------------------------------------------------------------------ */}
      <div className="min-w-0 px-[var(--gut)] py-[26px] lg:py-[34px] lg:pr-7">
        {edit ? (
          <ReadEdit
            project={project}
            everyNode={everyNode}
            members={(memberRes.data ?? []) as ProjectMember[]}
            accounts={
              (profileRes.data ?? []) as { id: string; email: string; full_name: string | null }[]
            }
            dependsOn={(dependsRes.data ?? []) as NodeDependency[]}
            dependedOnBy={(dependedRes.data ?? []) as NodeDependency[]}
            costRoll={cost}
            readHref={here}
          />
        ) : (
          <div>
            <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
              <div className="lbl text-muted">{label.join(' · ')}</div>
              <div className="flex gap-5">
                <Link href={`${here}?edit=1`} className="act">
                  Edit identity
                </Link>
                <Link href={`${base}/brief`} className="act">
                  Print the brief
                </Link>
              </div>
            </div>
            <h1 className="mt-2 text-[34px] font-semibold leading-[1.08] tracking-[-0.03em] text-green text-balance">
              {project.title}
            </h1>

            {project.description ? (
              <div className="sec-gap flex max-w-[64ch] flex-col gap-[18px] text-[23px] leading-[1.45] tracking-[-0.01em] text-ink">
                {paragraphs(project.description).map((p, i) => (
                  <p key={i} className="whitespace-pre-line">
                    {p}
                  </p>
                ))}
              </div>
            ) : (
              <p className="sec-gap max-w-[64ch] text-[23px] leading-[1.45] text-muted">
                No description yet. Edit identity to say what this project is.
              </p>
            )}

            {identity.pid.goal ? (
              <div className="sec-gap">
                <Sec small>What it has to achieve</Sec>
                <Paras text={identity.pid.goal} ink />
              </div>
            ) : (
              /*
               * The goal is the one PID field with a consequence: a project
               * nobody can state the point of is one nobody can ever close.
               * So its absence is said in rust, where the other two are simply
               * not shown.
               */
              <div className="sec-gap">
                <Sec small>What it has to achieve</Sec>
                <p className="grp-gap max-w-[64ch] text-[15px] leading-[1.55] text-rust">
                  No goal written. Until one is, there is no way to tell when this project is
                  finished.
                </p>
              </div>
            )}
            {identity.pid.situation && (
              <div className="sec-gap">
                <Sec small>Where we are</Sec>
                <Paras text={identity.pid.situation} />
              </div>
            )}
            {identity.pid.opportunity && (
              <div className="sec-gap">
                <Sec small>Why now</Sec>
                <Paras text={identity.pid.opportunity} />
              </div>
            )}

            {/* Who holds it: the roles, the frame, and what it serves */}
            <div className="sec-gap">
              <Sec>Who holds it</Sec>
              <div className="panel grp-gap">
                <table className="tbl">
                  <tbody>
                    {roles.length === 0 && (
                      <tr>
                        <td className="lbl text-muted">Roles</td>
                        <td className="grow text-rust">Nobody is named yet.</td>
                      </tr>
                    )}
                    {roles.map(([key, name]) => (
                      <tr key={key}>
                        <td className="lbl text-muted">{name}</td>
                        <td className="grow">{identity.people[key]}</td>
                      </tr>
                    ))}
                    <tr>
                      <td className="lbl text-muted">Runs</td>
                      <td className="grow mono">
                        {project.start_date ? formatDateLong(project.start_date) : 'No start'}
                        {' – '}
                        {project.due_date ? formatDateLong(project.due_date) : 'no deadline'}
                      </td>
                    </tr>
                    <tr>
                      <td className="lbl text-muted">Serves</td>
                      <td className="grow">
                        {serves.length > 0 ? (
                          serves.join(', ')
                        ) : (
                          <span className="text-rust">Not marked against a strategy</span>
                        )}
                      </td>
                    </tr>
                    <tr>
                      <td className="lbl text-muted">Approval</td>
                      <td className="grow">
                        {identity.approval.state}
                        {identity.approval.decided_on && (
                          <span className="text-muted">
                            {' '}
                            · {formatDate(identity.approval.decided_on)}
                          </span>
                        )}
                      </td>
                    </tr>
                    {origin && (
                      <tr>
                        <td className="lbl text-muted">Began as</td>
                        <td className="grow">{clip(origin.body, 120)}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Decided along the way */}
            <div className="sec-gap">
              <Sec>Decided along the way</Sec>
              {decisions.length === 0 ? (
                <p className="grp-gap max-w-[64ch] text-[15px] leading-[1.55] text-green-soft">
                  Nothing has been recorded as a decision yet. Choices were made somewhere
                  along the way; none of them is written down here, and in six months the
                  rationale is the half that will be missing.
                </p>
              ) : (
                <div className="panel panel-list grp-gap text-[13px]">
                  {decisions.map((d) => (
                    <div key={d.id}>
                      <div className="flex items-baseline gap-4">
                        <span className="min-w-0 flex-1 leading-snug">{d.decision}</span>
                        <span className="mono shrink-0 text-[12px] text-muted">
                          {formatDate(d.decided_on)}
                        </span>
                      </div>
                      <div className="mt-1 text-[12px] leading-snug text-muted">
                        {titleOf(d.node_id)}
                        {d.rationale ? (
                          <> · {d.rationale}</>
                        ) : (
                          <span className="text-rust"> · No rationale recorded</span>
                        )}
                        {d.alternatives && <> · Rejected: {d.alternatives}</>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Right: what the tree and the log say                                */}
      {/* ------------------------------------------------------------------ */}
      <div className="min-w-0 border-t border-line px-[var(--gut)] py-[26px] lg:border-t-0 lg:border-l lg:py-[34px] lg:pl-7">
        {/*
          Four figures. Two by two until the column is wide enough for a row
          of four, measured on the panel rather than the window, because the
          column is what the figures have to fit.
        */}
        <div className="panel @container">
          <div className="grid grid-cols-2 @3xl:grid-cols-4">
            {[
              {
                key: 'done',
                value: progress?.leaf_done ?? 0,
                small: ` of ${progress?.leaf_total ?? 0}`,
                label: 'Tasks finished',
                rust: false,
              },
              { key: 'open', value: open.length, label: 'Open blockers', rust: open.length > 0 },
              {
                key: 'next',
                value: next ? next.days_until : '-',
                label: 'Days to next date',
                rust: next !== null && next.days_until < 0,
              },
              {
                key: 'priced',
                value: cost?.items ?? 0,
                label: 'Priced lines',
                rust: !cost || cost.items === 0,
              },
            ].map((f) => (
              <div
                key={f.key}
                className="border-line px-6 py-[18px] [&:nth-child(even)]:border-l [&:nth-child(n+3)]:border-t @3xl:[&:nth-child(n+2)]:border-l @3xl:[&:nth-child(n+3)]:border-t-0"
              >
                <b className={`fig-num ${f.rust ? '!text-rust' : ''}`}>
                  {f.value}
                  {'small' in f && f.small && (
                    <small className="font-sans text-[12px] font-normal tracking-normal text-muted">
                      {f.small}
                    </small>
                  )}
                </b>
                <span className="mt-[9px] block text-[12px] leading-[1.4] text-muted">
                  {f.label}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="sec-gap">
          <div className="flex flex-wrap items-baseline justify-between gap-4">
            <Sec>Where it stands</Sec>
            <span className="micro text-muted">Assembled from the log</span>
          </div>
          <WhereItStands
            entries={entries}
            open={open}
            progress={progress}
            titleOf={titleOf}
            logHref={base}
          />
        </div>

        <div className="sec-gap">
          <Sec>What is next</Sec>
          <div className="panel grp-gap">
            <table className="tbl">
              <tbody>
                {upcoming.length === 0 ? (
                  <tr>
                    <td className="grow text-muted">No dated work under this project.</td>
                  </tr>
                ) : (
                  upcoming.map((n) => {
                    const wait = worstWait(n.id)
                    return (
                      <tr key={n.id}>
                        <td className="mono text-muted">{formatDate(n.due_date!)}</td>
                        <td className="grow">
                          <Link href={hrefOf(n)} className="block hover:text-green">
                            {n.title}
                          </Link>
                          <div className="mt-[5px] text-[12px] leading-[1.45] text-muted">
                            {n.parent_id ? titleOf(n.parent_id) : ''}
                          </div>
                        </td>
                        <td>
                          {wait > 0 ? (
                            <span className="tag tag-rust">Blocked {wait}d</span>
                          ) : (
                            <span className="tag">{STATE_LABEL[n.status]}</span>
                          )}
                        </td>
                        <td>
                          <Link href={hrefOf(n)} className="more" aria-label={`Open ${n.title}`}>
                            ⋯
                          </Link>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/*
          The report archive. Friday writes one when a week is marked
          reported; here they are read back with their period and whether
          they left the building.
        */}
        <div className="sec-gap">
          <div className="panel">
            <div className="panel-h">
              <Sec>Reports</Sec>
              <Link href="/friday" className="act">
                This week
              </Link>
            </div>
            {reports.length === 0 ? (
              <p className="panel-b text-[13px] text-muted">
                No saved reports yet. Go to Friday, choose a phase and mark it reported, and it
                will land here.
              </p>
            ) : (
              <div className="panel-list text-[13px]">
                {reports.map((r) => (
                  <div key={r.id} className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                    <span className="mono min-w-0 flex-1 text-muted">
                      {formatDate(r.period_start)} – {formatDateLong(r.period_end)}
                    </span>
                    {typeof r.fields?.progress === 'string' && (
                      <span
                        className={
                          r.fields.progress === 'Off Track' ? 'text-rust' : 'text-green-soft'
                        }
                      >
                        {r.fields.progress}
                      </span>
                    )}
                    <span className={`tag ${r.submitted ? '' : 'text-muted'}`}>
                      {r.submitted ? 'Reported' : 'Draft'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
