'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'

/**
 * The project rail. Three things and nothing else: the project, the four
 * states it can be read in, and the tree.
 *
 * It replaced a row of nine tabs. Nine peers in one voice made you learn the
 * whole project page before you could use any of it, and it left no room for
 * the one question the page has to answer at all times, which is where in the
 * tree you are standing.
 *
 * The five that left are not gone, they moved under the state they belong to:
 * the brief and the report archive are ways of reading the project, and the
 * basis is the specification of the same cost lines Economics totals. They
 * appear under their state when you are in it, so the rail stays four lines
 * tall until you need more.
 *
 * A letter carries the type, because at four levels deep indentation alone
 * stops being readable: P for the project, S for a subproject that divides,
 * D for a development that builds, T for a task, which is the only one that
 * counts as work.
 */

export type RailNode = {
  id: string
  parent_id: string | null
  title: string
  type: string
  status: string
}

export type RailCount = { node_id: string; leaf_total: number; leaf_done: number }

const STATES: [string, string, string, [string, string][]][] = [
  // suffix, label, href suffix, sub links under it
  ['', 'Work', '', []],
  ['/identitet', 'Read', '/identitet', [['/brief', 'Brief'], ['/rapporter', 'Reports']]],
  ['/dokumenter', 'Files', '/dokumenter', []],
  ['/cost', 'Economics', '/cost', [['/grundlag', 'Basis']]],
]

/** Work is the one that follows a focused part; the rest describe the project. */
const FOLLOWS_FOCUS = new Set(['', '/cost', '/grundlag'])

function letterOf(type: string) {
  return (type || '?').charAt(0).toUpperCase()
}

export function ProjectNav({
  base,
  projectId,
  projectTitle,
  projectNo,
  place,
  nodes,
  counts,
  blocked,
}: {
  base: string
  projectId: string
  projectTitle: string
  projectNo: string | null
  place: string | null
  nodes: RailNode[]
  counts: RailCount[]
  /** Open waiting days per node, its own, so the rail can show where it hurts. */
  blocked: Record<string, number>
}) {
  const pathname = usePathname()
  const search = useSearchParams()
  const focus = search.get('focus')
  const currentId = focus ?? projectId

  const count = new Map(counts.map((c) => [c.node_id, c]))
  const kids = new Map<string, RailNode[]>()
  for (const n of nodes) {
    if (n.parent_id === null) continue
    kids.set(n.parent_id, [...(kids.get(n.parent_id) ?? []), n])
  }

  /*
   * Containers always, plus the tasks of wherever you are standing. The whole
   * tree would be every leaf as well, and those are already on the board in
   * front of you; this way the rail stays a table of contents rather than a
   * second copy of the work.
   */
  const rows: { n: RailNode; depth: number; box: boolean }[] = []
  const walk = (parentId: string, depth: number) => {
    for (const n of kids.get(parentId) ?? []) {
      const box = (kids.get(n.id) ?? []).length > 0
      if (box || parentId === currentId) rows.push({ n, depth, box })
      if (box) walk(n.id, depth + 1)
    }
  }
  walk(projectId, 0)

  const href = (suffix: string) =>
    focus && FOLLOWS_FOCUS.has(suffix) ? `${base}${suffix}?focus=${focus}` : `${base}${suffix}`

  const root = count.get(projectId)

  return (
    <nav className="px-5 py-5 lg:py-7 lg:pl-8 lg:pr-5">
      {/*
        The rail names the project, the page names what you are looking at. On a
        part those are two different things; on the project root they are the
        same words, and set at display size in both places it read as the title
        printed twice. So this is furniture: the heading weight belongs to the
        page, and the rail is the label on the drawer.
      */}
      <div className="text-[15px] font-semibold leading-snug text-ink">{projectTitle}</div>
      <div className="lbl mt-1.5 text-muted">
        {projectNo ?? 'no number'}
        {place ? ` · ${place}` : ''}
      </div>

      {/*
        A row on a phone, a column from lg. Four states do fit on 390 px, which
        is exactly why there are four of them and not nine.
      */}
      <div className="mt-5 flex w-max gap-5 lg:mt-7 lg:w-auto lg:flex-col lg:gap-0">
        {STATES.map(([suffix, label, target, subs]) => {
          const current =
            suffix === '' ? pathname === base : pathname.startsWith(`${base}${suffix}`)
          return (
            <div key={label}>
              <Link
                href={href(target)}
                aria-current={current ? 'page' : undefined}
                className={`block py-1 text-[15px] ${
                  current ? 'font-semibold text-green' : 'text-muted hover:text-ink'
                }`}
              >
                {label}
              </Link>
              {current && subs.length > 0 && (
                <div className="hidden gap-4 pb-1 pl-3 lg:flex">
                  {subs.map(([s, l]) => (
                    <Link
                      key={s}
                      href={href(s)}
                      className="micro text-muted hover:text-ink"
                    >
                      {l}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* The tree. Hidden on a phone, where the page itself is the tree. */}
      <div className="mt-7 hidden border-t border-rule pt-4 lg:block">
        <Link
          href={base}
          className={`flex items-baseline gap-2 py-[5px] text-[13px] ${
            currentId === projectId ? 'font-semibold text-green' : 'text-green-soft hover:text-ink'
          }`}
        >
          <span className="mono w-[9px] shrink-0 text-center text-[9.5px] text-rule-strong">
            P
          </span>
          <span className="min-w-0 flex-1 truncate">All parts</span>
          <span className="mono shrink-0 text-[10px] text-muted">
            {root ? `${root.leaf_done}/${root.leaf_total}` : ''}
          </span>
        </Link>

        {rows.map(({ n, depth, box }) => {
          const c = count.get(n.id)
          const wait = blocked[n.id]
          const here = n.id === currentId
          return (
            <Link
              key={n.id}
              href={`${base}?focus=${n.id}`}
              style={{ paddingLeft: `${depth * 14}px` }}
              className={`flex items-baseline gap-2 py-[5px] ${
                box ? 'text-[13px]' : 'text-[12px]'
              } ${
                here
                  ? 'font-semibold text-green'
                  : box
                    ? 'text-green-soft hover:text-ink'
                    : 'text-muted hover:text-ink'
              }`}
            >
              <span
                className={`mono w-[9px] shrink-0 text-center text-[9.5px] ${
                  here ? 'text-green' : 'text-rule-strong'
                }`}
              >
                {letterOf(n.type)}
              </span>
              <span className="min-w-0 flex-1 truncate">{n.title}</span>
              {wait ? (
                <span className="mono shrink-0 text-[10px] text-oxblood">{wait}d</span>
              ) : box && c ? (
                <span className="mono shrink-0 text-[10px] text-muted">
                  {c.leaf_done}/{c.leaf_total}
                </span>
              ) : n.status === 'done' ? (
                <span className="mono shrink-0 text-[10px] text-muted">✓</span>
              ) : null}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
