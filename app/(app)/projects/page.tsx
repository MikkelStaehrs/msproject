import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { nameOf, readPeopleById } from '@/lib/person-data'
import { readIdentity } from '@/lib/identity'
import { QueryFailure, firstError } from '@/lib/failure'
import { projectOf, subtreeSet } from '@/lib/subtree'
import { NodeForm } from '@/components/node-form'
import { formatDate } from '@/components/ui'
import {
  ProjectsTable,
  SORT_KEYS,
  STATE_LABEL,
  type ProjectGroup,
  type ProjectRow,
  type SortKey,
} from '@/components/projects-table'
import type {
  ActiveBlocker,
  NextDate,
  Node,
  NodeProgress,
  NodeStatus,
} from '@/lib/types'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Projects' }

/**
 * Cut at a word, the way the concept does, so a description never ends in
 * half a word. Trailing punctuation goes with the cut, because «and,…» reads
 * as damage.
 */
function clip(text: string | null | undefined, n: number): string {
  const t = String(text ?? '').replace(/\s+/g, ' ').trim()
  if (t.length <= n) return t
  const cut = t.slice(0, n)
  const sp = cut.lastIndexOf(' ')
  return (sp > n * 0.5 ? cut.slice(0, sp) : cut).replace(/[,;:.\-]$/, '') + '…'
}

/**
 * Every project, whatever state it is in, grouped by what it serves.
 *
 * The browser is the one place a finished project can be found without
 * knowing its address, and the one place two projects sit in the same row
 * shape to be compared. The grouping is the strategy marking, because that is
 * the question the portfolio is assembled against; a project nobody has
 * marked lands in its own group in rust, since Budget cannot add up work that
 * is not marked.
 */
