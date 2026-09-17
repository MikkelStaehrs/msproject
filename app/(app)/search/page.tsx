import Link from 'next/link'
import { Folder } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { QueryFailure, firstError } from '@/lib/failure'
import { childrenByParent, projectOf } from '@/lib/subtree'
import { wbsCodes } from '@/lib/wbs'
import { formatDate } from '@/components/ui'
import { SearchField } from '@/components/search-field'
import { Mark, around, hit } from '@/components/search-mark'
import { SearchMore, type SearchMoreItem } from '@/components/search-more'
import { STATE_LABEL } from '@/components/projects-table'
import { SPARK_STATE_LABEL, TYPE_LABEL } from '@/lib/types'
import type {
  BlockerDays,
  Document,
  Entry,
  Node,
  NodeState,
  Spark,
} from '@/lib/types'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Search' }

/**
 * One field, across everything you can open.
 *
 * The query is the address. `?q=` is rendered on the server like every other
 * list in the app, which means a search can be linked to, kept in history and
 * read by the back button; the only script on the page is the field itself,
 * for the focus and the Escape the band promises.
 *
 * The tables are fetched whole and cut here. The portfolio is a few dozen
 * nodes and the log a few hundred lines, so one round trip that returns
 * everything beats six that each ask the database to repeat the same `ilike`,
 * and the match can then be marked in the text rather than only counted.
 *
 * Six groups, in the order a search is usually meant: the project, the part,
 * what is stuck, what was written, what was thought, what was filed.
 */

/** How many rows a group shows before it says how many it is holding back. */
const CAP_TABLE = 12
const CAP_LIST = 20

/** The concept's two spacings: 44 px between groups, and only there. */
function GroupHead({ title, count, first }: { title: string; count: number; first: boolean }) {
  return (
    <h2
      className={`text-[15px] font-semibold tracking-[-0.02em] text-ink ${
        first ? '' : 'sec-gap'
      }`}
    >
      {title} <span className="micro ml-1.5 text-muted">{count}</span>
    </h2>
  )
}

/**
 * A group that found more than it shows says so. Dropping rows quietly is the
 * one thing that would make a search field lie about the database.
 */
