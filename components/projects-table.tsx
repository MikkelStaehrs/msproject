import Link from 'next/link'
import { ProgressScale } from '@/components/ui'
import { ProjectsMenu } from '@/components/projects-menu'
import type { NodeStatus } from '@/lib/types'

/**
 * One project, reduced to what the browser compares.
 *
 * Every figure here is read from a view or walked from rows the page already
 * holds; nothing is worked out that a view answers. The sort keys are the
 * columns, so a column head can be a link to `?sort=` and nothing else.
 */
export type ProjectRow = {
  id: string
  /** The project number, or empty when nobody has registered it. */
  code: string
  title: string
  /** The first line of the description, already clipped at a word. */
  line: string
  status: NodeStatus
  /** A fraction, for sorting. The meter reads done and total. */
  progress: number
  done: number
  total: number
  /** ISO, or '9999' so a project with no date sorts last. */
  next: string
  nextLabel: string | null
  /** The longest open wait in the subtree, in days. Zero means nothing waits. */
  wait: number
  /** Who the open blockers wait on, each named once. */
  waitWho: string
  /** The strategies it is marked against, joined, or null when unmarked. */
  serves: string | null
  owner: string
}

export type ProjectGroup = {
  /** The joined strategy names, or null for the unmarked group. */
  key: string | null
  name: string
  /** The strategy's description, clipped, when the group is one strategy. */
  note: string | null
  rows: ProjectRow[]
}

export type SortKey =
  | 'code'
  | 'title'
  | 'status'
  | 'progress'
  | 'done'
  | 'next'
  | 'wait'
  | 'owner'

export const SORT_KEYS: SortKey[] = [
  'code',
  'title',
  'status',
  'progress',
  'done',
  'next',
  'wait',
  'owner',
]

const COLUMNS: [SortKey, string][] = [
  ['code', 'Code'],
  ['title', 'Project'],
  ['status', 'State'],
  ['progress', 'Progress'],
  ['done', 'Done'],
  ['next', 'Next date'],
  ['wait', 'Waiting on'],
  ['owner', 'Owner'],
]

/*
 * The concept's spelling of the six states. `STATUS_LABEL` in lib/types says
 * «Completed» where the board column and this table say «Done», and the two
 * screens are read together, so the table follows the board.
 */
export const STATE_LABEL: Record<NodeStatus, string> = {
  idea: 'Idea',
  planned: 'Planned',
  active: 'Active',
  paused: 'On hold',
  done: 'Done',
  cancelled: 'Cancelled',
}

export function ProjectsTable({
  groups,
  sort,
  dir,
  sortHref,
  editHref,
}: {
  groups: ProjectGroup[]
  sort: SortKey
  dir: 1 | -1
  /** The address that sorts by a column, flipping when it is the current one. */
  sortHref: (key: SortKey) => string
  /** The address that opens the edit form for a project, filters kept. */
  editHref: (id: string) => string
}) {
  const empty = groups.every((g) => g.rows.length === 0)

  return (
    <table className="tbl">
      <thead>
        <tr>
          {COLUMNS.map(([key, label]) => {
            const on = key === sort
            const numeric = key === 'done' || key === 'next'
            return (
              <th
                key={key}
                className={`${key === 'title' ? 'grow' : ''} ${numeric ? 'text-right' : ''}`}
                aria-sort={on ? (dir > 0 ? 'ascending' : 'descending') : undefined}
              >
                <Link href={sortHref(key)} className="hover:text-ink">
                  {label}
                  {on && <span className="ml-1 text-green">{dir > 0 ? '↑' : '↓'}</span>}
                </Link>
              </th>
            )
          })}
          <th aria-label="Actions" />
        </tr>
      </thead>
      <tbody>
        {empty ? (
          <tr>
            <td className="grow text-muted" colSpan={9}>
              No project matches those two filters.
            </td>
          </tr>
        ) : (
          groups.map((g) => (
            <GroupRows key={g.key ?? '__none'} group={g} editHref={editHref} />
          ))
        )}
      </tbody>
    </table>
  )
}

function GroupRows({
  group,
  editHref,
}: {
  group: ProjectGroup
  editHref: (id: string) => string
}) {
  return (
    <>
      {/*
        The group head sits on the page ground rather than the panel's, so it
        reads as a break in the table and not as one more row of it. The
        unmarked group is in rust because it is the one thing here a person
        has to fix: Budget cannot add up work that is not marked.
      */}
      <tr>
        <td
          colSpan={9}
          className="grow !bg-paper !border-b-line-strong !px-3.5 !pb-2.5 !pt-4"
        >
          <span className="float-right mono text-[12px] text-muted">{group.rows.length}</span>
          <span
            className={`mr-3 text-[15px] font-semibold tracking-[-0.02em] ${
              group.key === null ? 'text-rust' : ''
            }`}
          >
            {group.name}
          </span>
          {group.note && <span className="text-[12px] text-muted">{group.note}</span>}
        </td>
      </tr>

      {group.rows.map((r) => {
        const closed = r.status === 'done' || r.status === 'cancelled'
        return (
          <tr key={r.id} className={`relative ${closed ? 'text-muted' : ''}`}>
            {/*
              An absent number is the signal, not a blank. It means the work
              exists here and has not been registered in the company system,
              which is a thing a project manager gets asked about.
            */}
            <td className="mono text-[12px] text-muted">
              {r.code !== '' ? r.code : <span className="text-rust">Not registered</span>}
            </td>
            <td className="grow">
              {/*
                The row is the primary action, so the title's link is stretched
                over the whole row with a pseudo element. The overflow at the
                end sits above it with its own stacking.
              */}
              <Link
                href={`/p/${r.id}/identitet`}
                className={`font-medium after:absolute after:inset-0 after:content-[''] ${
                  closed ? 'line-through decoration-line-strong' : ''
                }`}
              >
                {r.title}
              </Link>
              {r.line !== '' && (
                <div className="mt-[5px] text-[12px] leading-[1.45] text-muted">{r.line}</div>
              )}
            </td>
            <td>
              <span className="tag">{STATE_LABEL[r.status]}</span>
            </td>
            <td>
              <span className="flex w-[96px]">
                <ProgressScale done={r.done} total={r.total} />
              </span>
            </td>
            <td className="mono text-right text-muted">
              {r.done} of {r.total}
            </td>
            <td className={`mono text-right ${r.nextLabel ? '' : 'text-muted'}`}>
              {r.nextLabel ?? '-'}
            </td>
            <td>
              {r.wait > 0 ? (
                <>
                  <span className="mono text-rust">{r.wait}d</span> {r.waitWho}
                </>
              ) : (
                <span className="text-muted">Nothing</span>
              )}
            </td>
            <td className="text-muted">{r.owner}</td>
            <td className="text-right">
              <ProjectsMenu id={r.id} editHref={editHref(r.id)} />
            </td>
          </tr>
        )
      })}
    </>
  )
}