export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{
    state?: string
    serves?: string
    sort?: string
    dir?: string
    new?: string
    edit?: string
  }>
}) {
  const params = await searchParams
  const supabase = await createClient()

  const [nodeRes, progressRes, nextRes, blockerRes, markRes, stratRes] = await Promise.all([
    supabase.from('node').select('*').order('sort_order'),
    supabase.from('v_node_progress').select('*'),
    supabase.from('v_next_date').select('*'),
    supabase.from('v_active_blocker').select('*'),
    supabase.from('v_strategy_node').select('node_id, strategy_id'),
    supabase
      .from('strategy')
      .select('id, name, description, sort_order')
      .order('sort_order')
      .order('name'),
  ])

  const failure = firstError([nodeRes, progressRes, nextRes, blockerRes, markRes, stratRes])
  if (failure) return <QueryFailure message={failure} />

  type StrategyRow = { id: string; name: string; description: string | null; sort_order: number }
  const strategies = (stratRes.data ?? []) as StrategyRow[]
  const strategyById = new Map(strategies.map((s) => [s.id, s]))

  /* What each project is marked as serving, by id, in the strategies' order. */
  const marks = new Map<string, string[]>()
  for (const m of (markRes.data ?? []) as { node_id: string; strategy_id: string }[]) {
    if (!strategyById.has(m.strategy_id)) continue
    marks.set(m.node_id, [...(marks.get(m.node_id) ?? []), m.strategy_id])
  }
  const order = new Map(strategies.map((s, i) => [s.id, i]))
  for (const list of marks.values()) {
    list.sort((a, b) => (order.get(a) ?? 99) - (order.get(b) ?? 99))
  }

  const nodes = (nodeRes.data ?? []) as Node[]
  const roots = nodes.filter((n) => n.parent_id === null)
  const progress = new Map(
    ((progressRes.data ?? []) as NodeProgress[]).map((p) => [p.node_id, p]),
  )
  const nextDates = new Map(((nextRes.data ?? []) as NextDate[]).map((n) => [n.node_id, n]))

  /*
   * Open blockers anywhere in a project, gathered under its root. Walked from
   * the rows above rather than fetched: see lib/subtree.
   */
  const projectOfNode = projectOf(nodes)
  const openIn = new Map<string, ActiveBlocker[]>()
  for (const b of (blockerRes.data ?? []) as ActiveBlocker[]) {
    const key = projectOfNode.get(b.node_id)
    if (key) openIn.set(key, [...(openIn.get(key) ?? []), b])
  }

  const peopleById = await readPeopleById(supabase)

  const rows: ProjectRow[] = roots.map((r) => {
    const p = progress.get(r.id)
    const nx = nextDates.get(r.id)
    const open = openIn.get(r.id) ?? []
    const roles = readIdentity(r.reporting).people
    const projectNo = r.reporting?.project_no
    const servesIds = marks.get(r.id) ?? []
    /*
     * The project owner if a role says so, otherwise whoever created it, and
     * otherwise the driver on the project itself. Three answers to «whose is
     * this» and the column wants the most specific one that exists.
     *
     * All three are account ids now, so this reads a name out of `profile`
     * rather than out of the jsonb. The type checker did not catch this one
     * when the shape changed, because the blob was read through an `unknown`
     * cast: the column would simply have started showing a uuid.
     */
    const driverId = roles.project_owner?.[0] ?? roles.creator?.[0] ?? r.driver_id
    return {
      id: r.id,
      code: typeof projectNo === 'string' ? projectNo : '',
      title: r.title,
      line: clip((r.description ?? '').split('\n')[0], 96),
      status: r.status,
      progress: p && p.leaf_total > 0 ? p.leaf_done / p.leaf_total : 0,
      done: p?.leaf_done ?? 0,
      total: p?.leaf_total ?? 0,
      next: nx ? nx.due_date : '9999',
      nextLabel: nx ? formatDate(nx.due_date) : null,
      wait: open.length ? Math.max(...open.map((b) => b.days_blocked)) : 0,
      waitWho: [...new Set(open.map((b) => b.waiting_on))].join(', '),
      serves: servesIds.length
        ? servesIds.map((id) => strategyById.get(id)?.name ?? '').join(', ')
        : null,
      owner: driverId ? nameOf(peopleById, driverId) : (r.driver_name ?? ''),
    }
  })

  /* ---------------------------------------------------------------------- */
  /* The two filters and the sort, all in the address.                       */
  /* ---------------------------------------------------------------------- */

  const STATES: NodeStatus[] = ['idea', 'planned', 'active', 'paused', 'done', 'cancelled']
  const present = STATES.filter((s) => roots.some((r) => r.status === s))
  const state: NodeStatus | 'all' = (STATES as string[]).includes(params.state ?? '')
    ? (params.state as NodeStatus)
    : 'all'
  const serves: string =
    params.serves === 'none' || strategyById.has(params.serves ?? '')
      ? (params.serves as string)
      : 'all'
  const sort: SortKey = (SORT_KEYS as string[]).includes(params.sort ?? '')
    ? (params.sort as SortKey)
    : 'title'
  const dir: 1 | -1 = params.dir === 'desc' ? -1 : 1

  const shown = rows
    .filter((x) => state === 'all' || x.status === state)
    .filter((x) => {
      if (serves === 'all') return true
      if (serves === 'none') return x.serves === null
      return (marks.get(x.id) ?? []).includes(serves)
    })
    .sort((a, b) => {
      const x = a[sort] ?? ''
      const y = b[sort] ?? ''
      return (x < y ? -1 : x > y ? 1 : 0) * dir
    })

  /*
   * Grouped by the joined marking, in the strategies' own order, the unmarked
   * last. A project marked against two strategies makes a group of its own:
   * it belongs to both, and listing it twice would count it twice.
   */
  const byKey = new Map<string, ProjectRow[]>()
  for (const x of shown) {
    const k = x.serves ?? '__none'
    byKey.set(k, [...(byKey.get(k) ?? []), x])
  }
  const rank = (k: string) => {
    if (k === '__none') return Number.MAX_SAFE_INTEGER
    const s = strategies.find((z) => z.name === k)
    return s ? s.sort_order : 99
  }
  const groups: ProjectGroup[] = [...byKey.keys()]
    .sort((a, b) => rank(a) - rank(b))
    .map((k) => {
      const s = strategies.find((z) => z.name === k)
      return k === '__none'
        ? {
            key: null,
            name: 'Not marked against a strategy',
            note: 'These projects are invisible on Budget: nothing can be added up from work that is not marked.',
            rows: byKey.get(k) ?? [],
          }
        : {
            key: k,
            name: k,
            note: s?.description ? clip(s.description, 120) : null,
            rows: byKey.get(k) ?? [],
          }
    })

  /** The address with the filters and sort kept, and one thing changed. */
  const href = (change: Partial<Record<'state' | 'serves' | 'sort' | 'dir' | 'new' | 'edit', string | null>>) => {
    const q: Record<string, string> = {}
    if (state !== 'all') q.state = state
    if (serves !== 'all') q.serves = serves
    if (sort !== 'title') q.sort = sort
    if (dir < 0) q.dir = 'desc'
    for (const [k, v] of Object.entries(change)) {
      if (v === null || v === undefined) delete q[k]
      else q[k] = v
    }
    const s = new URLSearchParams(q).toString()
    return s ? `/projects?${s}` : '/projects'
  }
  const here = href({})
  const sortHref = (key: SortKey) =>
    key === sort ? href({ dir: dir > 0 ? 'desc' : null }) : href({ sort: key, dir: null })

  const creating = params.new === 'root'
  const editing = params.edit ? roots.find((r) => r.id === params.edit) : undefined

  return (
    <main>
      {/* The band. Three cells, the frame running to the gutter. */}
      <div className="grid grid-cols-1 border-b border-line-strong lg:grid-cols-[auto_1fr_auto]">
        <div className="lbl px-[var(--gut)] py-2.5 text-muted lg:pr-6">Projects</div>
        <div className="lbl border-t border-line px-[var(--gut)] py-2.5 text-muted lg:border-l lg:border-t-0 lg:px-6">
          Everything, whatever state it is in
        </div>
        <div className="flex flex-wrap items-center gap-4 border-t border-line px-[var(--gut)] py-2.5 lg:border-l lg:border-t-0">
          {/* Templates leaves the header and lives beside the thing it makes. */}
          <Link href="/templates" className="act">
            Templates
          </Link>
          <Link href={creating ? here : href({ new: 'root' })} className={creating ? 'act' : 'btn'}>
            {creating ? 'Close' : 'New project'}
          </Link>
        </div>
      </div>

      <div className="px-[var(--gut)] py-[26px]">
        <div className="work mx-auto">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <h1 className="text-[34px] font-semibold leading-[1.08] tracking-[-0.03em] text-green [text-wrap:balance]">
              All projects
            </h1>
            <span className="micro text-muted">
              {shown.length} of {roots.length}
            </span>
          </div>

          {creating && (
            <div className="grp-gap">
              <NodeForm parentId={null} redirectTo={here} cancelHref={here} />
            </div>
          )}
          {editing && (
            <div className="grp-gap">
              <NodeForm
                node={editing}
                descendantCount={subtreeSet(nodes, editing.id).size - 1}
                redirectTo={here}
                cancelHref={here}
              />
            </div>
          )}

          {/* Two filters, mono switches, kept apart from the actions above. */}
          <div className="grp-gap">
            <div className="flex flex-wrap items-baseline gap-2.5">
              <span className="lbl min-w-[64px] text-muted">State</span>
              <div className="filterrow flex-1">
                <Link href={href({ state: null })} aria-pressed={state === 'all'}>
                  All
                </Link>
                {present.map((s) => (
                  <Link key={s} href={href({ state: s })} aria-pressed={state === s}>
                    {STATE_LABEL[s]}
                  </Link>
                ))}
              </div>
            </div>
            <div className="mt-2 flex flex-wrap items-baseline gap-2.5">
              <span className="lbl min-w-[64px] text-muted">Serves</span>
              <div className="filterrow flex-1">
                <Link href={href({ serves: null })} aria-pressed={serves === 'all'}>
                  Any
                </Link>
                {strategies.map((s) => (
                  <Link key={s.id} href={href({ serves: s.id })} aria-pressed={serves === s.id}>
                    {s.name}
                  </Link>
                ))}
                <Link href={href({ serves: 'none' })} aria-pressed={serves === 'none'}>
                  Not marked
                </Link>
              </div>
            </div>
          </div>

          {/*
            No scroller. The row stacks below lg, so nothing here ever needs
            to move sideways, and a box with overflow set cannot let the
            overflow menu out of it.
          */}
          <div className="panel grp-gap max-w-[1360px]">
            <ProjectsTable
              groups={groups}
              sort={sort}
              dir={dir}
              sortHref={sortHref}
              editHref={(id) => href({ edit: id })}
              here={here}
            />
          </div>

          <p className="grp-gap max-w-[64ch] text-[12px] leading-[1.5] text-muted">
            Find and compare here. What the work is worth against the year is on{' '}
            <Link href="/strategy" className="act">
              Budget
            </Link>
            .
          </p>
        </div>
      </div>
    </main>
  )
}
