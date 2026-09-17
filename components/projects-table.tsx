import Link from 'next/link'
import { ProgressScale } from '@/components/ui'
import { OverviewMore } from '@/components/overview-more'
import { deleteNode, moveNodeInOrder } from '@/lib/node-actions'
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

/*
 * The sort keys are the columns and only the columns. The project number is
 * not among them: it reads under the title rather than in a column of its
 * own, because nine tracks do not fit a laptop and a browser that scrolls
 * sideways is a browser you cannot compare in.
 */
export type SortKey =
  | 'title'
  | 'status'
  | 'progress'
  | 'done'
  | 'next'
  | 'wait'
  | 'owner'

export const SORT_KEYS: SortKey[] = [
  'title',
  'status',
  'progress',
  'done',
  'next',
  'wait',
  'owner',
]

/* The heads, in column order. «Driver» is what this application calls owner. */
const COLUMNS: [SortKey, string][] = [
  ['title', 'Project'],
  ['status', 'State'],
  ['progress', 'Progress'],
  ['done', 'Done'],
  ['next', 'Next date'],
  ['wait', 'Waiting on'],
  ['owner', 'Driver'],
]

/*
 * One stair, as the house rules have it: one column on a phone, the fixed
 * measures beside the title from `lg` and never before.
 */
const COLS =
  'lg:grid-cols-[minmax(0,1fr)_104px_120px_92px_104px_170px_120px_44px]'

/* Which of the fixed columns read as figures and sit right. */
const RIGHT = new Set<SortKey>(['done', 'next'])

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
  here,
}: {
  groups: ProjectGroup[]
  sort: SortKey
  dir: 1 | -1
  /** The address that sorts by a column, flipping when it is the current one. */
  sortHref: (key: SortKey) => string
  /** The address that opens the edit form for a project, filters kept. */
  editHref: (id: string) => string
  /** Where a move or a delete comes back to, filters kept. */
  here: string
}) {
  const empty = groups.every((g) => g.rows.length === 0)

  return (
    <div className="text-[13px]">
      {/*
        The heads are the sort switches and nothing else. They are gone on a
        phone, where each measure carries its own label instead.
      */}
      <div className={`hidden lg:grid ${COLS} border-b border-line-strong`}>
        {COLUMNS.map(([key, label]) => {
          const on = key === sort
          return (
            <div
              key={key}
              className={`px-[14px] py-2 ${RIGHT.has(key) ? 'text-right' : ''}`}
              aria-sort={on ? (dir > 0 ? 'ascending' : 'descending') : undefined}
            >
              <Link href={sortHref(key)} className="micro text-muted hover:text-ink">
                {label}
                {on && <span className="ml-1 text-green">{dir > 0 ? '↑' : '↓'}</span>}
              </Link>
            </div>
          )
        })}
        <div />
      </div>

      {empty ? (
        <p className="m-0 px-[14px] py-3 text-muted">No project matches those two filters.</p>
      ) : (
        groups.map((g) => (
          <GroupRows
            key={g.key ?? '__none'}
            group={g}
            editHref={editHref}
            here={here}
          />
        ))
      )}
    </div>
  )
}