function Held({ held }: { held: number }) {
  if (held <= 0) return null
  return (
    <p className="mt-2.5 text-[12px] text-muted">
      {held} more {held === 1 ? 'match is' : 'matches are'} not shown. Narrow the search.
    </p>
  )
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const params = await searchParams
  const typed = (params.q ?? '').trim()
  const q = typed.toLowerCase()

  /* The band and the field are the page. Everything below them is the answer. */
  const band = (
    <div className="grid grid-cols-1 border-b border-line-strong lg:grid-cols-[auto_1fr_auto]">
      <div className="lbl px-[var(--gut)] py-2.5 text-muted">Search</div>
      <div className="lbl border-t border-line px-[var(--gut)] py-2.5 text-muted lg:border-l lg:border-t-0 lg:px-6">
        Across every project you can open
      </div>
      <div className="flex flex-wrap items-center gap-4 border-t border-line px-[var(--gut)] py-2.5 lg:border-l lg:border-t-0">
        <span className="kbd">Esc</span>
      </div>
    </div>
  )

  /*
   * Nothing typed, nothing asked. The empty state names what is searched, so
   * the field does not have to be tried once per kind of thing to find out.
   */
  if (q === '') {
    return (
      <main>
        {band}
        <div className="px-[var(--gut)] py-[26px]">
          <div className="work mx-auto">
            <SearchField q="" count={null} />
            <p className="prose-measure mt-[26px] text-[15px] text-green-soft">
              Type to search projects, parts, blockers, log lines, sparks and files.
            </p>
          </div>
        </div>
      </main>
    )
  }

  const supabase = await createClient()

  const [nodeRes, stateRes, blockerRes, entryRes, sparkRes, docRes] = await Promise.all([
    supabase.from('node').select('*').order('sort_order'),
    supabase.from('v_node_state').select('*'),
    supabase.from('v_blocker_days').select('*'),
    supabase.from('entry').select('id, node_id, entry_date, kind, body'),
    supabase.from('spark').select('*'),
    supabase.from('document').select('*'),
  ])

  const failure = firstError([nodeRes, stateRes, blockerRes, entryRes, sparkRes, docRes])
  if (failure) return <QueryFailure message={failure} />

  const nodes = (nodeRes.data ?? []) as Node[]
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const kids = childrenByParent(nodes)
  const rootOf = projectOf(nodes)
  const states = new Map(((stateRes.data ?? []) as NodeState[]).map((s) => [s.node_id, s]))

  /*
   * The WBS code is a path, not an identifier, so it is walked from the rows
   * the page already holds rather than stored. One walk per project, because
   * the numbering restarts at each project number.
   */
  const codes = new Map<string, string>()
  for (const r of nodes.filter((n) => n.parent_id === null)) {
    const no = r.reporting?.project_no
    for (const [id, code] of wbsCodes(nodes, r.id, typeof no === 'string' ? no : '')) {
      codes.set(id, code)
    }
  }

  /** The ancestors above a node, the project first. Empty for a project. */
  const pathOf = (n: Node) => {
    const parts: string[] = []
    let up = n.parent_id
    while (up) {
      const parent = byId.get(up)
      if (!parent) break
      parts.unshift(parent.title)
      up = parent.parent_id
    }
    return parts.join(' › ')
  }

  /* Where a row goes when it is clicked. A leaf task opens as a task sheet. */
  const isLeafTask = (n: Node) => n.type === 'task' && (kids.get(n.id) ?? []).length === 0
  const nodeHref = (n: Node) => {
    const root = rootOf.get(n.id) ?? n.id
    if (n.id === root) return `/p/${root}/identitet`
    return isLeafTask(n) ? `/p/${root}?task=${n.id}` : `/p/${root}?focus=${n.id}`
  }

  const nodeHits = nodes.filter((n) => hit(n.title, q) || hit(n.description, q))
  const projectHits = nodeHits.filter((n) => n.parent_id === null)
  const partHits = nodeHits.filter((n) => n.parent_id !== null)

  const blockerHits = ((blockerRes.data ?? []) as BlockerDays[])
    .filter((b) => hit(b.title, q) || hit(b.waiting_on, q))
    .sort((a, b) => (a.opened_at < b.opened_at ? 1 : -1))

  const entryHits = ((entryRes.data ?? []) as Entry[])
    .filter((e) => hit(e.body, q))
    .sort((a, b) => (a.entry_date < b.entry_date ? 1 : -1))

  const sparkHits = ((sparkRes.data ?? []) as Spark[])
    .filter((s) => hit(s.body, q) || hit(s.note, q))
    .sort((a, b) => (a.captured_at < b.captured_at ? 1 : -1))

  const docHits = ((docRes.data ?? []) as Document[])
    .filter((d) => hit(d.name, q) || hit(d.folder, q))
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))

  const total =
    projectHits.length +
    partHits.length +
    blockerHits.length +
    entryHits.length +
    sparkHits.length +
    docHits.length

  /* The heading of the first group present carries no 44 px above it. */
  let seen = 0
  const first = () => seen++ === 0

  /* ---------------------------------------------------------------------- */
  /* One row shape for a node, whether it is a project or a part.            */
  /* ---------------------------------------------------------------------- */

  const NodeRows = ({ rows, project }: { rows: Node[]; project: boolean }) => (
    <tbody>
      {rows.slice(0, CAP_TABLE).map((n) => {
        const st = states.get(n.id)
        const blocked = st ? st.is_blocked : false
        const overdue = n.due_date !== null && n.status !== 'done' && n.due_date < new Date().toISOString().slice(0, 10)
        const code = codes.get(n.id) ?? ''
        const titleHit = hit(n.title, q)
        const more: SearchMoreItem[] = project
          ? [
              { label: 'Open the board', href: `/p/${n.id}` },
              { label: 'Files', href: `/p/${n.id}/dokumenter` },
              { label: 'Write a line', nodeId: n.id },
            ]
          : [
              { label: 'Open on the board', href: `/p/${rootOf.get(n.id) ?? n.id}?focus=${n.id}` },
              { label: 'Edit', href: `/p/${rootOf.get(n.id) ?? n.id}?edit=${n.id}` },
              { label: 'Add a part', href: `/p/${rootOf.get(n.id) ?? n.id}?new=${n.id}` },
              { label: 'Write a line', nodeId: n.id },
            ]
        return (
          <tr key={n.id} className="relative">
            <td className="mono text-[12px] text-muted">
              {code !== '' ? code : <span className="text-rust">Not registered</span>}
            </td>
            <td className="grow">
              {/* The row is the primary action: the title's link covers it. */}
              <Link
                href={nodeHref(n)}
                className="font-medium after:absolute after:inset-0 after:content-['']"
              >
                <Mark text={n.title} q={q} />
              </Link>
              {!project && pathOf(n) !== '' && (
                <div className="mt-[5px] text-[12px] leading-[1.45] text-muted">{pathOf(n)}</div>
              )}
              {/*
                When the title did not match, the row has to show what did, or
                it looks like a mistake. A window round the first hit in the
                description, cut on characters: the mark says where to look.
              */}
              {!titleHit && n.description && (
                <div className="mt-[5px] text-[12px] leading-[1.45] text-muted">
                  <Mark text={around(n.description, q, 140)} q={q} />
                </div>
              )}
            </td>
            <td>
              {blocked && st ? (
                <span className="tag tag-rust">Blocked {st.worst_wait}d</span>
              ) : (
                <span className="tag">{STATE_LABEL[n.status]}</span>
              )}
            </td>
            <td className="micro text-muted">{TYPE_LABEL[n.type]}</td>
            <td
              className={`mono text-right ${
                n.due_date === null ? 'text-muted' : overdue ? 'text-rust' : n.status === 'done' ? 'text-muted' : ''
              }`}
            >
              {n.due_date ? formatDate(n.due_date) : '-'}
            </td>
            <td className="text-right">
              <SearchMore items={more} label={n.title} />
            </td>
          </tr>
        )
      })}
    </tbody>
  )

  const NodeTable = ({ rows, project }: { rows: Node[]; project: boolean }) => (
    <>
      {/* Its own scroller at a narrow width: the page never scrolls sideways. */}
      <div className="panel grp-gap max-w-[1360px] overflow-x-auto">
        <table className="tbl">
          <thead>
            <tr>
              <th>Code</th>
              <th className="grow">{project ? 'Project' : 'Part'}</th>
              <th>State</th>
              <th>Type</th>
              <th className="text-right">Due</th>
              <th aria-label="Actions" />
            </tr>
          </thead>
          <NodeRows rows={rows} project={project} />
        </table>
      </div>
      <Held held={rows.length - CAP_TABLE} />
    </>
  )

  return (
    <main>
      {band}

      <div className="px-[var(--gut)] py-[26px]">
        <div className="work mx-auto">
          <SearchField q={typed} count={total} />

          {/* 26 px under the field, as the concept sets it. */}
          <div className="mt-[26px]">
            {total === 0 && <p className="prose-measure text-[15px] text-green-soft">Nothing matches that.</p>}

            {projectHits.length > 0 && (
              <>
                <GroupHead title="Projects" count={projectHits.length} first={first()} />
                <NodeTable rows={projectHits} project />
              </>
            )}

            {partHits.length > 0 && (
              <>
                <GroupHead title="Parts" count={partHits.length} first={first()} />
                <NodeTable rows={partHits} project={false} />
              </>
            )}

            {blockerHits.length > 0 && (
              <>
                <GroupHead title="Blockers" count={blockerHits.length} first={first()} />
                <div className="panel panel-list grp-gap max-w-[1120px]">
                  {blockerHits.slice(0, CAP_LIST).map((b) => {
                    const on = byId.get(b.node_id)
                    return (
                      <div key={b.id}>
                        <Link
                          href={on ? nodeHref(on) : '/blockers'}
                          className="flex items-start gap-3"
                        >
                          <span className="mono w-[1.1em] shrink-0 text-center text-rust">!</span>
                          <div className="min-w-0 flex-1">
                            <div className="leading-[1.5]">
                              <Mark text={b.title} q={q} />
                            </div>
                            <div className="mt-[5px] text-[12px] leading-[1.45] text-muted">
                              <Mark text={b.waiting_on} q={q} /> ·{' '}
                              {b.is_active
                                ? `${b.days_blocked} days`
                                : `closed after ${b.days_blocked} days`}
                              {on ? ` · ${on.title}` : ''}
                            </div>
                          </div>
                          <span className="micro shrink-0 pt-[3px] text-muted">
                            {formatDate(b.opened_at)}
                          </span>
                        </Link>
                      </div>
                    )
                  })}
                </div>
                <Held held={blockerHits.length - CAP_LIST} />
              </>
            )}

            {entryHits.length > 0 && (
              <>
                <GroupHead title="Log" count={entryHits.length} first={first()} />
                <div className="panel panel-list grp-gap max-w-[1120px]">
                  {entryHits.slice(0, CAP_LIST).map((e) => {
                    const on = byId.get(e.node_id)
                    return (
                      <div key={e.id}>
                        <Link
                          href={on ? nodeHref(on) : '/search'}
                          className="flex items-start gap-3"
                        >
                          <span className="mono w-[1.1em] shrink-0 text-center text-muted">·</span>
                          <div className="min-w-0 flex-1">
                            <div className="leading-[1.5]">
                              {/* A long line is cut round the hit, never at the start. */}
                              <Mark text={around(e.body, q, 220)} q={q} />
                            </div>
                            <div className="mt-[5px] text-[12px] leading-[1.45] text-muted">
                              {on ? on.title : 'Not visible to you'}
                            </div>
                          </div>
                          <span className="micro shrink-0 pt-[3px] text-muted">
                            {formatDate(e.entry_date)}
                          </span>
                        </Link>
                      </div>
                    )
                  })}
                </div>
                <Held held={entryHits.length - CAP_LIST} />
              </>
            )}

            {sparkHits.length > 0 && (
              <>
                <GroupHead title="Sparks" count={sparkHits.length} first={first()} />
                <div className="panel panel-list grp-gap max-w-[1120px]">
                  {sparkHits.slice(0, CAP_LIST).map((s) => (
                    <div key={s.id}>
                      {/* Assess is what a found spark is opened for, so the row goes there. */}
                      <Link href={`/spark?assess=${s.id}`} className="flex items-start gap-3">
                        <span className="mono w-[1.1em] shrink-0 text-center text-muted">○</span>
                        <div className="min-w-0 flex-1">
                          <div className="leading-[1.5]">
                            <Mark text={around(s.body, q, 180)} q={q} />
                          </div>
                          <div className="mt-[5px] text-[12px] leading-[1.45] text-muted">
                            {SPARK_STATE_LABEL[s.state]}
                            {s.note ? ' · ' : ''}
                            {s.note ? <Mark text={around(s.note, q, 90)} q={q} /> : null}
                          </div>
                        </div>
                        <span className="micro shrink-0 pt-[3px] text-muted">
                          {formatDate(s.captured_at.slice(0, 10))}
                        </span>
                      </Link>
                    </div>
                  ))}
                </div>
                <Held held={sparkHits.length - CAP_LIST} />
              </>
            )}

            {docHits.length > 0 && (
              <>
                <GroupHead title="Files" count={docHits.length} first={first()} />
                <div className="panel panel-list grp-gap max-w-[1120px]">
                  {docHits.slice(0, CAP_LIST).map((d) => {
                    const on = byId.get(d.node_id)
                    return (
                      <div key={d.id}>
                        {/* The row is the file: opening it is what it is for. */}
                        <a href={`/api/document/${d.id}`} className="flex items-start gap-3">
                          <Folder
                            size={20}
                            strokeWidth={1}
                            aria-hidden
                            className="mt-[3px] shrink-0 text-muted"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="leading-[1.5]">
                              <Mark text={d.name} q={q} />
                            </div>
                            <div className="mt-[5px] text-[12px] leading-[1.45] text-muted">
                              {d.folder ? <Mark text={d.folder} q={q} /> : null}
                              {d.folder && on ? ' · ' : ''}
                              {on ? on.title : null}
                            </div>
                          </div>
                          <span className="micro shrink-0 pt-[3px] text-muted">
                            {Math.round((d.size_bytes ?? 0) / 1024)} kB
                          </span>
                        </a>
                      </div>
                    )
                  })}
                </div>
                <Held held={docHits.length - CAP_LIST} />
              </>
            )}
          </div>
        </div>
      </div>
    </main>
  )
}