function GroupRows({
  group,
  editHref,
  here,
}: {
  group: ProjectGroup
  editHref: (id: string) => string
  here: string
}) {
  return (
    <>
      {/*
        The group head sits on the page ground rather than the panel's, so it
        reads as a break in the table and not as one more row of it. The
        unmarked group is in rust because it is the one thing here a person
        has to fix: Budget cannot add up work that is not marked.
      */}
      <div className="flex items-baseline gap-3 border-b border-line-strong bg-paper px-[14px] pb-2.5 pt-4">
        <span
          className={`text-[15px] font-semibold tracking-[-0.02em] ${
            group.key === null ? 'text-rust' : ''
          }`}
        >
          {group.name}
        </span>
        {group.note && (
          <span className="min-w-0 flex-1 truncate text-[12px] text-muted">{group.note}</span>
        )}
        <span className="mono ml-auto text-[12px] text-muted">{group.rows.length}</span>
      </div>

      {group.rows.map((r) => {
        const closed = r.status === 'done' || r.status === 'cancelled'
        return (
          <div
            key={r.id}
            className={`relative grid grid-cols-1 ${COLS} border-b border-line last:border-b-0 hover:bg-hover ${
              closed ? 'text-muted' : ''
            }`}
          >
            <div className="min-w-0 px-[14px] py-2">
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
              {/*
                An absent number is said rather than left blank: the work
                exists here and has not been registered in the company
                system, which is a thing a project manager gets asked about.
              */}
              <div className="mt-[5px] text-[12px] leading-[1.45] text-muted">
                <span className="mono">{r.code !== '' ? r.code : 'no number'}</span>
                {r.line !== '' && <> · {r.line}</>}
              </div>
            </div>

            {/*
              Stacked on a phone, each measure carrying the label the column
              head would have given it; `contents` at desk width, so the
              column grid lays them out untouched.
            */}
            <div className="flex flex-wrap items-baseline gap-x-7 gap-y-2 px-[14px] pb-3 lg:contents">
              <div className="lg:px-[14px] lg:py-2">
                <span className="tag">{STATE_LABEL[r.status]}</span>
              </div>
              <div className="flex items-center gap-3 lg:px-[14px] lg:py-2">
                <span className="micro text-muted lg:hidden">Progress</span>
                <span className="flex w-[92px] max-w-full">
                  <ProgressScale done={r.done} total={r.total} />
                </span>
              </div>
              <div className="mono text-muted lg:px-[14px] lg:py-2 lg:text-right">
                <span className="micro mr-3 lg:hidden">Done</span>
                {r.done} of {r.total}
              </div>
              <div
                className={`mono lg:px-[14px] lg:py-2 lg:text-right ${
                  r.nextLabel ? '' : 'text-muted'
                }`}
              >
                <span className="micro mr-3 text-muted lg:hidden">Next</span>
                {r.nextLabel ?? 'None'}
              </div>
              <div className="min-w-0 lg:px-[14px] lg:py-2">
                <span className="micro mr-3 text-muted lg:hidden">Waiting on</span>
                {r.wait > 0 ? (
                  <>
                    <span className="mono text-rust">{r.wait}d</span> {r.waitWho}
                  </>
                ) : (
                  <span className="text-muted">Nothing</span>
                )}
              </div>
              <div className="min-w-0 truncate text-muted lg:px-[14px] lg:py-2">
                <span className="micro mr-3 lg:hidden">Driver</span>
                {r.owner}
              </div>
              <div className="lg:px-[9px] lg:py-2">
                <OverviewMore
                  label={r.title}
                  items={[
                    { label: 'Open', href: `/p/${r.id}/identitet` },
                    { label: 'Edit', href: editHref(r.id) },
                    { label: 'Write a line', nodeId: r.id },
                    { label: 'Add a part', href: `/p/${r.id}?new=${r.id}` },
                    { label: 'Record a decision', href: `/p/${r.id}?dnew=${r.id}` },
                    {
                      label: 'Move up',
                      action: moveNodeInOrder,
                      fields: { id: r.id, direction: 'up', redirectTo: here },
                    },
                    {
                      label: 'Move down',
                      action: moveNodeInOrder,
                      fields: { id: r.id, direction: 'down', redirectTo: here },
                    },
                    {
                      label: 'Delete',
                      danger: true,
                      action: deleteNode,
                      fields: { id: r.id, redirectTo: here },
                      confirm: `Delete ${r.title}, everything under it, and every line, blocker, decision and file that hangs off it? This cannot be undone.`,
                    },
                  ]}
                />
              </div>
            </div>
          </div>
        )
      })}
    </>
  )
}
